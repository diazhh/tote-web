import { Router } from 'express';
import conciliacionController from '../controllers/conciliacion.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/', conciliacionController.getReport.bind(conciliacionController));

export default router;
