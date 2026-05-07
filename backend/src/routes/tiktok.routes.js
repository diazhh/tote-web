import express from 'express';
import tiktokController from '../controllers/tiktok.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas de TikTok requieren admin
router.use(authenticate, authorize('ADMIN'));

// Rutas para gestionar instancias de TikTok
router.post('/instances', tiktokController.createInstance);
router.get('/instances', tiktokController.listInstances);
router.get('/instances/:instanceId', tiktokController.getInstance);
router.delete('/instances/:instanceId', tiktokController.deleteInstance);

// Rutas para autorización OAuth
router.post('/instances/:instanceId/authorize', tiktokController.authorizeInstance);

// Rutas para funcionalidades de TikTok
router.get('/instances/:instanceId/videos', tiktokController.getUserVideos);
router.post('/instances/:instanceId/refresh-token', tiktokController.refreshToken);
router.post('/instances/:instanceId/revoke', tiktokController.revokeAccess);
router.post('/instances/:instanceId/test', tiktokController.testConnection);
router.post('/instances/:instanceId/disconnect', tiktokController.disconnectInstance);

export default router;
