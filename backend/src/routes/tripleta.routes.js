/**
 * Rutas para gestión de apuestas Tripleta
 */

import express from 'express';
import tripletaController from '../controllers/tripleta.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/bet', authenticate, authorize('PLAYER'), tripletaController.createTripleBet);

router.get('/my-bets', authenticate, authorize('PLAYER'), tripletaController.getMyTripleBets);

router.get('/:id', authenticate, tripletaController.getTripleBetById);

router.get('/:id/draws', authenticate, tripletaController.getDrawsForTripleta);

router.get('/game/:gameId/stats', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), tripletaController.getGameTripletaStats);

router.post('/check-draw/:drawId', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), tripletaController.checkTripleBetsForDraw);

export default router;
