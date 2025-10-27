import express from 'express';
import drawTemplateController from '../controllers/draw-template.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

router.get('/', drawTemplateController.getAll.bind(drawTemplateController));
router.get('/:id', drawTemplateController.getById.bind(drawTemplateController));
router.post('/', authorize('ADMIN', 'OPERATOR'), drawTemplateController.create.bind(drawTemplateController));
router.patch('/:id', authorize('ADMIN', 'OPERATOR'), drawTemplateController.update.bind(drawTemplateController));
router.delete('/:id', authorize('ADMIN'), drawTemplateController.delete.bind(drawTemplateController));

export default router;
