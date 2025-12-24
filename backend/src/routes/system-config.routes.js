import express from 'express';
import systemConfigController from '../controllers/system-config.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Configuraciones generales
router.get('/config', authorize('ADMIN'), systemConfigController.getAll.bind(systemConfigController));
router.get('/config/:key', authorize('ADMIN'), systemConfigController.get.bind(systemConfigController));
router.post('/config', authorize('ADMIN'), systemConfigController.set.bind(systemConfigController));
router.delete('/config/:key', authorize('ADMIN'), systemConfigController.delete.bind(systemConfigController));

// Parada de emergencia
router.get('/emergency-stop', systemConfigController.getEmergencyStop.bind(systemConfigController));
router.post('/emergency-stop/enable', authorize('ADMIN'), systemConfigController.enableEmergencyStop.bind(systemConfigController));
router.post('/emergency-stop/disable', authorize('ADMIN'), systemConfigController.disableEmergencyStop.bind(systemConfigController));

// Jugadas de prueba
router.get('/test-bets', authorize('ADMIN'), systemConfigController.getTestBets.bind(systemConfigController));
router.post('/test-bets/enable', authorize('ADMIN'), systemConfigController.enableTestBets.bind(systemConfigController));
router.post('/test-bets/disable', authorize('ADMIN'), systemConfigController.disableTestBets.bind(systemConfigController));

export default router;
