import { Router } from 'express';
import {
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
} from '../controllers/goalController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js'; // Sesuaikan lokasi middleware auth

const router = Router();

// Semua route dilindungi middleware authentication
router.use(authenticateToken);

router.get('/', getGoals);
router.post('/', createGoal);
router.put('/:id', updateGoal);
router.delete('/:id', deleteGoal);

export default router;