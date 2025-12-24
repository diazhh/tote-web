import express from 'express';
import telegramController from '../controllers/telegram.controller.js';

const router = express.Router();

// Rutas para gestionar instancias de Telegram
router.post('/instances', telegramController.createInstance);
router.get('/instances', telegramController.listInstances);
router.get('/instances/:instanceId', telegramController.getInstance);
router.delete('/instances/:instanceId', telegramController.deleteInstance);

// Rutas para funcionalidades de Telegram
router.post('/instances/:instanceId/send-message', telegramController.sendMessage);
router.post('/instances/:instanceId/send-photo', telegramController.sendPhoto);
router.get('/instances/:instanceId/chat/:chatId', telegramController.getChatInfo);
router.post('/instances/:instanceId/webhook', telegramController.setupWebhook);
router.post('/instances/:instanceId/test', telegramController.testConnection);
router.post('/instances/:instanceId/disconnect', telegramController.disconnectInstance);
router.patch('/instances/:instanceId/toggle', telegramController.toggleActive);

// Webhook endpoint
router.post('/webhook/:instanceId', telegramController.handleWebhook);

export default router;
