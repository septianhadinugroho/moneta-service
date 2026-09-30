import { Request, Response } from 'express';
import prisma from '../config/db.js';

// 1. GET TRANSACTIONS
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { month, year, walletId, categoryId, limit = 50 } = req.query;

  try {
    const whereCondition: any = { userId };

    if (walletId) whereCondition.walletId = Number(walletId);
    if (categoryId) whereCondition.categoryId = Number(categoryId);

    if (month && year) {
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);
      whereCondition.date = { gte: startDate, lte: endDate };
    }

    const transactions = await prisma.transaction.findMany({
      where: whereCondition,
      include: {
        wallet: { select: { id: true, name: true, color: true } },
        ...(prisma as any).transaction.fields?.destinationWalletId ? { destinationWallet: { select: { id: true, name: true, color: true } } } : {},
        category: { select: { id: true, name: true, icon: true, color: true, type: true } },
      } as any,
      orderBy: { date: 'desc' },
      take: Number(limit),
    });

    res.status(200).json({ success: true, data: transactions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. CREATE TRANSACTION (INCOME, EXPENSE, & TRANSFER)
export const createTransaction = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { walletId, destinationWalletId, categoryId, amount, type, description, notes, date } = req.body;

  if (!walletId || !amount || !type) {
    res.status(400).json({
      success: false,
      message: 'Wallet ID, Amount, dan Type wajib diisi',
    });
    return;
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ success: false, message: 'Nominal transaksi harus bernilai positif' });
    return;
  }

  const txType = String(type).toUpperCase();
  const noteText = notes || description || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findFirst({
        where: { id: Number(walletId), userId },
      });

      if (!wallet) throw new Error('Dompet asal tidak ditemukan');

      // HANDLER TIPE TRANSFER
      if (txType === 'TRANSFER') {
        if (!destinationWalletId) throw new Error('Dompet tujuan wajib dipilih');
        if (Number(walletId) === Number(destinationWalletId)) {
          throw new Error('Dompet asal dan tujuan tidak boleh sama');
        }

        const destWallet = await tx.wallet.findFirst({
          where: { id: Number(destinationWalletId), userId },
        });

        if (!destWallet) throw new Error('Dompet tujuan tidak ditemukan');

        // Decrement Asal, Increment Tujuan
        await tx.wallet.update({
          where: { id: Number(walletId) },
          data: { balance: { decrement: parsedAmount } },
        });

        await tx.wallet.update({
          where: { id: Number(destinationWalletId) },
          data: { balance: { increment: parsedAmount } },
        });
      } else {
        // HANDLER INCOME / EXPENSE
        const balanceChange = txType === 'INCOME' ? parsedAmount : -parsedAmount;
        await tx.wallet.update({
          where: { id: Number(walletId) },
          data: { balance: { increment: balanceChange } },
        });
      }

      // Create Record Transaksi
      const transactionData: any = {
        userId,
        walletId: Number(walletId),
        destinationWalletId: txType === 'TRANSFER' && destinationWalletId ? Number(destinationWalletId) : null,
        categoryId: txType === 'TRANSFER' ? null : (categoryId ? Number(categoryId) : null),
        amount: parsedAmount,
        type: txType as any,
        description: noteText,
        date: date ? new Date(date) : new Date(),
      };

      return await tx.transaction.create({
        data: transactionData,
        include: {
          wallet: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true } },
        } as any,
      });
    });

    res.status(201).json({
      success: true,
      message: 'Transaksi berhasil dicatat',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 3. UPDATE TRANSACTION
export const updateTransaction = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { walletId, destinationWalletId, categoryId, amount, type, description, notes, date } = req.body;

  try {
    const updatedResult = await prisma.$transaction(async (tx) => {
      const oldTx: any = await tx.transaction.findFirst({
        where: { id: Number(id), userId },
      });

      if (!oldTx) throw new Error('Transaksi tidak ditemukan');

      const oldAmount = Number(oldTx.amount);
      const oldType = String(oldTx.type).toUpperCase();
      const newAmount = amount !== undefined ? parseFloat(amount) : oldAmount;
      const newType = type ? String(type).toUpperCase() : oldType;
      const newWalletId = walletId ? Number(walletId) : oldTx.walletId;
      const newDestWalletId = destinationWalletId !== undefined ? (destinationWalletId ? Number(destinationWalletId) : null) : oldTx.destinationWalletId;

      // STEP A: ROLLBACK SALDO SEBELUMNYA
      if (oldType === 'TRANSFER') {
        await tx.wallet.update({
          where: { id: oldTx.walletId },
          data: { balance: { increment: oldAmount } },
        });
        if (oldTx.destinationWalletId) {
          await tx.wallet.update({
            where: { id: oldTx.destinationWalletId },
            data: { balance: { decrement: oldAmount } },
          });
        }
      } else {
        const rollbackAmount = oldType === 'INCOME' ? -oldAmount : oldAmount;
        await tx.wallet.update({
          where: { id: oldTx.walletId },
          data: { balance: { increment: rollbackAmount } },
        });
      }

      // STEP B: APPLY SALDO BARU
      if (newType === 'TRANSFER') {
        if (!newDestWalletId) throw new Error('Dompet tujuan wajib dipilih');
        if (newWalletId === newDestWalletId) throw new Error('Dompet asal dan tujuan tidak boleh sama');

        await tx.wallet.update({
          where: { id: newWalletId },
          data: { balance: { decrement: newAmount } },
        });

        await tx.wallet.update({
          where: { id: newDestWalletId },
          data: { balance: { increment: newAmount } },
        });
      } else {
        const newBalanceChange = newType === 'INCOME' ? newAmount : -newAmount;
        await tx.wallet.update({
          where: { id: newWalletId },
          data: { balance: { increment: newBalanceChange } },
        });
      }

      // STEP C: UPDATE RECORD
      const noteText = notes !== undefined ? notes : (description !== undefined ? description : oldTx.description);

      const updateData: any = {
        walletId: newWalletId,
        destinationWalletId: newType === 'TRANSFER' ? newDestWalletId : null,
        categoryId: newType === 'TRANSFER' ? null : (categoryId !== undefined ? (categoryId ? Number(categoryId) : null) : oldTx.categoryId),
        amount: newAmount,
        type: newType as any,
        description: noteText,
        date: date ? new Date(date) : oldTx.date,
      };

      return await tx.transaction.update({
        where: { id: Number(id) },
        data: updateData,
        include: {
          wallet: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true } },
        } as any,
      });
    });

    res.status(200).json({
      success: true,
      message: 'Transaksi berhasil diperbarui',
      data: updatedResult,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 4. DELETE TRANSACTION
export const deleteTransaction = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    await prisma.$transaction(async (tx) => {
      const transaction: any = await tx.transaction.findFirst({
        where: { id: Number(id), userId },
      });

      if (!transaction) throw new Error('Transaksi tidak ditemukan');

      const parsedAmount = Number(transaction.amount);
      const txType = String(transaction.type).toUpperCase();

      if (txType === 'TRANSFER') {
        await tx.wallet.update({
          where: { id: transaction.walletId },
          data: { balance: { increment: parsedAmount } },
        });

        if (transaction.destinationWalletId) {
          await tx.wallet.update({
            where: { id: transaction.destinationWalletId },
            data: { balance: { decrement: parsedAmount } },
          });
        }
      } else {
        const balanceRollback = txType === 'INCOME' ? -parsedAmount : parsedAmount;
        await tx.wallet.update({
          where: { id: transaction.walletId },
          data: { balance: { increment: balanceRollback } },
        });
      }

      await tx.transaction.delete({
        where: { id: Number(id) },
      });
    });

    res.status(200).json({ success: true, message: 'Transaksi berhasil dihapus & saldo dikembalikan' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};