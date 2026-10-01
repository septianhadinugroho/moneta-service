import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET: Ambil semua target impian milik user
export const getGoals = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id; // Diambil dari middleware auth JWT

    const goals = await prisma.goal.findMany({
      where: { userId },
      include: {
        wallet: {
          select: { id: true, name: true, balance: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: goals,
    });
  } catch (err: any) {
    console.error('Error GET /goals:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data target impian',
    });
  }
};

// POST: Buat target impian baru
export const createGoal = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name, targetAmount, walletId, targetDate } = req.body;

    if (!name || !targetAmount) {
      return res.status(400).json({
        success: false,
        message: 'Nama target dan jumlah target wajib diisi',
      });
    }

    const newGoal = await prisma.goal.create({
      data: {
        userId,
        name,
        targetAmount: Number(targetAmount),
        walletId: walletId ? Number(walletId) : null,
        targetDate: targetDate ? new Date(targetDate) : null,
      },
      include: {
        wallet: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: newGoal,
      message: 'Target impian berhasil dibuat',
    });
  } catch (err: any) {
    console.error('Error POST /goals:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Gagal membuat target impian',
    });
  }
};

// PUT: Update target impian
export const updateGoal = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { name, targetAmount, walletId, targetDate } = req.body;

    const existingGoal = await prisma.goal.findFirst({
      where: { id: Number(id), userId },
    });

    if (!existingGoal) {
      return res.status(404).json({
        success: false,
        message: 'Target impian tidak ditemukan',
      });
    }

    const updatedGoal = await prisma.goal.update({
      where: { id: Number(id) },
      data: {
        name: name ?? existingGoal.name,
        targetAmount: targetAmount ? Number(targetAmount) : existingGoal.targetAmount,
        walletId: walletId !== undefined ? (walletId ? Number(walletId) : null) : existingGoal.walletId,
        targetDate: targetDate ? new Date(targetDate) : existingGoal.targetDate,
      },
      include: { wallet: true },
    });

    return res.status(200).json({
      success: true,
      data: updatedGoal,
      message: 'Target impian berhasil diperbarui',
    });
  } catch (err: any) {
    console.error('Error PUT /goals/:id:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui target impian',
    });
  }
};

// DELETE: Hapus target impian
export const deleteGoal = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const existingGoal = await prisma.goal.findFirst({
      where: { id: Number(id), userId },
    });

    if (!existingGoal) {
      return res.status(404).json({
        success: false,
        message: 'Target impian tidak ditemukan',
      });
    }

    await prisma.goal.delete({
      where: { id: Number(id) },
    });

    return res.status(200).json({
      success: true,
      message: 'Target impian berhasil dihapus',
    });
  } catch (err: any) {
    console.error('Error DELETE /goals/:id:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus target impian',
    });
  }
};