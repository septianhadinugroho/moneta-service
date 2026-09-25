import { Request, Response } from 'express';
import prisma from '../config/db.js';

export const getCategories = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;

  try {
    // Ambil kategori default sistem (userId: null) DAN kategori buatan user ini
    const categories = await prisma.category.findMany({
      where: {
        OR: [{ userId: null }, { userId }],
      },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({ success: true, data: categories });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};