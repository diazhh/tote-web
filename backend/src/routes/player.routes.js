import express from 'express';
import playerController from '../controllers/player.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Read-only routes - ADMIN and TAQUILLA_ADMIN
router.get('/', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayers);
router.get('/:id', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerDetails);
router.get('/:id/tickets', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerTickets);
router.get('/:id/tripletas', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerTripletas);
router.get('/:id/movements', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerMovements);
router.get('/:id/stats', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerStats);
router.get('/:id/deposits', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerDeposits);
router.get('/:id/withdrawals', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerWithdrawals);

// Admin action routes - ADMIN only
router.patch('/:id/status', authenticate, authorize('ADMIN'), playerController.toggleStatus);
router.patch('/:id/profile', authenticate, authorize('ADMIN'), playerController.updateProfile);
router.post('/:id/send-reset-link', authenticate, authorize('ADMIN'), playerController.sendResetLink);
router.post('/:id/adjustment', authenticate, authorize('ADMIN'), playerController.adjustBalance);
router.post('/:id/bonus', authenticate, authorize('ADMIN'), playerController.giveBonus);

export default router;
