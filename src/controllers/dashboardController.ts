import { Request, Response } from 'express';
import prisma from '../config/db.js';

export const getDashboardSummary = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { month, year } = req.query;

  const currentMonth = month ? Number(month) : new Date().getMonth() + 1;
  const currentYear = year ? Number(year) : new Date().getFullYear();

  const startDate = new Date(currentYear, currentMonth - 1, 1);
  const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

  try {
    // 1. Hitung Total Net Worth (Jumlah saldo dari seluruh wallet milik user)
    const walletAggregate = await prisma.wallet.aggregate({
      where: { userId },
      _sum: { balance: true },
    });
    const totalNetWorth = walletAggregate._sum.balance || 0;

    // 2. Hitung Total Income & Expense di bulan ini
    const monthlyTransactions = await prisma.transaction.groupBy({
      by: ['type'],
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    });

    let totalIncome = 0;
    let totalExpense = 0;

    monthlyTransactions.forEach((item) => {
      if (item.type === 'INCOME') totalIncome = Number(item._sum.amount || 0);
      if (item.type === 'EXPENSE') totalExpense = Number(item._sum.amount || 0);
    });

    // 3. Category Expense Breakdown (Untuk Pie Chart di Frontend)
    const categoryBreakdown = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'EXPENSE',
        date: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    });

    // Ambil detail nama & warna kategori untuk breakdown
    const categoryIds = categoryBreakdown.map((c) => c.categoryId);
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, color: true, icon: true },
    });

    const formattedBreakdown = categoryBreakdown.map((item) => {
      const category = categories.find((c) => c.id === item.categoryId);
      return {
        categoryId: item.categoryId,
        categoryName: category?.name || 'Unknown',
        color: category?.color || '#64748b',
        icon: category?.icon || 'circle',
        totalAmount: Number(item._sum.amount || 0),
      };
    });

    // 4. Ambil 5 Transaksi Terakhir (Recent Activity)
    const recentTransactions = await prisma.transaction.findMany({
      where: { userId },
      take: 5,
      orderBy: { date: 'desc' },
      include: {
        wallet: { select: { name: true } },
        category: { select: { name: true, icon: true, color: true } },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        period: { month: currentMonth, year: currentYear },
        totalNetWorth,
        monthlySummary: {
          income: totalIncome,
          expense: totalExpense,
          netSavings: totalIncome - totalExpense,
        },
        categoryBreakdown: formattedBreakdown,
        recentTransactions,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};