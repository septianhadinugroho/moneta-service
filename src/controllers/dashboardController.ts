import { Request, Response } from 'express';
import prisma from '../config/db.js';

export const getDashboardSummary = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { month, year } = req.query;

  const now = new Date();
  const currentMonth = month ? Number(month) : now.getMonth() + 1;
  const currentYear = year ? Number(year) : now.getFullYear();

  try {
    // 1. Total Net Worth dari seluruh akun/wallet
    const walletAggregate = await prisma.wallet.aggregate({
      where: { userId },
      _sum: { balance: true },
    });
    const totalNetWorth = Number(walletAggregate._sum.balance || 0);

    // 2. Ambil Kategori Aktif User
    const userCategories = await prisma.category.findMany({
      where: { userId },
    });

    // 3. Ambil Seluruh Transaksi User
    const allTransactions = await prisma.transaction.findMany({
      where: { userId },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        wallet: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });

    let totalIncome = 0;
    let totalExpense = 0;

    const expenseMap: { [key: string]: { categoryId: any; categoryName: string; color: string; totalAmount: number } } = {};
    const incomeMap: { [key: string]: { categoryId: any; categoryName: string; color: string; totalAmount: number } } = {};

    allTransactions.forEach((tx) => {
      const rawDate = tx.date || (tx as any).transactionDate || (tx as any).createdAt;
      if (!rawDate) return;
      const txDate = new Date(rawDate);

      // Filter periode bulan dan tahun aktif
      if (txDate.getMonth() + 1 !== currentMonth || txDate.getFullYear() !== currentYear) {
        return;
      }

      const typeStr = String(tx.type || '').trim().toUpperCase();
      const amountNum = Number(tx.amount || 0);

      // Ambil nama & warna kategori (dengan fallback ke deskripsi jika categoryId null)
      const catName =
        tx.category?.name ||
        (tx.description && tx.description.trim() !== '' ? tx.description : 'Lain-lain');
      const catColor = tx.category?.color || '#64748b';
      const mapKey = tx.category?.id ? String(tx.category.id) : catName.toLowerCase().trim();

      if (typeStr === 'INCOME' || typeStr.includes('INCOME')) {
        totalIncome += amountNum;
        if (!incomeMap[mapKey]) {
          incomeMap[mapKey] = { categoryId: mapKey, categoryName: catName, color: catColor, totalAmount: 0 };
        }
        incomeMap[mapKey].totalAmount += amountNum;
      } else {
        totalExpense += amountNum;
        if (!expenseMap[mapKey]) {
          expenseMap[mapKey] = { categoryId: mapKey, categoryName: catName, color: catColor, totalAmount: 0 };
        }
        expenseMap[mapKey].totalAmount += amountNum;
      }
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
        expenseCategoryBreakdown: Object.values(expenseMap),
        incomeCategoryBreakdown: Object.values(incomeMap),
        recentTransactions: allTransactions.slice(0, 5),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};