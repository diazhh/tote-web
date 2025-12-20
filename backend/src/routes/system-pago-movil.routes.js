import express from 'express';
import systemPagoMovilController from '../controllers/system-pago-movil.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/active', systemPagoMovilController.getActive.bind(systemPagoMovilController));

router.use(authorize('ADMIN', 'TAQUILLA_ADMIN'));

router.post('/', systemPagoMovilController.create.bind(systemPagoMovilController));
router.get('/', systemPagoMovilController.getAll.bind(systemPagoMovilController));
router.get('/:id', systemPagoMovilController.getById.bind(systemPagoMovilController));
router.put('/:id', systemPagoMovilController.update.bind(systemPagoMovilController));
router.delete('/:id', systemPagoMovilController.delete.bind(systemPagoMovilController));

export default router;
