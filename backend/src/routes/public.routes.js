import express from 'express';
import publicController from '../controllers/public.controller.js';

const router = express.Router();

// Todas las rutas son públicas (sin autenticación)
router.get('/games', publicController.getGames.bind(publicController));
router.get('/draws/today', publicController.getDrawsToday.bind(publicController));
router.get('/draws/by-date', publicController.getDrawsByDate.bind(publicController));
router.get('/draws/next', publicController.getNextDraws.bind(publicController));
router.get('/draws/:id', publicController.getDraw.bind(publicController));
router.get('/draws/game/:gameSlug/today', publicController.getGameDrawsToday.bind(publicController));
router.get('/draws/game/:gameSlug/history', publicController.getGameHistory.bind(publicController));
router.get('/stats/game/:gameSlug', publicController.getGameStats.bind(publicController));

export default router;
