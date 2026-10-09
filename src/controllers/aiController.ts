import { Request, Response } from 'express';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import prisma from '../config/db.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Helper untuk penundaan (delay)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const parseTransactionAi = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { text } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ success: false, message: 'Teks input wajib diisi' });
    return;
  }

  try {
    const [wallets, categories] = await Promise.all([
      prisma.wallet.findMany({
        where: { userId },
        select: { id: true, name: true, type: true },
      }),
      prisma.category.findMany({
        where: { OR: [{ userId }, { userId: null }] },
        select: { id: true, name: true, type: true },
      }),
    ]);

    const todayStr = new Date().toISOString().split('T')[0];

    const systemInstruction = `
Kamu adalah asisten pengurai transaksi keuangan aplikasi Moneta.
Tugasmu adalah menganalisis teks transaksi pengguna dan mengekstrak datanya menjadi JSON terstruktur murni.

Tanggal Hari Ini: ${todayStr}
Daftar Dompet User: ${JSON.stringify(wallets)}
Daftar Kategori User: ${JSON.stringify(categories)}

Aturan Ekstraksi:
- 'amount': Angka nominal murni. Contoh "20" atau "20rb" -> 20000, "1.5jt" -> 1500000.
- 'type': 'EXPENSE' (pengeluaran) atau 'INCOME' (pemasukan).
- 'walletId': ID dompet yang paling cocok dari daftar (null jika tidak ada).
- 'categoryId': ID kategori yang paling cocok dari daftar (null jika tidak ada).
- 'date': Format YYYY-MM-DD.
- 'notes': Ringkasan nama barang/transaksi (contoh: "Bakso", "Kopi Kenangan").
    `;

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.8-flash',
      systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            amount: { type: SchemaType.NUMBER, nullable: true },
            type: { type: SchemaType.STRING },
            walletId: { type: SchemaType.INTEGER, nullable: true },
            categoryId: { type: SchemaType.INTEGER, nullable: true },
            date: { type: SchemaType.STRING, nullable: true },
            notes: { type: SchemaType.STRING, nullable: true },
          },
          required: ['type'],
        } as any,
      },
    });

    // AUTO-RETRY LOGIC (Maksimal 3x percobaan)
    let attempts = 0;
    const maxAttempts = 3;
    let result = null;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        result = await model.generateContent(text);
        break; // Jika berhasil, keluar dari loop
      } catch (err: any) {
        const isHighDemand = err?.status === 503 || err?.status === 429 || err?.message?.includes('high demand');
        if (isHighDemand && attempts < maxAttempts) {
        //   console.warn(`[AI Parsing] Server busy/high demand. Retrying attempt ${attempts}/${maxAttempts}...`);
          await wait(1200 * attempts); // Tunggu 1.2 detik, lalu 2.4 detik
        } else {
          throw err; // Lempar error jika bukan 503/429 atau kuota retry habis
        }
      }
    }

    if (!result) throw new Error('Gagal memproses AI input setelah beberapa kali percobaan');

    const responseText = result.response.text();
    const parsedData = JSON.parse(responseText || '{}');

    res.status(200).json({
      success: true,
      message: 'Berhasil mengurai transaksi',
      data: parsedData,
    });
  } catch (error: any) {
    // console.error('Error AI Parsing:', error);
    
    // Pesan error ramah pengguna jika AI masih sibuk setelah 3x retry
    const isOverload = error?.status === 503 || error?.status === 429 || error?.message?.includes('high demand');
    const userMessage = isOverload
      ? 'Server AI sedang sangat padat. Silakan coba tekan tombol sekali lagi.'
      : 'Gagal mengurai teks. Coba gunakan frasa yang lebih jelas.';

    res.status(500).json({
      success: false,
      message: userMessage,
    });
  }
};