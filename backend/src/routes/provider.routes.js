import express from 'express';
import providerController from '../controllers/provider.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas de provider son admin-only
router.use(authenticate, authorize('ADMIN'));

// Rutas para ApiSystem
router.get('/systems', providerController.getAllSystems.bind(providerController));
router.get('/systems/:id', providerController.getSystemById.bind(providerController));
router.post('/systems', providerController.createSystem.bind(providerController));
router.put('/systems/:id', providerController.updateSystem.bind(providerController));
router.delete('/systems/:id', providerController.deleteSystem.bind(providerController));

// Rutas para ApiConfiguration
router.get('/configurations', providerController.getAllConfigurations.bind(providerController));
router.get('/configurations/:id', providerController.getConfigurationById.bind(providerController));
router.post('/configurations', providerController.createConfiguration.bind(providerController));
router.put('/configurations/:id', providerController.updateConfiguration.bind(providerController));
router.delete('/configurations/:id', providerController.deleteConfiguration.bind(providerController));

// Rutas especiales
router.post('/configurations/:id/test', providerController.testConfiguration.bind(providerController));
router.get('/configurations/:id/stats', providerController.getConfigurationStats.bind(providerController));

// Rutas de webhook para sistemas
router.post('/systems/:id/generate-token', providerController.generateToken.bind(providerController));
router.get('/systems/:id/adapter-status', providerController.getAdapterStatus.bind(providerController));

// Asegura credenciales (token + portal) y genera la guía de integración (.docx)
router.post('/systems/:id/integration-doc', providerController.generateIntegrationDoc.bind(providerController));

// Portal user management (ADMIN only — guard ya aplicado al router)
router.get('/systems/:id/portal-user', providerController.getPortalUser.bind(providerController));
router.post('/systems/:id/portal-user', providerController.createPortalUser.bind(providerController));
router.put('/systems/:id/portal-user/password', providerController.resetPortalUserPassword.bind(providerController));

// Logs de webhook
router.get('/webhook-logs', providerController.getWebhookLogs.bind(providerController));

// Intentos de auth rechazados (401) — diagnóstico de tokens incorrectos
router.get('/webhook-auth-failures', providerController.getWebhookAuthFailures.bind(providerController));

export default router;
