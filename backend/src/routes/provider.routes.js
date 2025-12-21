import express from 'express';
import providerController from '../controllers/provider.controller.js';

const router = express.Router();

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

export default router;
