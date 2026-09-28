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
        category: { select: { id: true, name: true, icon: true, color: true, type: true } },
      },
      orderBy: { date: 'desc' },
      take: Number(limit),
    });

    res.status(200).json({ success: true, data: transactions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. CREATE TRANSACTION
export const createTransaction = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { walletId, categoryId, amount, type, description, date } = req.body;

  if (!walletId || !amount || !type) {
    res.status(400).json({
      success: false,
      message: 'Wallet ID, Amount, dan Type (INCOME/EXPENSE) wajib diisi',
    });
    return;
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ success: false, message: 'Nominal transaksi harus bernilai positif' });
    return;
  }

  const txType = String(type).toUpperCase();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findFirst({
        where: { id: Number(walletId), userId },
      });

      if (!wallet) throw new Error('Dompet tidak ditemukan');

      const newTransaction = await tx.transaction.create({
        data: {
          userId,
          walletId: Number(walletId),
          categoryId: categoryId ? Number(categoryId) : (null as any),
          amount: parsedAmount,
          type: txType as any,
          description: description || null,
          date: date ? new Date(date) : new Date(),
        },
        include: {
          wallet: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true } },
        },
      });

      // Update Saldo Wallet
      const balanceChange = txType === 'INCOME' ? parsedAmount : -parsedAmount;
      await tx.wallet.update({
        where: { id: Number(walletId) },
        data: { balance: { increment: balanceChange } },
      });

      return newTransaction;
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
  const { walletId, categoryId, amount, type, description, date } = req.body;

  try {
    const updatedResult = await prisma.$transaction(async (tx) => {
      const oldTx = await tx.transaction.findFirst({
        where: { id: Number(id), userId },
      });

      if (!oldTx) throw new Error('Transaksi tidak ditemukan');

      const oldAmount = Number(oldTx.amount);
      const newAmount = amount !== undefined ? parseFloat(amount) : oldAmount;
      const oldWalletId = oldTx.walletId;
      const newWalletId = walletId ? Number(walletId) : oldWalletId;
      const oldType = String(oldTx.type).toUpperCase();
      const newType = type ? String(type).toUpperCase() : oldType;

      // Rollback Saldo Dompet Lama
      const rollbackAmount = oldType === 'INCOME' ? -oldAmount : oldAmount;
      await tx.wallet.update({
        where: { id: oldWalletId },
        data: { balance: { increment: rollbackAmount } },
      });

      // Terapkan Perubahan Saldo ke Dompet Baru
      const newBalanceChange = newType === 'INCOME' ? newAmount : -newAmount;
      await tx.wallet.update({
        where: { id: newWalletId },
        data: { balance: { increment: newBalanceChange } },
      });

      // Update Data Transaksi
      return await tx.transaction.update({
        where: { id: Number(id) },
        data: {
          walletId: newWalletId,
          categoryId: categoryId !== undefined ? (categoryId ? Number(categoryId) : (null as any)) : oldTx.categoryId,
          amount: newAmount,
          type: newType as any,
          description: description !== undefined ? description : oldTx.description,
          date: date ? new Date(date) : oldTx.date,
        },
        include: {
          wallet: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true } },
        },
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
      const transaction = await tx.transaction.findFirst({
        where: { id: Number(id), userId },
      });

      if (!transaction) throw new Error('Transaksi tidak ditemukan');

      const parsedAmount = Number(transaction.amount);
      const balanceRollback = String(transaction.type).toUpperCase() === 'INCOME' ? -parsedAmount : parsedAmount;

      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: { balance: { increment: balanceRollback } },
      });

      await tx.transaction.delete({
        where: { id: Number(id) },
      });
    });

    res.status(200).json({ success: true, message: 'Transaksi berhasil dihapus & saldo dikembalikan' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};