import { Router } from 'express';
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../controllers/transactionController.js';
import { parseTransactionAi } from '../controllers/aiController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(authenticateToken);

router.get('/', getTransactions);
router.post('/', createTransaction);
router.post('/parse-ai', parseTransactionAi);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;