import { Router } from 'express';
import { getBudgets, setBudget, updateBudget, deleteBudget } from '../controllers/budgetController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(authenticateToken);

router.get('/', getBudgets);
router.post('/', setBudget);
router.put('/:id', updateBudget);
router.delete('/:id', deleteBudget);

export default router;