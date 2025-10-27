import express from 'express';
import facebookController from '../controllers/facebook.controller.js';

const router = express.Router();

// Rutas para gestionar instancias de Facebook
router.post('/instances', facebookController.createInstance);
router.get('/instances', facebookController.listInstances);
router.get('/instances/:instanceId', facebookController.getInstance);
router.delete('/instances/:instanceId', facebookController.deleteInstance);

// Rutas para funcionalidades de Facebook Messenger
router.post('/instances/:instanceId/send-message', facebookController.sendMessage);
router.post('/instances/:instanceId/send-image', facebookController.sendImage);
router.get('/instances/:instanceId/user/:userId', facebookController.getUserInfo);
router.post('/instances/:instanceId/webhook', facebookController.setupWebhook);
router.post('/instances/:instanceId/test', facebookController.testConnection);
router.post('/instances/:instanceId/disconnect', facebookController.disconnectInstance);

// Webhook endpoints
router.get('/instances/:instanceId/webhook', facebookController.verifyWebhook);
router.post('/instances/:instanceId/webhook', facebookController.handleWebhook);

export default router;
