/**
 * Rutas para Análisis de Sorteos
 */

import { Router } from 'express';
import drawAnalysisController from '../controllers/draw-analysis.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Todas las rutas requieren autenticación y rol ADMIN o TAQUILLA_ADMIN
router.use(authenticate);
router.use(authorize('ADMIN', 'TAQUILLA_ADMIN', 'OPERATOR'));

// Análisis completo de impacto de ganadores
router.get('/draw/:drawId', drawAnalysisController.analyzeDrawWinnerImpact);

// Resumen rápido de análisis
router.get('/draw/:drawId/quick', drawAnalysisController.getQuickAnalysis);

export default router;
