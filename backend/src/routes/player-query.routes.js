import express from 'express';
import playerQueryController from '../controllers/player-query.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/balance', playerQueryController.getBalance.bind(playerQueryController));
router.get('/transactions', playerQueryController.getTransactions.bind(playerQueryController));
router.get('/statistics', playerQueryController.getStatistics.bind(playerQueryController));
router.get('/tickets', playerQueryController.getTickets.bind(playerQueryController));
router.get('/deposits', playerQueryController.getDeposits.bind(playerQueryController));
router.get('/withdrawals', playerQueryController.getWithdrawals.bind(playerQueryController));
router.get('/balance-history', playerQueryController.getBalanceHistory.bind(playerQueryController));

export default router;
