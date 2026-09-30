import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { sendReportEmail } from '../config/mailer';

export const handleSendReportEmail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const file = req.file; // Dari Multer
    const { monthName, year } = req.body;

    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!file) {
      res.status(400).json({ success: false, message: 'File PDF laporan tidak ditemukan' });
      return;
    }

    const filename = file.originalname || `Moneta_Laporan_${monthName}_${year}.pdf`;

    await sendReportEmail(
      user.email,
      'Pengguna Moneta',
      monthName || 'Bulan Ini',
      year || new Date().getFullYear(),
      file.buffer,
      filename
    );

    res.status(200).json({
      success: true,
      message: `Laporan PDF berhasil dikirimkan ke ${user.email}`,
    });
  } catch (error: any) {
    console.error('Error sending report email:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengirimkan laporan PDF ke email',
    });
  }
};