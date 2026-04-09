/**
 * Rutas para el Monitor de Sorteos
 */

import { Router } from 'express';
import monitorController from '../controllers/monitor.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Todas las rutas requieren autenticación y rol ADMIN o TAQUILLA_ADMIN
router.use(authenticate);
router.use(authorize('ADMIN', 'OPERATOR'));

// Estadísticas por banca
router.get('/bancas/:drawId', monitorController.getBancaStats);

// Estadísticas por número/item
router.get('/items/:drawId/filtered', monitorController.getItemStatsFiltered);
router.get('/items/:drawId', monitorController.getItemStats);

// Lista de tickets con filtros
router.get('/tickets', monitorController.getTicketList);

// Reporte PDF (debe ir ANTES de /reporte para evitar conflicto de rutas)
router.get('/reporte/pdf', monitorController.getReportePdf);

// Reporte diario
router.get('/reporte', monitorController.getDailyReport);

// Tickets por banca
router.get('/tickets-by-banca/:drawId/:bancaId', monitorController.getTicketsByBanca);

// Tickets por item
router.get('/tickets-by-item/:drawId/:itemId', monitorController.getTicketsByItem);

// Tripletas por item
router.get('/tripletas-by-item/:drawId/:itemId', monitorController.getTripletasByItem);

export default router;
