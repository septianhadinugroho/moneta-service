import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// HELPER: Memastikan Kategori Sistem Utang/Piutang selalu ada
const getSystemDebtCategory = async (
  tx: any,
  name: string,
  type: 'INCOME' | 'EXPENSE',
  icon: string,
  color: string
) => {
  let category = await tx.category.findFirst({
    where: { userId: null, name, type },
  });

  if (!category) {
    category = await tx.category.create({
      data: {
        userId: null, // Kategori default system
        name,
        type,
        icon,
        color,
      },
    });
  }

  return category.id;
};

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

    const allUserDebts = await prisma.debt.findMany({ where: { userId } });

    let totalLoanRemaining = 0;
    let totalDebtRemaining = 0;

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

    if (!type || !personName || !amount || Number(amount) <= 0 || !walletId) {
      return res.status(400).json({
        success: false,
        message: 'Tipe, nama pihak terkait, nominal valid, dan dompet wajib diisi!',
      });
    }

    const numAmount = Number(amount);

    const targetWallet = await prisma.wallet.findUnique({ where: { id: Number(walletId) } });
    if (!targetWallet || targetWallet.userId !== userId) {
      return res.status(400).json({ success: false, message: 'Dompet tidak ditemukan atau tidak valid' });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const isLoan = type === 'LOAN';

        const categoryId = isLoan
          ? await getSystemDebtCategory(tx, 'Piutang', 'EXPENSE', 'HandCoins', '#10b981')
          : await getSystemDebtCategory(tx, 'Utang', 'INCOME', 'HandCoins', '#3b82f6');

        await tx.wallet.update({
          where: { id: Number(walletId) },
          data: { balance: isLoan ? { decrement: numAmount } : { increment: numAmount } },
        });

        const newTx = await tx.transaction.create({
          data: {
            userId,
            walletId: Number(walletId),
            categoryId,
            amount: numAmount,
            type: isLoan ? 'EXPENSE' : 'INCOME',
            description: isLoan ? `Pinjaman diberikan ke ${personName}` : `Pinjaman diterima dari ${personName}`,
          },
        });

        const newDebt = await tx.debt.create({
          data: {
            userId,
            type,
            personName,
            amount: numAmount,
            dueDate: dueDate ? new Date(dueDate) : null,
            walletId: Number(walletId),
            transactionId: newTx.id,
            notes,
          },
        });

        return newDebt;
      },
      { maxWait: 10000, timeout: 15000 }
    );

    return res.status(201).json({ success: true, message: 'Catatan berhasil dibuat', data: result });
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
      return res.status(400).json({ success: false, message: 'Nominal & dompet wajib diisi' });
    }

    const debt = await prisma.debt.findUnique({ where: { id: debtId } });
    if (!debt || debt.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Utang/piutang tidak ditemukan' });
    }

    await prisma.$transaction(
      async (tx) => {
        const isLoan = debt.type === 'LOAN';

        const categoryId = isLoan
          ? await getSystemDebtCategory(tx, 'Pelunasan Piutang', 'INCOME', 'HandCoins', '#10b981')
          : await getSystemDebtCategory(tx, 'Pembayaran Utang', 'EXPENSE', 'HandCoins', '#f43f5e');

        await tx.wallet.update({
          where: { id: Number(walletId) },
          data: { balance: isLoan ? { increment: payVal } : { decrement: payVal } },
        });

        const newTx = await tx.transaction.create({
          data: {
            userId,
            walletId: Number(walletId),
            categoryId,
            amount: payVal,
            type: isLoan ? 'INCOME' : 'EXPENSE',
            description: isLoan
              ? `Pelunasan piutang dari ${debt.personName}${notes ? ` (${notes})` : ''}`
              : `Pembayaran utang ke ${debt.personName}${notes ? ` (${notes})` : ''}`,
          },
        });

        await tx.debtPayment.create({
          data: {
            debtId,
            walletId: Number(walletId),
            transactionId: newTx.id,
            amount: payVal,
            notes,
          },
        });

        const newPaidAmount = Number(debt.paidAmount) + payVal;
        const isFullyPaid = newPaidAmount >= Number(debt.amount);

        await tx.debt.update({
          where: { id: debtId },
          data: {
            paidAmount: newPaidAmount,
            status: isFullyPaid ? 'PAID' : 'PARTIAL',
          },
        });
      },
      { maxWait: 10000, timeout: 15000 }
    );

    return res.status(200).json({ success: true, message: 'Pembayaran berhasil dicatat' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. UPDATE DEBT (Revert Saldo Lama + Apply Saldo Dompet Baru)
export const updateDebt = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const debtId = Number(req.params.id);
    const { personName, amount, dueDate, walletId, notes, type } = req.body;

    const debt = await prisma.debt.findUnique({
      where: { id: debtId },
    });

    if (!debt || debt.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Data utang/piutang tidak ditemukan' });
    }

    const newAmount = amount ? Number(amount) : Number(debt.amount);
    const newWalletId = walletId ? Number(walletId) : debt.walletId;
    const newType = type || debt.type;

    await prisma.$transaction(
      async (tx) => {
        // 1. REVERT SALDO DOMPET LAMA (JIKA ADA TRANSAKSI AWAL)
        if (debt.transactionId) {
          const oldTx = await tx.transaction.findUnique({ where: { id: debt.transactionId } });
          if (oldTx) {
            const rollbackOld = oldTx.type === 'INCOME' ? -Number(oldTx.amount) : Number(oldTx.amount);
            await tx.wallet.update({
              where: { id: oldTx.walletId },
              data: { balance: { increment: rollbackOld } },
            });
          }
        }

        // 2. POTONG/TAMBAH SALDO DOMPET BARU
        if (newWalletId) {
          const isLoan = newType === 'LOAN';
          const newBalanceChange = isLoan ? -newAmount : newAmount;

          await tx.wallet.update({
            where: { id: newWalletId },
            data: { balance: { increment: newBalanceChange } },
          });

          // UPDATE RECORD TRANSAKSI TERIKAT
          if (debt.transactionId) {
            const categoryId = isLoan
              ? await getSystemDebtCategory(tx, 'Piutang', 'EXPENSE', 'HandCoins', '#10b981')
              : await getSystemDebtCategory(tx, 'Utang', 'INCOME', 'HandCoins', '#3b82f6');

            await tx.transaction.update({
              where: { id: debt.transactionId },
              data: {
                walletId: newWalletId,
                categoryId,
                amount: newAmount,
                type: isLoan ? 'EXPENSE' : 'INCOME',
                description: isLoan ? `Pinjaman diberikan ke ${personName}` : `Pinjaman diterima dari ${personName}`,
              },
            });
          }
        }

        // 3. UPDATE DATA UTANG/PIUTANG
        const updated = await tx.debt.update({
          where: { id: debtId },
          data: {
            type: newType,
            personName,
            amount: newAmount,
            dueDate: dueDate ? new Date(dueDate) : null,
            walletId: newWalletId,
            notes,
          },
        });

        return updated;
      },
      { maxWait: 10000, timeout: 15000 }
    );

    return res.status(200).json({
      success: true,
      message: 'Catatan utang/piutang dan saldo dompet berhasil diperbarui',
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

    const debt = await prisma.debt.findUnique({
      where: { id: debtId },
      include: { payments: true },
    });

    if (!debt || debt.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Data utang/piutang tidak ditemukan' });
    }

    await prisma.$transaction(
      async (tx) => {
        if (debt.transactionId) {
          const mainTx = await tx.transaction.findUnique({ where: { id: debt.transactionId } });
          if (mainTx) {
            const rollbackAmount = mainTx.type === 'INCOME' ? -Number(mainTx.amount) : Number(mainTx.amount);
            await tx.wallet.update({
              where: { id: mainTx.walletId },
              data: { balance: { increment: rollbackAmount } },
            });
            await tx.transaction.delete({ where: { id: mainTx.id } });
          }
        }

        for (const payment of debt.payments) {
          if (payment.transactionId) {
            const payTx = await tx.transaction.findUnique({ where: { id: payment.transactionId } });
            if (payTx) {
              const rollbackAmount = payTx.type === 'INCOME' ? -Number(payTx.amount) : Number(payTx.amount);
              await tx.wallet.update({
                where: { id: payTx.walletId },
                data: { balance: { increment: rollbackAmount } },
              });
              await tx.transaction.delete({ where: { id: payTx.id } });
            }
          }
        }

        await tx.debt.delete({ where: { id: debtId } });
      },
      { maxWait: 10000, timeout: 15000 }
    );

    return res.status(200).json({ success: true, message: 'Catatan utang/piutang berhasil dihapus' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};