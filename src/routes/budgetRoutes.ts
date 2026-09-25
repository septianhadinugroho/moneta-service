import { Router } from 'express';
import { getBudgets, setBudget } from '../controllers/budgetController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(authenticateToken);

router.get('/', getBudgets);
router.post('/', setBudget);

export default router;