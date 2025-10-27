/**
 * Rutas para gestión de juegos
 */

import express from 'express';
import gameController from '../controllers/game.controller.js';

const router = express.Router();

// GET /api/games
router.get('/', gameController.getAllGames.bind(gameController));

// GET /api/games/slug/:slug
router.get('/slug/:slug', gameController.getGameBySlug.bind(gameController));

// GET /api/games/:id
router.get('/:id', gameController.getGameById.bind(gameController));

// GET /api/games/:id/stats
router.get('/:id/stats', gameController.getGameStats.bind(gameController));

// GET /api/games/:id/items
router.get('/:id/items', gameController.getGameItems.bind(gameController));

// POST /api/games
router.post('/', gameController.createGame.bind(gameController));

// PUT /api/games/:id
router.put('/:id', gameController.updateGame.bind(gameController));

// DELETE /api/games/:id
router.delete('/:id', gameController.deleteGame.bind(gameController));

export default router;
