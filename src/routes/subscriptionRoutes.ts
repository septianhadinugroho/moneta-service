import { Router } from 'express';
import {
  getSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  paySubscription,
} from '../controllers/subscriptionController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();

// Semua route terproteksi JWT
router.use(authenticateToken);

router.get('/', getSubscriptions);
router.post('/', createSubscription);
router.put('/:id', updateSubscription);
router.delete('/:id', deleteSubscription);
router.post('/:id/pay', paySubscription);

export default router;