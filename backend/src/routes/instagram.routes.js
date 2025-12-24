import express from 'express';
import instagramController from '../controllers/instagram.controller.js';

const router = express.Router();

// Rutas para gestionar instancias de Instagram
router.post('/instances', instagramController.createInstance);
router.get('/instances', instagramController.listInstances);
router.get('/instances/:instanceId', instagramController.getInstance);
router.delete('/instances/:instanceId', instagramController.deleteInstance);

// Rutas para autorización OAuth
router.post('/instances/:instanceId/authorize', instagramController.authorizeInstance);

// Rutas para funcionalidades de Instagram
router.get('/instances/:instanceId/media', instagramController.getUserMedia);
router.post('/instances/:instanceId/refresh-token', instagramController.refreshToken);
router.post('/instances/:instanceId/test', instagramController.testConnection);
router.post('/instances/:instanceId/disconnect', instagramController.disconnectInstance);
router.patch('/instances/:instanceId/toggle', instagramController.toggleActive);

export default router;
