import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
}

// 1. Get All Subscriptions
export const getSubscriptions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      include: {
        wallet: { select: { id: true, name: true, type: true } },
        category: { select: { id: true, name: true, icon: true, color: true } },
        payments: {
          where: { month: currentMonth, year: currentYear },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Petakan data dengan atribut flag 'isPaidThisMonth'
    const formattedData = subscriptions.map((sub) => ({
      ...sub,
      isPaidThisMonth: sub.payments.length > 0,
    }));

    res.status(200).json({ success: true, data: formattedData });
  } catch (error: any) {
    console.error('Error in getSubscriptions:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data tagihan' });
  }
};

// 2. Create Subscription
export const createSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { name, amount, frequency, dueDate, walletId, categoryId, reminderDays, notes } = req.body;

    if (!name || !amount || !dueDate) {
      res.status(400).json({ success: false, message: 'Nama, nominal, dan tanggal jatuh tempo wajib diisi' });
      return;
    }

    const parsedDueDate = Number(dueDate);
    if (isNaN(parsedDueDate) || parsedDueDate < 1 || parsedDueDate > 31) {
      res.status(400).json({ success: false, message: 'Tanggal jatuh tempo harus antara 1 - 31' });
      return;
    }

    const newSubscription = await prisma.subscription.create({
      data: {
        userId,
        name,
        amount: parseFloat(amount),
        frequency: frequency || 'MONTHLY',
        dueDate: parsedDueDate,
        walletId: walletId ? Number(walletId) : null,
        categoryId: categoryId ? Number(categoryId) : null,
        reminderDays: reminderDays ? Number(reminderDays) : 3,
        notes: notes || null,
      },
      include: {
        wallet: { select: { id: true, name: true, type: true } },
        category: { select: { id: true, name: true, icon: true, color: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Tagihan rutin berhasil ditambahkan',
      data: newSubscription,
    });
  } catch (error: any) {
    console.error('Error in createSubscription:', error);
    res.status(500).json({ success: false, message: 'Gagal membuat tagihan rutin' });
  }
};

// 3. Update Subscription
export const updateSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { id: Number(id), userId },
    });

    if (!existingSub) {
      res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan' });
      return;
    }

    const { name, amount, frequency, dueDate, walletId, categoryId, status, reminderDays, notes } = req.body;

    const updatedSubscription = await prisma.subscription.update({
      where: { id: Number(id) },
      data: {
        name: name !== undefined ? name : existingSub.name,
        amount: amount !== undefined ? parseFloat(amount) : existingSub.amount,
        frequency: frequency !== undefined ? frequency : existingSub.frequency,
        dueDate: dueDate !== undefined ? Number(dueDate) : existingSub.dueDate,
        walletId: walletId !== undefined ? (walletId ? Number(walletId) : null) : existingSub.walletId,
        categoryId: categoryId !== undefined ? (categoryId ? Number(categoryId) : null) : existingSub.categoryId,
        status: status !== undefined ? status : existingSub.status,
        reminderDays: reminderDays !== undefined ? Number(reminderDays) : existingSub.reminderDays,
        notes: notes !== undefined ? notes : existingSub.notes,
      },
      include: {
        wallet: { select: { id: true, name: true, type: true } },
        category: { select: { id: true, name: true, icon: true, color: true } },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Tagihan rutin berhasil diperbarui',
      data: updatedSubscription,
    });
  } catch (error: any) {
    console.error('Error in updateSubscription:', error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui tagihan rutin' });
  }
};

// 4. Delete Subscription
export const deleteSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { id: Number(id), userId },
    });

    if (!existingSub) {
      res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan' });
      return;
    }

    await prisma.subscription.delete({
      where: { id: Number(id) },
    });

    res.status(200).json({
      success: true,
      message: 'Tagihan rutin berhasil dihapus',
    });
  } catch (error: any) {
    console.error('Error in deleteSubscription:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus tagihan rutin' });
  }
};

// 5. Eksekusi Pembayaran Tagihan -> Otomatis Buat Transaksi & Potong Saldo Dompet
export const paySubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { targetWalletId, date } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const payDate = date ? new Date(date) : new Date();
    const currentMonth = payDate.getMonth() + 1;
    const currentYear = payDate.getFullYear();

    // 1. Cek apakah tagihan ada
    const subscription = await prisma.subscription.findFirst({
      where: { id: Number(id), userId },
    });

    if (!subscription) {
      res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan' });
      return;
    }

    // 2. PROTEKSI CEGAH DOUBLE PAY: Cek apakah bulan ini sudah dibayar
    const existingPayment = await prisma.subscriptionPayment.findUnique({
      where: {
        subscriptionId_month_year: {
          subscriptionId: Number(id),
          month: currentMonth,
          year: currentYear,
        },
      },
    });

    if (existingPayment) {
      res.status(400).json({
        success: false,
        message: `Tagihan "${subscription.name}" sudah dibayar untuk periode bulan ini!`,
      });
      return;
    }

    const selectedWalletId = targetWalletId ? Number(targetWalletId) : subscription.walletId;
    if (!selectedWalletId) {
      res.status(400).json({ success: false, message: 'Pilih dompet pembayaran terlebih dahulu' });
      return;
    }

    // 3. Eksekusi Atomic Transaction
    const result = await prisma.$transaction(async (tx) => {
      // a. Catat Transaksi Pengeluaran
      const transaction = await tx.transaction.create({
        data: {
          userId,
          walletId: selectedWalletId,
          categoryId: subscription.categoryId,
          amount: subscription.amount,
          type: 'EXPENSE',
          description: `Pembayaran Tagihan: ${subscription.name}`,
          date: payDate,
        },
      });

      // b. Potong Saldo Dompet
      const updatedWallet = await tx.wallet.update({
        where: { id: selectedWalletId },
        data: { balance: { decrement: subscription.amount } },
      });

      // c. Catat Record Histori Pembayaran Tagihan Bulan Ini
      const paymentRecord = await tx.subscriptionPayment.create({
        data: {
          subscriptionId: Number(id),
          transactionId: transaction.id,
          month: currentMonth,
          year: currentYear,
          paidAt: payDate,
        },
      });

      return { transaction, updatedWallet, paymentRecord };
    });

    res.status(200).json({
      success: true,
      message: `Tagihan "${subscription.name}" berhasil dibayar & dicatat!`,
      data: result,
    });
  } catch (error: any) {
    console.error('Error in paySubscription:', error);
    res.status(500).json({ success: false, message: 'Gagal memproses pembayaran' });
  }
};