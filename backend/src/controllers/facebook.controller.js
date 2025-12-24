import facebookService from '../services/facebook.service.js';
import logger from '../lib/logger.js';

/**
 * Controlador para gestionar instancias de Facebook
 */
class FacebookController {
  /**
   * Crear nueva instancia de Facebook
   * POST /api/facebook/instances
   */
  async createInstance(req, res) {
    try {
      const { instanceId, name, pageAccessToken, appSecret, webhookToken, pageId } = req.body;

      if (!instanceId || !name || !pageAccessToken || !appSecret || !webhookToken || !pageId) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos son requeridos: instanceId, name, pageAccessToken, appSecret, webhookToken, pageId'
        });
      }

      const result = await facebookService.createInstance(
        instanceId,
        name,
        pageAccessToken,
        appSecret,
        webhookToken,
        pageId
      );

      res.json(result);
    } catch (error) {
      logger.error('Error al crear instancia de Facebook:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Listar todas las instancias
   * GET /api/facebook/instances
   */
  async listInstances(req, res) {
    try {
      const instances = await facebookService.listInstances();

      res.json({
        success: true,
        instances
      });
    } catch (error) {
      logger.error('Error al listar instancias de Facebook:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener instancia específica
   * GET /api/facebook/instances/:instanceId
   */
  async getInstance(req, res) {
    try {
      const { instanceId } = req.params;
      const instance = await facebookService.getInstance(instanceId);

      res.json({
        success: true,
        instance: {
          ...instance,
          pageAccessToken: '***hidden***',
          appSecret: '***hidden***'
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
   * POST /api/facebook/instances/:instanceId/send-message
   */
  async sendMessage(req, res) {
    try {
      const { instanceId } = req.params;
      const { recipientId, message, options } = req.body;

      if (!recipientId || !message) {
        return res.status(400).json({
          success: false,
          message: 'recipientId y message son requeridos'
        });
      }

      const result = await facebookService.sendMessage(instanceId, recipientId, message, options);

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
   * Enviar imagen
   * POST /api/facebook/instances/:instanceId/send-image
   */
  async sendImage(req, res) {
    try {
      const { instanceId } = req.params;
      const { recipientId, imageUrl, options } = req.body;

      if (!recipientId || !imageUrl) {
        return res.status(400).json({
          success: false,
          message: 'recipientId e imageUrl son requeridos'
        });
      }

      const result = await facebookService.sendImage(instanceId, recipientId, imageUrl, options);

      res.json(result);
    } catch (error) {
      logger.error('Error al enviar imagen:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener información del usuario
   * GET /api/facebook/instances/:instanceId/user/:userId
   */
  async getUserInfo(req, res) {
    try {
      const { instanceId, userId } = req.params;

      const result = await facebookService.getUserInfo(instanceId, userId);

      res.json(result);
    } catch (error) {
      logger.error('Error al obtener info del usuario:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Configurar webhook
   * POST /api/facebook/instances/:instanceId/webhook
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

      const result = await facebookService.setupWebhook(instanceId, webhookUrl);

      res.json(result);
    } catch (error) {
      logger.error('Error al configurar webhook:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Verificar webhook
   * GET /api/facebook/instances/:instanceId/webhook
   */
  async verifyWebhook(req, res) {
    try {
      const { instanceId } = req.params;
      const { 'hub.mode': mode, 'hub.token': token, 'hub.challenge': challenge } = req.query;

      const result = facebookService.verifyWebhook(mode, token, challenge, instanceId);

      res.send(result);
    } catch (error) {
      logger.error('Error al verificar webhook:', error);
      res.status(403).send('Forbidden');
    }
  }

  /**
   * Webhook endpoint para recibir eventos de Facebook
   * POST /api/facebook/instances/:instanceId/webhook
   */
  async handleWebhook(req, res) {
    try {
      const { instanceId } = req.params;
      const signature = req.get('X-Hub-Signature');

      const result = await facebookService.processWebhook(instanceId, req.body, signature);

      res.json(result);
    } catch (error) {
      logger.error('Error al procesar webhook:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Probar conexión
   * POST /api/facebook/instances/:instanceId/test
   */
  async testConnection(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await facebookService.testConnection(instanceId);

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
   * POST /api/facebook/instances/:instanceId/disconnect
   */
  async disconnectInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await facebookService.disconnectInstance(instanceId);

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
   * DELETE /api/facebook/instances/:instanceId
   */
  async deleteInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await facebookService.deleteInstance(instanceId);

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
   * PATCH /api/facebook/instances/:instanceId/toggle
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

      const result = await facebookService.toggleActive(instanceId, isActive);

      res.json(result);
    } catch (error) {
      logger.error('Error al cambiar estado de instancia:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new FacebookController();
