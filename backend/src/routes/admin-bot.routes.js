import { Router } from 'express';
import adminBotController from '../controllers/admin-bot.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// ============================================
// RUTAS DE BOTS (Solo ADMIN)
// ============================================

// Listar todos los bots
router.get('/bots', authorize('ADMIN'), adminBotController.listBots.bind(adminBotController));

// Obtener un bot específico
router.get('/bots/:id', authorize('ADMIN'), adminBotController.getBot.bind(adminBotController));

// Crear un nuevo bot
router.post('/bots', authorize('ADMIN'), adminBotController.createBot.bind(adminBotController));

// Actualizar un bot
router.put('/bots/:id', authorize('ADMIN'), adminBotController.updateBot.bind(adminBotController));

// Eliminar un bot
router.delete('/bots/:id', authorize('ADMIN'), adminBotController.deleteBot.bind(adminBotController));

// Asignar juegos a un bot
router.post('/bots/:id/games', authorize('ADMIN'), adminBotController.assignGames.bind(adminBotController));

// Enviar mensaje de prueba
router.post('/bots/:id/test', authorize('ADMIN'), adminBotController.testBot.bind(adminBotController));

// ============================================
// RUTAS DE VINCULACIÓN TELEGRAM (Todos los usuarios autenticados)
// ============================================

// Generar código de vinculación
router.post('/telegram/link-code', adminBotController.generateLinkCode.bind(adminBotController));

// Desvincular Telegram
router.delete('/telegram/unlink', adminBotController.unlinkTelegram.bind(adminBotController));

// Obtener estado de vinculación
router.get('/telegram/status', adminBotController.getTelegramStatus.bind(adminBotController));

// Activar/desactivar notificaciones para un juego
router.put('/games/:gameId/notify', adminBotController.toggleGameNotify.bind(adminBotController));

export default router;
