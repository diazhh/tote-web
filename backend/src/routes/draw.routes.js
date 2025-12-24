/**
 * Rutas para gestión de sorteos
 */

import express from 'express';
import drawController from '../controllers/draw.controller.js';

const router = express.Router();

// GET /api/draws
router.get('/', drawController.getDraws.bind(drawController));

// GET /api/draws/today
router.get('/today', drawController.getTodayDraws.bind(drawController));

// GET /api/draws/next
router.get('/next', drawController.getNextDraw.bind(drawController));

// GET /api/draws/stats
router.get('/stats', drawController.getDrawStats.bind(drawController));

// GET /api/draws/:id
router.get('/:id', drawController.getDrawById.bind(drawController));

// POST /api/draws
router.post('/', drawController.createDraw.bind(drawController));

// PUT /api/draws/:id
router.put('/:id', drawController.updateDraw.bind(drawController));

// POST /api/draws/:id/close
router.post('/:id/close', drawController.closeDraw.bind(drawController));

// POST /api/draws/:id/execute
router.post('/:id/execute', drawController.executeDraw.bind(drawController));

// POST /api/draws/:id/preselect
router.post('/:id/preselect', drawController.preselectWinner.bind(drawController));

// POST /api/draws/:id/change-winner
router.post('/:id/change-winner', drawController.changeWinner.bind(drawController));

// POST /api/draws/:id/cancel
router.post('/:id/cancel', drawController.cancelDraw.bind(drawController));

// GET /api/draws/:id/analyze-prewinner - Analizar sin ejecutar
router.get('/:id/analyze-prewinner', drawController.analyzePrewinner.bind(drawController));

// POST /api/draws/:id/select-prewinner - Ejecutar selección automática
router.post('/:id/select-prewinner', drawController.selectPrewinner.bind(drawController));

// POST /api/draws/:id/force-totalize - Totalizar manualmente
router.post('/:id/force-totalize', drawController.forceTotalize.bind(drawController));

// POST /api/draws/:id/regenerate-image - Regenerar imagen
router.post('/:id/regenerate-image', drawController.regenerateImage.bind(drawController));

// POST /api/draws/:id/republish - Republicar en canales
router.post('/:id/republish', drawController.republish.bind(drawController));

export default router;
