import { Router } from 'express';
import multer from 'multer';
import { handleSendReportEmail } from '../controllers/reportController';
import { authenticateToken } from '../middlewares/authMiddleware';
const router = Router();

// Storage sementara di memori Server (tanpa simpan di disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // Limit 20 MB
  },
});

// Endpoint POST /api/reports/send-email
router.post(
  '/send-email',
  authenticateToken,
  upload.single('file'),
  handleSendReportEmail
);

export default router;