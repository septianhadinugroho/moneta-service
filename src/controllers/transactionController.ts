import { Request, Response } from 'express';
import prisma from '../config/db.js';

// GET TRANSACTIONS (dengan Filter Bulan, Tahun, Wallet, & Category)
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { month, year, walletId, categoryId, limit = 50 } = req.query;

  try {
    const whereCondition: any = { userId };

    if (walletId) whereCondition.walletId = Number(walletId);
    if (categoryId) whereCondition.categoryId = Number(categoryId);

    // Filter tanggal berdasarkan Bulan & Tahun (Default: Bulan/Tahun saat ini)
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

// CREATE TRANSACTION (Auto-Update Saldo Wallet)
export const createTransaction = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { walletId, categoryId, amount, type, description, date } = req.body;

  if (!walletId || !categoryId || !amount || !type) {
    res.status(400).json({
      success: false,
      message: 'Wallet ID, Category ID, Amount, and Type (INCOME/EXPENSE) are required',
    });
    return;
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    return;
  }

  try {
    // Gunakan Prisma Transaction agar pembuatan pencatatan & penyesuaian saldo bersifat atomic
    const result = await prisma.$transaction(async (tx) => {
      // 1. Cek keberadaan wallet
      const wallet = await tx.wallet.findFirst({
        where: { id: Number(walletId), userId },
      });

      if (!wallet) throw new Error('Wallet not found');

      // 2. Jika transaksi EXPENSE, pastikan saldo mencukupi (Opsional)
      const currentBalance = Number(wallet.balance);
      if (type === 'EXPENSE' && currentBalance < parsedAmount) {
        throw new Error('Insufficient wallet balance');
      }

      // 3. Simpan Transaksi
      const newTransaction = await tx.transaction.create({
        data: {
          userId,
          walletId: Number(walletId),
          categoryId: Number(categoryId),
          amount: parsedAmount,
          type,
          description,
          date: date ? new Date(date) : new Date(),
        },
        include: {
          wallet: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true } },
        },
      });

      // 4. Update Saldo Wallet
      const balanceChange = type === 'INCOME' ? parsedAmount : -parsedAmount;
      await tx.wallet.update({
        where: { id: Number(walletId) },
        data: {
          balance: { increment: balanceChange },
        },
      });

      return newTransaction;
    });

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// DELETE TRANSACTION (Rollback Saldo Wallet)
export const deleteTransaction = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id: Number(id), userId },
      });

      if (!transaction) throw new Error('Transaction not found');

      // Rollback Saldo Wallet (Kebalikan dari transaksi semula)
      const parsedAmount = Number(transaction.amount);
      const balanceRollback = transaction.type === 'INCOME' ? -parsedAmount : parsedAmount;

      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: {
          balance: { increment: balanceRollback },
        },
      });

      // Hapus Transaksi
      await tx.transaction.delete({
        where: { id: Number(id) },
      });
    });

    res.status(200).json({ success: true, message: 'Transaction deleted & balance restored' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};