/**
 * Phase 12 — Provider Commission Engine admin routes.
 *
 * Mounted at /api/commissions in backend/src/index.js.
 *
 * Auth: all routes are admin-only — single top-level router.use(authenticate, authorize('ADMIN'))
 * gate. Mirrors backend/src/routes/provider.routes.js.
 *
 * F-5 (append-only): NO PUT, NO DELETE on /configs. Create new rows only.
 */

import express from 'express';
import commissionController from '../controllers/commission.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas son admin-only (T-12-12, T-12-18 mitigation)
router.use(authenticate, authorize('ADMIN'));

// ProviderCommissionConfig — append-only (F-5)
router.get('/configs/:apiSystemId', commissionController.listConfigs.bind(commissionController));
router.post('/configs', commissionController.createConfig.bind(commissionController));

// ProviderCommissionLedger (read-only)
router.get('/ledger', commissionController.getLedger.bind(commissionController));

// ProviderWeeklySettlement
router.get('/settlements', commissionController.getSettlements.bind(commissionController));
router.get('/settlements/:id', commissionController.getSettlementDetail.bind(commissionController));
router.patch('/settlements/:id/confirm', commissionController.confirmSettlement.bind(commissionController));
router.patch('/settlements/:id/adjust', commissionController.adjustSettlement.bind(commissionController));
router.get('/settlements/:id/excel', commissionController.exportSettlementExcel.bind(commissionController));
router.get('/settlements/:id/pdf', commissionController.exportSettlementPdf.bind(commissionController));

export default router;
