import express from 'express';
import drawPauseController from '../controllers/draw-pause.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

router.get('/', drawPauseController.getAll.bind(drawPauseController));
router.get('/:id', drawPauseController.getById.bind(drawPauseController));
router.post('/', authorize('ADMIN', 'OPERATOR'), drawPauseController.create.bind(drawPauseController));
router.patch('/:id', authorize('ADMIN', 'OPERATOR'), drawPauseController.update.bind(drawPauseController));
router.delete('/:id', authorize('ADMIN'), drawPauseController.delete.bind(drawPauseController));

export default router;
