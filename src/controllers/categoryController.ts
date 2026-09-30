import { Request, Response } from 'express';
import prisma from '../config/db.js';

// 1. GET ALL CATEGORIES
export const getCategories = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { type } = req.query;

  try {
    const categories = await prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    let filteredData = categories;
    if (type) {
      filteredData = categories.filter(
        (c) => String(c.type).toUpperCase() === String(type).toUpperCase()
      );
    }

    res.status(200).json({ success: true, data: filteredData });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. CREATE CATEGORY
export const createCategory = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { name, type, icon, color } = req.body;

  if (!name || !type) {
    res.status(400).json({ success: false, message: 'Nama dan tipe kategori wajib diisi' });
    return;
  }

  try {
    const newCategory = await prisma.category.create({
      data: {
        userId,
        name,
        type: String(type).toUpperCase() as any,
        icon: icon || 'circle',
        color: color || '#64748b',
      },
    });

    res.status(201).json({ success: true, data: newCategory });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. UPDATE CATEGORY
export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, color, icon, type } = req.body;

  try {
    const oldCategory = await prisma.category.findFirst({
      where: { id: Number(id), userId },
    });

    if (!oldCategory) {
      res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
      return;
    }

    const updatedCategory = await prisma.category.update({
      where: { id: Number(id) },
      data: {
        name,
        color,
        icon,
        type: type ? (String(type).toUpperCase() as any) : undefined,
      },
    });

    // Sync transaksi terkait
    await prisma.transaction.updateMany({
      where: {
        userId,
        OR: [
          { categoryId: Number(id) },
          { description: oldCategory.name },
        ],
      },
      data: {
        categoryId: Number(id),
        description: name,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Kategori dan seluruh transaksi terkait berhasil diperbarui',
      data: updatedCategory,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE CATEGORY (Cascade Delete Category + Transaksinya)
export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const categoryId = Number(id);

  try {
    const existingCat = await prisma.category.findFirst({
      where: { id: categoryId, userId },
    });

    if (!existingCat) {
      res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Hapus semua transaksi di kategori ini
      await tx.transaction.deleteMany({
        where: { categoryId },
      });

      // 2. Hapus kategorinya
      await tx.category.delete({
        where: { id: categoryId },
      });
    });

    res.status(200).json({ success: true, message: 'Kategori dan seluruh transaksinya berhasil dihapus' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};