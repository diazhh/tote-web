/**
 * Phase 14 Plan 14-03 — Weekly P&L routes.
 *
 * Mounted at /api/reportes in index.js. All routes admin-gated via the same
 * authenticate + authorize('ADMIN', 'OPERATOR') pair used by monitor.routes.js.
 *
 * Excel/PDF MUST be registered BEFORE the JSON /pnl/semanal route to avoid
 * Express path conflicts (mirrors monitor.routes.js:23-27 convention).
 */

import { Router } from 'express';
import pnlReportController from '../controllers/pnl-report.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN', 'OPERATOR'));

// Excel / PDF first (more specific paths) to dodge any future :path routes
router.get('/pnl/semanal/excel',           pnlReportController.downloadPnlExcel);
router.get('/pnl/semanal/proveedor/pdf',   pnlReportController.downloadProviderPnlPdf);
router.get('/pnl/semanal/pdf',             pnlReportController.downloadPnlPdf);
router.get('/pnl/semanal',                 pnlReportController.getWeeklyPnl);

export default router;
