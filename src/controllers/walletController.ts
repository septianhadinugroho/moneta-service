import { Request, Response } from 'express';
import prisma from '../config/db.js';

// GET ALL WALLETS
export const getWallets = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;

  try {
    const wallets = await prisma.wallet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: wallets });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// CREATE NEW WALLET
export const createWallet = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { name, type, balance, color } = req.body;

  if (!name || balance === undefined) {
    res.status(400).json({ success: false, message: 'Nama dompet dan saldo awal wajib diisi' });
    return;
  }

  try {
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name,
        type: type || 'CASH',
        balance: parseFloat(balance),
        color: color || '#0f172a',
      },
    });

    res.status(201).json({ success: true, message: 'Dompet berhasil dibuat', data: wallet });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// UPDATE WALLET
export const updateWallet = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, type, color, balance } = req.body;

  try {
    const existingWallet = await prisma.wallet.findFirst({
      where: { id: Number(id), userId },
    });

    if (!existingWallet) {
      res.status(404).json({ success: false, message: 'Dompet tidak ditemukan' });
      return;
    }

    const updated = await prisma.wallet.update({
      where: { id: Number(id) },
      data: {
        name: name || existingWallet.name,
        type: type || existingWallet.type,
        color: color || existingWallet.color,
        balance: balance !== undefined ? parseFloat(balance) : existingWallet.balance,
      },
    });

    res.status(200).json({ success: true, message: 'Dompet berhasil diperbarui', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE WALLET (Cascade Delete Wallet + Transaksinya)
export const deleteWallet = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const walletId = Number(id);

  try {
    const existingWallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId },
    });

    if (!existingWallet) {
      res.status(404).json({ success: false, message: 'Dompet tidak ditemukan' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Hapus semua transaksi yang terikat ke dompet ini
      await tx.transaction.deleteMany({
        where: { walletId },
      });

      // 2. Hapus dompetnya
      await tx.wallet.delete({
        where: { id: walletId },
      });
    });

    res.status(200).json({ success: true, message: 'Dompet dan seluruh transaksinya berhasil dihapus' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};