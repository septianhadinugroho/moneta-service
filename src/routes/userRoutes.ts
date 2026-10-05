import { Router } from 'express';
import { getMe, getAllUsers, getUserById } from '../controllers/userController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();

// Semua route di bawah ini wajib menggunakan Bearer Token
router.use(authenticateToken);

// [SAFE] Hanya mengambil profil user yang sedang login via Token
router.get('/users/me', getMe);

// [DISABLED SEMENTARA] Komen atau biarkan diblokir controller demi keamanan
// router.get('/users', getAllUsers);
// router.get('/users/:id', getUserById);

export default router;