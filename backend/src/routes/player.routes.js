import express from 'express';
import playerController from '../controllers/player.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación y rol ADMIN o TAQUILLA_ADMIN
router.get('/', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayers);
router.get('/:id', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerDetails);
router.get('/:id/tickets', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerTickets);
router.get('/:id/tripletas', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerTripletas);
router.get('/:id/movements', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerMovements);
router.get('/:id/stats', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), playerController.getPlayerStats);

export default router;
