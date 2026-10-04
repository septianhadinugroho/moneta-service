import { Request, Response } from 'express';
import prisma from '../config/db.js';

export const getDashboardSummary = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { month, year } = req.query;

  const now = new Date();
  const currentMonth = month ? Number(month) : now.getMonth() + 1;
  const currentYear = year ? Number(year) : now.getFullYear();

  // Buat Rentang Tanggal Awal dan Akhir Bulan (Sesuai UTC/Local)
  const startDate = new Date(currentYear, currentMonth - 1, 1);
  const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

  try {
    // 1. Total Net Worth dari seluruh wallet user (Saldo riil saat ini)
    const walletAggregate = await prisma.wallet.aggregate({
      where: { userId },
      _sum: { balance: true },
    });
    const totalNetWorth = Number(walletAggregate._sum.balance || 0);

    // 2. Ambil Transaksi KHUSUS Bulan & Tahun Aktif untuk Ringkasan Bulanan
    const monthlyTransactions = await prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        wallet: { select: { id: true, name: true, color: true } },
      },
    });

    // 3. Ambil 5 Transaksi Terakhir (Tanpa Terbatas Bulan Aktif) agar Recent Tx selalu terisi
    const recentTransactions = await prisma.transaction.findMany({
      where: { userId },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        wallet: { select: { id: true, name: true, color: true } },
        destinationWallet: { select: { id: true, name: true, color: true } },
      },
      orderBy: { date: 'desc' },
      take: 5,
    });

    let totalIncome = 0;
    let totalExpense = 0;

    const expenseMap: { [key: string]: { categoryId: any; categoryName: string; color: string; icon: string; totalAmount: number } } = {};
    const incomeMap: { [key: string]: { categoryId: any; categoryName: string; color: string; icon: string; totalAmount: number } } = {};

    monthlyTransactions.forEach((tx) => {
      const typeStr = String(tx.type || '').trim().toUpperCase();
      const amountNum = Number(tx.amount || 0);

      // Skip jika transaksi Transfer
      if (typeStr === 'TRANSFER') return;

      const catName = tx.category?.name || tx.description || 'Lain-lain';
      const catColor = tx.category?.color || '#64748b';
      const catIcon = tx.category?.icon || 'Tag';
      const mapKey = tx.category?.id ? String(tx.category.id) : catName.toLowerCase().trim();

      const isTransferCategory =
        catName.toLowerCase().includes('pemindahan') ||
        catName.toLowerCase().includes('transfer');

      if (typeStr === 'INCOME') {
        totalIncome += amountNum;
        if (!isTransferCategory) {
          if (!incomeMap[mapKey]) {
            incomeMap[mapKey] = {
              categoryId: mapKey,
              categoryName: catName,
              color: catColor,
              icon: catIcon,
              totalAmount: 0,
            };
          }
          incomeMap[mapKey].totalAmount += amountNum;
        }
      } else if (typeStr === 'EXPENSE') {
        totalExpense += amountNum;
        if (!isTransferCategory) {
          if (!expenseMap[mapKey]) {
            expenseMap[mapKey] = {
              categoryId: mapKey,
              categoryName: catName,
              color: catColor,
              icon: catIcon,
              totalAmount: 0,
            };
          }
          expenseMap[mapKey].totalAmount += amountNum;
        }
      }
    });

    // 4. Kirim Data User juga agar name tidak hilang di FE
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatar: true },
    });

    res.status(200).json({
      success: true,
      data: {
        user,
        period: { month: currentMonth, year: currentYear },
        totalNetWorth,
        monthlySummary: {
          income: totalIncome,
          expense: totalExpense,
          netSavings: totalIncome - totalExpense,
        },
        expenseCategoryBreakdown: Object.values(expenseMap),
        incomeCategoryBreakdown: Object.values(incomeMap),
        recentTransactions,
      },
    });
  } catch (error: any) {
    console.error('Error Dashboard Controller:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};