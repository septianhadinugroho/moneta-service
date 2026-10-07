import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import {
  getDebts,
  createDebt,
  payDebt,
  updateDebt,
  deleteDebt,
} from '../controllers/debtController.js';

const router = Router();

router.use(authenticateToken);

router.get('/', getDebts);
router.post('/', createDebt);
router.post('/:id/pay', payDebt);
router.put('/:id', updateDebt);
router.delete('/:id', deleteDebt);

export default router;