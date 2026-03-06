import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import {
  getJobStats,
  getFailedJobs,
  retryJob,
  getPipelineStatus,
} from '../controllers/admin-jobs.controller.js';

const router = express.Router();

// Todas las rutas requieren autenticación y rol ADMIN
router.use(authenticate, authorize('ADMIN'));

router.get('/stats', getJobStats);
router.get('/failed', getFailedJobs);
router.post('/:jobId/retry', retryJob);
router.get('/pipeline/:drawId', getPipelineStatus);

export default router;
