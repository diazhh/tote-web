import { Router } from 'express';
import fiscalReportController from '../controllers/fiscal-report.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireFiscalizador } from '../middlewares/fiscal-scope.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireFiscalizador);

router.get('/scope', fiscalReportController.getScope.bind(fiscalReportController));
router.get('/report', fiscalReportController.getReport.bind(fiscalReportController));

export default router;
