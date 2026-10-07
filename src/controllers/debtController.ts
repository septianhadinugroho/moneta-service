import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 1. GET ALL DEBTS & LOANS (Dengan Summary)
export const getDebts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { type, status } = req.query;

    const whereClause: any = { userId };
    if (type) whereClause.type = String(type).toUpperCase();
    if (status) whereClause.status = String(status).toUpperCase();

    const debts = await prisma.debt.findMany({
      where: whereClause,
      include: {
        wallet: { select: { id: true, name: true, type: true } },
        payments: {
          include: { wallet: { select: { id: true, name: true } } },
          orderBy: { paymentDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Ringkasan Total Utang & Piutang
    const allUserDebts = await prisma.debt.findMany({ where: { userId } });
    
    let totalLoanRemaining = 0; // Total Piutang Belum Terbayar
    let totalDebtRemaining = 0; // Total Utang Belum Terbayar

    allUserDebts.forEach((item) => {
      const remaining = Number(item.amount) - Number(item.paidAmount);
      if (item.type === 'LOAN') {
        totalLoanRemaining += remaining;
      } else {
        totalDebtRemaining += remaining;
      }
    });

    return res.status(200).json({
      success: true,
      summary: {
        totalLoanRemaining,
        totalDebtRemaining,
      },
      data: debts,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. CREATE DEBT OR LOAN
export const createDebt = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { type, personName, amount, dueDate, walletId, notes } = req.body;

    if (!type || !personName || !amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Tipe, nama pihak terkait, dan nominal valid wajib diisi',
      });
    }

    const numAmount = Number(amount);

    // CEK DOMPET DI LUAR TRANSAKSI (SANGAT MEMPERCEPAT WAKTU TRANSAKSI)
    if (walletId) {
      const targetWallet = await prisma.wallet.findUnique({ where: { id: Number(walletId) } });
      if (!targetWallet || targetWallet.userId !== userId) {
        return res.status(400).json({
          success: false,
          message: 'Dompet tidak ditemukan atau tidak valid',
        });
      }
    }

    // TRANSAKSI HANYA FOKUS PADA PENULISAN (WRITE)
    const result = await prisma.$transaction(
      async (tx) => {
        const newDebt = await tx.debt.create({
          data: {
            userId,
            type,
            personName,
            amount: numAmount,
            dueDate: dueDate ? new Date(dueDate) : null,
            walletId: walletId ? Number(walletId) : null,
            notes,
          },
        });

        if (walletId) {
          if (type === 'LOAN') {
            // Memberi Pinjaman ke Orang -> Saldo Dompet Berkurang (EXPENSE)
            await tx.wallet.update({
              where: { id: Number(walletId) },
              data: { balance: { decrement: numAmount } },
            });

            await tx.transaction.create({
              data: {
                userId,
                walletId: Number(walletId),
                amount: numAmount,
                type: 'EXPENSE',
                description: `Pinjaman diberikan ke ${personName}`,
              },
            });
          } else if (type === 'DEBT') {
            // Menerima Pinjaman dari Orang -> Saldo Dompet Bertambah (INCOME)
            await tx.wallet.update({
              where: { id: Number(walletId) },
              data: { balance: { increment: numAmount } },
            });

            await tx.transaction.create({
              data: {
                userId,
                walletId: Number(walletId),
                amount: numAmount,
                type: 'INCOME',
                description: `Pinjaman diterima dari ${personName}`,
              },
            });
          }
        }

        return newDebt;
      },
      {
        maxWait: 10000, // Maksimal tunggu koneksi 10 detik
        timeout: 15000,  // Maksimal waktu eksekusi transaksi 15 detik
      }
    );

    return res.status(201).json({
      success: true,
      message: 'Catatan utang/piutang berhasil dibuat',
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. PAY / INSTALLMENT (BAYAR CICILAN ATAU PELUNASAN)
export const payDebt = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const debtId = Number(req.params.id);
    const { amount, walletId, notes } = req.body;

    const payVal = Number(amount);
    if (!payVal || payVal <= 0 || !walletId) {
      return res.status(400).json({
        success: false,
        message: 'Nominal pembayaran dan dompet wajib diisi',
      });
    }

    // PENGECEKAN KELAYAKAN DI LUAR TRANSAKSI
    const debt = await prisma.debt.findUnique({ where: { id: debtId } });
    if (!debt || debt.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Data utang/piutang tidak ditemukan' });
    }

    const remaining = Number(debt.amount) - Number(debt.paidAmount);
    if (payVal > remaining) {
      return res.status(400).json({
        success: false,
        message: `Nominal bayar melebihi sisa kewajiban (${remaining})`,
      });
    }

    const targetWallet = await prisma.wallet.findUnique({ where: { id: Number(walletId) } });
    if (!targetWallet || targetWallet.userId !== userId) {
      return res.status(400).json({ success: false, message: 'Dompet tidak valid' });
    }

    // BLOK TRANSAKSI PENULISAN DENGAN TIMEOUT DISESUAIKAN
    await prisma.$transaction(
      async (tx) => {
        // 1. Buat Record Pembayaran DebtPayment
        await tx.debtPayment.create({
          data: {
            debtId,
            walletId: Number(walletId),
            amount: payVal,
            notes,
          },
        });

        // 2. Update Status & Paid Amount pada Debt
        const newPaidAmount = Number(debt.paidAmount) + payVal;
        const isFullyPaid = newPaidAmount >= Number(debt.amount);
        const newStatus = isFullyPaid ? 'PAID' : 'PARTIAL';

        await tx.debt.update({
          where: { id: debtId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
          },
        });

        // 3. Update Saldo Dompet & Catat Transaksi
        if (debt.type === 'LOAN') {
          // Menerima Pelunasan Piutang -> Saldo Bertambah (INCOME)
          await tx.wallet.update({
            where: { id: Number(walletId) },
            data: { balance: { increment: payVal } },
          });

          await tx.transaction.create({
            data: {
              userId,
              walletId: Number(walletId),
              amount: payVal,
              type: 'INCOME',
              description: `Pelunasan piutang dari ${debt.personName}${notes ? ` (${notes})` : ''}`,
            },
          });
        } else if (debt.type === 'DEBT') {
          // Membayar Utang Kita -> Saldo Berkurang (EXPENSE)
          await tx.wallet.update({
            where: { id: Number(walletId) },
            data: { balance: { decrement: payVal } },
          });

          await tx.transaction.create({
            data: {
              userId,
              walletId: Number(walletId),
              amount: payVal,
              type: 'EXPENSE',
              description: `Pembayaran utang ke ${debt.personName}${notes ? ` (${notes})` : ''}`,
            },
          });
        }
      },
      {
        maxWait: 10000,
        timeout: 15000,
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Pembayaran berhasil dicatat dan saldo dompet telah diperbarui',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. UPDATE DEBT
export const updateDebt = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const debtId = Number(req.params.id);
    const { personName, amount, dueDate, walletId, notes } = req.body;

    const debt = await prisma.debt.findUnique({ where: { id: debtId } });
    if (!debt || debt.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    }

    const updated = await prisma.debt.update({
      where: { id: debtId },
      data: {
        personName,
        amount: amount ? Number(amount) : undefined,
        dueDate: dueDate ? new Date(dueDate) : null,
        walletId: walletId ? Number(walletId) : null,
        notes,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Catatan berhasil diperbarui',
      data: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 5. DELETE DEBT (Dengan Revert Saldo & Hapus Transaksi Terkait)
export const deleteDebt = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const debtId = Number(req.params.id);

    // Ambil data utang beserta riwayat cicilan/pembayarannya
    const debt = await prisma.debt.findUnique({
      where: { id: debtId },
      include: { payments: true },
    });

    if (!debt || debt.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Data utang/piutang tidak ditemukan' });
    }

    await prisma.$transaction(
      async (tx) => {
        // A. REVERT SALDO DARI PEMBUATAN AWAL UTANG/PIUTANG
        if (debt.walletId) {
          if (debt.type === 'LOAN') {
            // Dulu Piutang memotong saldo -> Saat dihapus, kembalikan saldo (INCREMENT)
            await tx.wallet.update({
              where: { id: debt.walletId },
              data: { balance: { increment: Number(debt.amount) } },
            });
          } else if (debt.type === 'DEBT') {
            // Dulu Utang menambah saldo -> Saat dihapus, kurangi saldo kembali (DECREMENT)
            await tx.wallet.update({
              where: { id: debt.walletId },
              data: { balance: { decrement: Number(debt.amount) } },
            });
          }
        }

        // B. REVERT SALDO DARI SETIAP CICILAN/PELUNASAN YANG PERNAH DILAKUKAN
        for (const payment of debt.payments) {
          if (debt.type === 'LOAN') {
            // Cicilan piutang dulu menambah saldo -> Kurangi kembali
            await tx.wallet.update({
              where: { id: payment.walletId },
              data: { balance: { decrement: Number(payment.amount) } },
            });
          } else if (debt.type === 'DEBT') {
            // Cicilan utang dulu memotong saldo -> Kembalikan kembali
            await tx.wallet.update({
              where: { id: payment.walletId },
              data: { balance: { increment: Number(payment.amount) } },
            });
          }
        }

        // C. HAPUS TRANSAKSI OTOMATIS YANG TERKAIAT DENGAN UTANG/PIUTANG INI
        // (Menghapus riwayat transaksi dengan deskripsi mengandung nama pihak terkait)
        const matchKeyword = debt.personName;
        await tx.transaction.deleteMany({
          where: {
            userId,
            OR: [
              { description: { contains: `ke ${matchKeyword}` } },
              { description: { contains: `dari ${matchKeyword}` } },
            ],
          },
        });

        // D. HAPUS DATA UTANG & PAYMENT-NYA (CASCADE)
        await tx.debt.delete({
          where: { id: debtId },
        });
      },
      {
        maxWait: 10000,
        timeout: 15000,
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Catatan utang/piutang berhasil dihapus, saldo dompet dan riwayat transaksi telah dikembalikan',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};