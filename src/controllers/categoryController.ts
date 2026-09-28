import { Request, Response } from 'express';
import prisma from '../config/db.js';

// Kategori Default Bawaan Sistem
const DEFAULT_CATEGORIES = [
  { name: 'Food & Beverage', type: 'EXPENSE', icon: 'utensils', color: '#ef4444' },
  { name: 'Transportation', type: 'EXPENSE', icon: 'car', color: '#f97316' },
  { name: 'Bills & Utilities', type: 'EXPENSE', icon: 'receipt', color: '#6366f1' },
  { name: 'Entertainment', type: 'EXPENSE', icon: 'film', color: '#a855f7' },
  { name: 'Gaji / Salary', type: 'INCOME', icon: 'briefcase', color: '#10b981' },
  { name: 'Investment Return', type: 'INCOME', icon: 'trending-up', color: '#06b6d4' },
];

// 1. GET ALL CATEGORIES
export const getCategories = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { type } = req.query;

  try {
    // 1. Cek apakah user sudah punya kategori
    let categories = await prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    // 2. Jika MASIH KOSONG, buatkan kategori default otomatis!
    if (categories.length === 0) {
      await prisma.category.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({
          ...c,
          userId,
          type: c.type as any,
        })),
      });

      categories = await prisma.category.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });
    }

    // Filter berdasarkan Tipe jika ada query ?type=EXPENSE / INCOME
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
    // 1. Cari data kategori sebelum diubah
    const oldCategory = await prisma.category.findFirst({
      where: { id: Number(id), userId },
    });

    if (!oldCategory) {
      res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
      return;
    }

    // 2. Update tabel Category
    const updatedCategory = await prisma.category.update({
      where: { id: Number(id) },
      data: {
        name,
        color,
        icon,
        type: type ? (String(type).toUpperCase() as any) : undefined,
      },
    });

    // 3. SINKRONISASI OTOMATIS:
    // Update semua transaksi yang terikat dengan ID kategori ini
    // ATAU yang deskripsinya masih menggunakan nama kategori lama
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
        description: name, // Mengubah teks deskripsi ke nama kategori baru
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

// 4. DELETE CATEGORY
export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const existingCat = await prisma.category.findFirst({
      where: { id: Number(id), userId },
    });

    if (!existingCat) {
      res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Unlink transaksi dari kategori ini
      await tx.transaction.updateMany({
        where: { categoryId: Number(id) },
        data: { categoryId: null as any },
      });

      // Hapus kategori
      await tx.category.delete({
        where: { id: Number(id) },
      });
    });

    res.status(200).json({ success: true, message: 'Kategori berhasil dihapus' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};