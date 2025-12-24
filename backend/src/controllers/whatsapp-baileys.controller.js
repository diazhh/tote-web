import whatsappBaileysService from '../services/whatsapp-baileys.service.js';
import logger from '../lib/logger.js';

/**
 * Controlador para gestionar instancias de WhatsApp Baileys
 */
class WhatsAppBaileysController {
  /**
   * Inicializar nueva instancia de WhatsApp
   * POST /api/whatsapp/instances
   */
  async initializeInstance(req, res) {
    try {
      const { instanceId, name, channelConfigId, channelData } = req.body;

      if (!instanceId) {
        return res.status(400).json({
          success: false,
          message: 'instanceId es requerido'
        });
      }

      const result = await whatsappBaileysService.initializeInstance(
        instanceId,
        name,
        channelConfigId,
        channelData
      );

      res.json(result);
    } catch (error) {
      logger.error('Error al inicializar instancia:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener código QR de una instancia
   * GET /api/whatsapp/instances/:instanceId/qr
   */
  async getQRCode(req, res) {
    try {
      const { instanceId } = req.params;

      try {
        const result = await whatsappBaileysService.getQRCode(instanceId);
        res.json(result);
      } catch (error) {
        // Si no hay QR disponible, intentar reinicializar la instancia
        if (error.message.includes('No hay código QR disponible') || 
            error.message.includes('necesita ser inicializada')) {
          
          logger.info(`Reinicializando instancia ${instanceId} para generar QR...`);
          
          // Reinicializar la instancia
          await whatsappBaileysService.initializeInstance(instanceId);
          
          // Esperar un poco para que se genere el QR
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Intentar obtener el QR nuevamente
          const result = await whatsappBaileysService.getQRCode(instanceId);
          res.json(result);
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error('Error al obtener QR:', error);
      
      // Proporcionar mensajes más específicos
      let statusCode = 500;
      let message = error.message;
      
      if (error.message.includes('Instancia no encontrada')) {
        statusCode = 404;
        message = 'La instancia de WhatsApp no existe. Créala primero.';
      } else if (error.message.includes('necesita ser inicializada')) {
        statusCode = 400;
        message = 'La instancia necesita ser reinicializada. Inténtalo nuevamente.';
      }
      
      res.status(statusCode).json({
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Reinicializar una instancia específica
   * POST /api/whatsapp/instances/:instanceId/reinitialize
   */
  async reinitializeInstance(req, res) {
    try {
      const { instanceId } = req.params;

      logger.info(`Reinicializando instancia ${instanceId}...`);

      const result = await whatsappBaileysService.initializeInstance(instanceId);

      res.json({
        success: true,
        message: 'Instancia reinicializada exitosamente',
        data: result
      });
    } catch (error) {
      logger.error('Error al reinicializar instancia:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener estado de una instancia
   * GET /api/whatsapp/instances/:instanceId/status
   */
  async getInstanceStatus(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await whatsappBaileysService.getInstanceStatus(instanceId);

      res.json(result);
    } catch (error) {
      logger.error('Error al obtener estado:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Listar todas las instancias
   * GET /api/whatsapp/instances
   */
  async listInstances(req, res) {
    try {
      const instances = await whatsappBaileysService.listInstances();

      res.json({
        success: true,
        instances
      });
    } catch (error) {
      logger.error('Error al listar instancias:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Desconectar instancia
   * POST /api/whatsapp/instances/:instanceId/disconnect
   */
  async disconnectInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await whatsappBaileysService.disconnectInstance(instanceId);

      res.json(result);
    } catch (error) {
      logger.error('Error al desconectar instancia:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Eliminar instancia y sus datos
   * DELETE /api/whatsapp/instances/:instanceId
   */
  async deleteInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await whatsappBaileysService.deleteInstance(instanceId);

      res.json(result);
    } catch (error) {
      logger.error('Error al eliminar instancia:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Activar/Desactivar instancia (pausar envíos)
   * PATCH /api/whatsapp/instances/:instanceId/toggle
   */
  async toggleActive(req, res) {
    try {
      const { instanceId } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'El campo isActive debe ser un booleano'
        });
      }

      const result = await whatsappBaileysService.toggleActive(instanceId, isActive);

      res.json(result);
    } catch (error) {
      logger.error('Error al cambiar estado de instancia:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Reconectar instancia
   * POST /api/whatsapp/instances/:instanceId/reconnect
   */
  async reconnectInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await whatsappBaileysService.reconnectInstance(instanceId);

      res.json(result);
    } catch (error) {
      logger.error('Error al reconectar instancia:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Enviar mensaje de prueba
   * POST /api/whatsapp/instances/:instanceId/test
   */
  async sendTestMessage(req, res) {
    try {
      const { instanceId } = req.params;
      const { phoneNumber, message } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'phoneNumber es requerido'
        });
      }

      const result = await whatsappBaileysService.sendTestMessage(
        instanceId,
        phoneNumber,
        message
      );

      res.json(result);
    } catch (error) {
      logger.error('Error al enviar mensaje de prueba:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Verificar si un número existe en WhatsApp
   * POST /api/whatsapp/instances/:instanceId/check-number
   */
  async checkNumber(req, res) {
    try {
      const { instanceId } = req.params;
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'phoneNumber es requerido'
        });
      }

      const result = await whatsappBaileysService.checkNumber(instanceId, phoneNumber);

      res.json(result);
    } catch (error) {
      logger.error('Error al verificar número:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Limpiar sesiones inactivas
   * POST /api/whatsapp/cleanup
   */
  async cleanupSessions(req, res) {
    try {
      const result = await whatsappBaileysService.cleanupSessions();

      res.json(result);
    } catch (error) {
      logger.error('Error al limpiar sesiones:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new WhatsAppBaileysController();
