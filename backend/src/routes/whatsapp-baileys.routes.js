import express from 'express';
import whatsappBaileysController from '../controllers/whatsapp-baileys.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * @route   POST /api/whatsapp/instances
 * @desc    Inicializar nueva instancia de WhatsApp
 * @access  Private
 */
router.post('/instances', whatsappBaileysController.initializeInstance);

/**
 * @route   GET /api/whatsapp/instances
 * @desc    Listar todas las instancias
 * @access  Private
 */
router.get('/instances', whatsappBaileysController.listInstances);

/**
 * @route   GET /api/whatsapp/instances/:instanceId/qr
 * @desc    Obtener código QR de una instancia
 * @access  Private
 */
router.get('/instances/:instanceId/qr', whatsappBaileysController.getQRCode);

/**
 * @route   GET /api/whatsapp/instances/:instanceId/status
 * @desc    Obtener estado de una instancia
 * @access  Private
 */
router.get('/instances/:instanceId/status', whatsappBaileysController.getInstanceStatus);

/**
 * @route   POST /api/whatsapp/instances/:instanceId/reinitialize
 * @desc    Reinicializar instancia (generar nuevo QR)
 * @access  Private
 */
router.post('/instances/:instanceId/reinitialize', whatsappBaileysController.reinitializeInstance);

/**
 * @route   POST /api/whatsapp/instances/:instanceId/reconnect
 * @desc    Reconectar instancia
 * @access  Private
 */
router.post('/instances/:instanceId/reconnect', whatsappBaileysController.reconnectInstance);

/**
 * @route   POST /api/whatsapp/instances/:instanceId/disconnect
 * @desc    Desconectar instancia
 * @access  Private
 */
router.post('/instances/:instanceId/disconnect', whatsappBaileysController.disconnectInstance);

/**
 * @route   DELETE /api/whatsapp/instances/:instanceId
 * @desc    Eliminar instancia y sus datos
 * @access  Private
 */
router.delete('/instances/:instanceId', whatsappBaileysController.deleteInstance);

/**
 * @route   POST /api/whatsapp/instances/:instanceId/test
 * @desc    Enviar mensaje de prueba
 * @access  Private
 */
router.post('/instances/:instanceId/test', whatsappBaileysController.sendTestMessage);

/**
 * @route   POST /api/whatsapp/instances/:instanceId/check-number
 * @desc    Verificar si un número existe en WhatsApp
 * @access  Private
 */
router.post('/instances/:instanceId/check-number', whatsappBaileysController.checkNumber);

/**
 * @route   PATCH /api/whatsapp/instances/:instanceId/toggle
 * @desc    Activar/Desactivar instancia (pausar envíos)
 * @access  Private
 */
router.patch('/instances/:instanceId/toggle', whatsappBaileysController.toggleActive);

/**
 * @route   POST /api/whatsapp/cleanup
 * @desc    Limpiar sesiones inactivas
 * @access  Private
 */
router.post('/cleanup', whatsappBaileysController.cleanupSessions);

/**
 * @route   GET /api/whatsapp/instances/:instanceId/groups
 * @desc    Obtener grupos de una instancia de WhatsApp
 * @access  Private
 */
router.get('/instances/:instanceId/groups', whatsappBaileysController.getGroups);

export default router;
