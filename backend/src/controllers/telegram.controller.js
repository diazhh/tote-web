import telegramService from '../services/telegram.service.js';
import logger from '../lib/logger.js';

/**
 * Controlador para gestionar instancias de Telegram
 */
class TelegramController {
  /**
   * Crear nueva instancia de Telegram
   * POST /api/telegram/instances
   */
  async createInstance(req, res) {
    try {
      const { instanceId, name, botToken, chatId, webhookUrl } = req.body;

      if (!instanceId || !name || !botToken) {
        return res.status(400).json({
          success: false,
          message: 'instanceId, name y botToken son requeridos'
        });
      }

      const result = await telegramService.createInstance(
        instanceId,
        name,
        botToken,
        chatId,
        webhookUrl
      );

      res.json(result);
    } catch (error) {
      logger.error('Error al crear instancia de Telegram:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Listar todas las instancias
   * GET /api/telegram/instances
   */
  async listInstances(req, res) {
    try {
      const instances = await telegramService.listInstances();

      res.json({
        success: true,
        instances
      });
    } catch (error) {
      logger.error('Error al listar instancias de Telegram:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener instancia específica
   * GET /api/telegram/instances/:instanceId
   */
  async getInstance(req, res) {
    try {
      const { instanceId } = req.params;
      const instance = await telegramService.getInstance(instanceId);

      res.json({
        success: true,
        instance: {
          ...instance,
          botToken: '***hidden***'
        }
      });
    } catch (error) {
      logger.error('Error al obtener instancia:', error);
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Enviar mensaje
   * POST /api/telegram/instances/:instanceId/send-message
   */
  async sendMessage(req, res) {
    try {
      const { instanceId } = req.params;
      const { chatId, message, options } = req.body;

      if (!chatId || !message) {
        return res.status(400).json({
          success: false,
          message: 'chatId y message son requeridos'
        });
      }

      const result = await telegramService.sendMessage(instanceId, chatId, message, options);

      res.json(result);
    } catch (error) {
      logger.error('Error al enviar mensaje:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Enviar foto
   * POST /api/telegram/instances/:instanceId/send-photo
   */
  async sendPhoto(req, res) {
    try {
      const { instanceId } = req.params;
      const { chatId, photo, caption, options } = req.body;

      if (!chatId || !photo) {
        return res.status(400).json({
          success: false,
          message: 'chatId y photo son requeridos'
        });
      }

      const result = await telegramService.sendPhoto(instanceId, chatId, photo, caption, options);

      res.json(result);
    } catch (error) {
      logger.error('Error al enviar foto:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener información del chat
   * GET /api/telegram/instances/:instanceId/chat/:chatId
   */
  async getChatInfo(req, res) {
    try {
      const { instanceId, chatId } = req.params;

      const result = await telegramService.getChatInfo(instanceId, chatId);

      res.json(result);
    } catch (error) {
      logger.error('Error al obtener info del chat:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Configurar webhook
   * POST /api/telegram/instances/:instanceId/webhook
   */
  async setupWebhook(req, res) {
    try {
      const { instanceId } = req.params;
      const { webhookUrl } = req.body;

      if (!webhookUrl) {
        return res.status(400).json({
          success: false,
          message: 'webhookUrl es requerido'
        });
      }

      const instance = await telegramService.getInstance(instanceId);
      const result = await telegramService.setWebhook(instance.botToken, webhookUrl);

      res.json({
        success: true,
        result,
        message: 'Webhook configurado exitosamente'
      });
    } catch (error) {
      logger.error('Error al configurar webhook:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Probar conexión
   * POST /api/telegram/instances/:instanceId/test
   */
  async testConnection(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await telegramService.testConnection(instanceId);

      res.json(result);
    } catch (error) {
      logger.error('Error al probar conexión:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Desconectar instancia
   * POST /api/telegram/instances/:instanceId/disconnect
   */
  async disconnectInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await telegramService.disconnectInstance(instanceId);

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
   * Eliminar instancia
   * DELETE /api/telegram/instances/:instanceId
   */
  async deleteInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await telegramService.deleteInstance(instanceId);

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
   * Webhook endpoint para recibir actualizaciones de Telegram
   * POST /api/telegram/webhook/:instanceId
   */
  async handleWebhook(req, res) {
    try {
      const { instanceId } = req.params;
      const update = req.body;

      logger.info(`Webhook recibido para instancia ${instanceId}:`, update);

      // Aquí puedes implementar la lógica para manejar las actualizaciones
      // Por ejemplo, responder a comandos, procesar mensajes, etc.

      // Actualizar última actividad
      await telegramService.updateLastSeen(instanceId);

      res.json({ success: true });
    } catch (error) {
      logger.error('Error al procesar webhook:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new TelegramController();
