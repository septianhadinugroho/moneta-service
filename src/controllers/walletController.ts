import { Request, Response } from 'express';
import prisma from '../config/db.js';

// GET ALL WALLETS (For logged in user)
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
    res.status(400).json({ success: false, message: 'Wallet name and balance are required' });
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

    res.status(201).json({ success: true, message: 'Wallet created successfully', data: wallet });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// UPDATE WALLET
export const updateWallet = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, type, balance, color } = req.body;

  try {
    const wallet = await prisma.wallet.findFirst({
      where: { id: Number(id), userId },
    });

    if (!wallet) {
      res.status(404).json({ success: false, message: 'Wallet not found' });
      return;
    }

    const updated = await prisma.wallet.update({
      where: { id: Number(id) },
      data: {
        name: name || wallet.name,
        type: type || wallet.type,
        balance: balance !== undefined ? parseFloat(balance) : wallet.balance,
        color: color || wallet.color,
      },
    });

    res.status(200).json({ success: true, message: 'Wallet updated', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE WALLET
export const deleteWallet = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const wallet = await prisma.wallet.findFirst({
      where: { id: Number(id), userId },
    });

    if (!wallet) {
      res.status(404).json({ success: false, message: 'Wallet not found' });
      return;
    }

    await prisma.wallet.delete({ where: { id: Number(id) } });

    res.status(200).json({ success: true, message: 'Wallet deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};