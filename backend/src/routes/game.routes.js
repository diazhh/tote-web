/**
 * Rutas para gestión de juegos
 */

import express from 'express';
import gameController from '../controllers/game.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Lecturas públicas (consumidas por /jugar)
router.get('/', gameController.getAllGames.bind(gameController));
router.get('/slug/:slug', gameController.getGameBySlug.bind(gameController));
router.get('/:id', gameController.getGameById.bind(gameController));
router.get('/:id/stats', gameController.getGameStats.bind(gameController));
router.get('/:id/items', gameController.getGameItems.bind(gameController));

// Mutaciones requieren admin
router.use(authenticate, authorize('ADMIN'));

router.post('/', gameController.createGame.bind(gameController));
router.put('/:id', gameController.updateGame.bind(gameController));
router.delete('/:id', gameController.deleteGame.bind(gameController));

export default router;
