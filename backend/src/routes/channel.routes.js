import express from 'express';
import channelController from '../controllers/channel.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// GET /api/channels
router.get('/', channelController.getAll.bind(channelController));

// GET /api/channels/:id
router.get('/:id', channelController.getById.bind(channelController));

// POST /api/channels
router.post('/', authorize('ADMIN', 'OPERATOR'), channelController.create.bind(channelController));

// PUT /api/channels/:id
router.put('/:id', authorize('ADMIN', 'OPERATOR'), channelController.update.bind(channelController));

// DELETE /api/channels/:id
router.delete('/:id', authorize('ADMIN'), channelController.delete.bind(channelController));

// POST /api/channels/:id/test
router.post('/:id/test', authorize('ADMIN', 'OPERATOR'), channelController.testConnection.bind(channelController));

// POST /api/channels/:id/test-publish
router.post('/:id/test-publish', authorize('ADMIN', 'OPERATOR'), channelController.testPublish.bind(channelController));

export default router;
