/**
 * Admin routes for DrawItemQuota.
 * Mounted at /api/draws in index.js.
 */
import { Router } from 'express';
import quotaController from '../controllers/quota.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/:drawId/quotas', (req, res) => quotaController.list(req, res));
router.put('/:drawId/quotas/:gameItemId', (req, res) => quotaController.upsert(req, res));
router.delete('/:drawId/quotas/:gameItemId', (req, res) => quotaController.remove(req, res));

export default router;
