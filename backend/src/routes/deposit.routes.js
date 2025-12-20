import express from 'express';
import depositController from '../controllers/deposit.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/', depositController.create.bind(depositController));
router.get('/my-deposits', depositController.getMyDeposits.bind(depositController));

router.use(authorize('ADMIN', 'TAQUILLA_ADMIN'));

router.get('/', depositController.getAll.bind(depositController));
router.get('/:id', depositController.getById.bind(depositController));
router.post('/:id/approve', depositController.approve.bind(depositController));
router.post('/:id/reject', depositController.reject.bind(depositController));

export default router;
