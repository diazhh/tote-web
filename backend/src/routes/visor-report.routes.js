import { Router } from 'express';
import visorReportController from '../controllers/visor-report.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireViewer } from '../middlewares/fiscal-scope.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireViewer);

router.get('/scope', visorReportController.getScope.bind(visorReportController));
router.get('/report', visorReportController.getReport.bind(visorReportController));

export default router;
