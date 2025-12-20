import express from 'express';
import withdrawalController from '../controllers/withdrawal.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/', withdrawalController.create.bind(withdrawalController));
router.get('/my-withdrawals', withdrawalController.getMyWithdrawals.bind(withdrawalController));
router.delete('/:id', withdrawalController.cancel.bind(withdrawalController));

router.use(authorize('ADMIN', 'TAQUILLA_ADMIN'));

router.get('/', withdrawalController.getAll.bind(withdrawalController));
router.get('/:id', withdrawalController.getById.bind(withdrawalController));
router.post('/:id/process', withdrawalController.process.bind(withdrawalController));
router.post('/:id/complete', withdrawalController.complete.bind(withdrawalController));
router.post('/:id/reject', withdrawalController.reject.bind(withdrawalController));

export default router;
