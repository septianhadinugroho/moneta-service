import { Router } from 'express';
import {
  getWallets,
  createWallet,
  updateWallet,
  deleteWallet,
} from '../controllers/walletController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticateToken); // Proteksi semua route wallet dengan JWT Middleware

router.get('/', getWallets);
router.post('/', createWallet);
router.put('/:id', updateWallet);
router.delete('/:id', deleteWallet);

export default router;