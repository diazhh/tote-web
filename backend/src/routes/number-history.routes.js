import express from 'express';
import numberHistoryController from '../controllers/number-history.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/:gameId/all', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), numberHistoryController.getAllLastSeen.bind(numberHistoryController));
router.get('/:gameId/:number/last-seen', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), numberHistoryController.getLastSeen.bind(numberHistoryController));
router.get('/:gameId/:number/history', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), numberHistoryController.getHistory.bind(numberHistoryController));

export default router;
