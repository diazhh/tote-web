import express from 'express';
import * as gameChannelsController from '../controllers/game-channels.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas de utilidades (no requieren gameId)
router.get('/templates/variables', gameChannelsController.getTemplateVariables);
router.get('/templates/default/:channelType', gameChannelsController.getDefaultTemplate);
router.post('/templates/preview', gameChannelsController.previewTemplate);
router.get('/whatsapp/instances', gameChannelsController.getWhatsAppInstances);

// Rutas de canales por juego
router.get('/games/:gameId/channels', gameChannelsController.getGameChannels);
router.post('/games/:gameId/channels', authorize(['ADMIN', 'OPERATOR']), gameChannelsController.createGameChannel);

// Rutas de canal específico
router.get('/channels/:id', gameChannelsController.getGameChannel);
router.put('/channels/:id', authorize(['ADMIN', 'OPERATOR']), gameChannelsController.updateGameChannel);
router.delete('/channels/:id', authorize(['ADMIN']), gameChannelsController.deleteGameChannel);

export default router;
