import { Router } from 'express';
import { getDashboardSummary } from '../controllers/dashboardController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(authenticateToken);

router.get('/summary', getDashboardSummary);

export default router;