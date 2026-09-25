import { Router } from 'express';
import { getCategories } from '../controllers/categoryController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(authenticateToken);

router.get('/', getCategories);

export default router;