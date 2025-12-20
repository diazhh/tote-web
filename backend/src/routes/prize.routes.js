import express from 'express';
import prizeController from '../controllers/prize.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

router.post('/process/:drawId', prizeController.processPrizes.bind(prizeController));
router.post('/process-all', prizeController.processAllPendingPrizes.bind(prizeController));
router.get('/summary/:drawId', prizeController.getPrizesSummary.bind(prizeController));

export default router;
