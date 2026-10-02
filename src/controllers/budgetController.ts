import { Request, Response } from 'express';
import prisma from '../config/db.js';

// GET BUDGETS WITH USAGE PROGRESS
export const getBudgets = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { month, year } = req.query;

  const targetMonth = month ? Number(month) : new Date().getMonth() + 1;
  const targetYear = year ? Number(year) : new Date().getFullYear();

  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

  try {
    const budgets = await prisma.budget.findMany({
      where: { userId, month: targetMonth, year: targetYear },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
      },
    });

    // Hitung pengeluaran aktual per kategori pada bulan tersebut
    const budgetProgress = await Promise.all(
      budgets.map(async (budget) => {
        const spentAggregate = await prisma.transaction.aggregate({
          where: {
            userId,
            categoryId: budget.categoryId,
            type: 'EXPENSE',
            date: { gte: startDate, lte: endDate },
          },
          _sum: { amount: true },
        });

        const spent = Number(spentAggregate._sum.amount || 0);
        const limit = Number(budget.limitAmount);
        const percentage = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;

        return {
          id: budget.id,
          categoryId: budget.categoryId,
          category: budget.category,
          limitAmount: limit,
          spentAmount: spent,
          usedAmount: spent,
          remainingAmount: limit - spent,
          percentage,
          isOverBudget: spent > limit,
          month: budget.month,
          year: budget.year,
        };
      })
    );

    res.status(200).json({ success: true, data: budgetProgress });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// UPSERT / CREATE BUDGET
export const setBudget = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { categoryId, limitAmount, month, year } = req.body;

  if (!categoryId || limitAmount === undefined) {
    res.status(400).json({ success: false, message: 'Kategori dan nominal limit wajib diisi' });
    return;
  }

  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  try {
    const budget = await prisma.budget.upsert({
      where: {
        userId_categoryId_month_year: {
          userId,
          categoryId: Number(categoryId),
          month: Number(targetMonth),
          year: Number(targetYear),
        },
      },
      update: {
        limitAmount: parseFloat(limitAmount),
      },
      create: {
        userId,
        categoryId: Number(categoryId),
        limitAmount: parseFloat(limitAmount),
        month: Number(targetMonth),
        year: Number(targetYear),
      },
    });

    res.status(200).json({ success: true, message: 'Anggaran berhasil disimpan', data: budget });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// UPDATE BUDGET BY ID
export const updateBudget = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { limitAmount } = req.body;

  if (limitAmount === undefined || isNaN(Number(limitAmount))) {
    res.status(400).json({ success: false, message: 'Nominal limit anggaran tidak valid' });
    return;
  }

  try {
    const existing = await prisma.budget.findFirst({
      where: { id: Number(id), userId },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Data anggaran tidak ditemukan' });
      return;
    }

    const updatedBudget = await prisma.budget.update({
      where: { id: Number(id) },
      data: { limitAmount: parseFloat(limitAmount) },
    });

    res.status(200).json({ success: true, message: 'Anggaran berhasil diperbarui', data: updatedBudget });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE BUDGET BY ID
export const deleteBudget = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const existing = await prisma.budget.findFirst({
      where: { id: Number(id), userId },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Data anggaran tidak ditemukan' });
      return;
    }

    await prisma.budget.delete({
      where: { id: Number(id) },
    });

    res.status(200).json({ success: true, message: 'Anggaran berhasil dihapus' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};