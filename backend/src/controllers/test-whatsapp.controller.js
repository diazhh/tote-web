import sessionManager from '../lib/whatsapp/session-manager.js';
import logger from '../lib/logger.js';

/**
 * Controlador temporal para probar envío a grupos de WhatsApp
 */
class TestWhatsAppController {
  /**
   * Probar envío de imagen a grupo
   */
  async testGroupImage(req, res) {
    try {
      const { groupJid, imageUrl, caption } = req.body;
      const instanceId = 'ws';

      logger.info(`🧪 Probando envío a grupo: ${groupJid}`);

      // Verificar conexión
      const isConnected = sessionManager.isConnected(instanceId);
      if (!isConnected) {
        return res.status(400).json({
          success: false,
          error: 'Instancia WhatsApp no está conectada'
        });
      }

      // Intentar envío
      const result = await sessionManager.sendImageFromUrl(
        instanceId,
        groupJid,
        imageUrl,
        caption
      );

      logger.info(`✅ Imagen enviada exitosamente a ${groupJid}`);

      res.json({
        success: true,
        result: {
          messageId: result.key?.id,
          remoteJid: result.key?.remoteJid,
          timestamp: result.messageTimestamp
        }
      });
    } catch (error) {
      logger.error('Error en testGroupImage:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Probar envío de texto a grupo
   */
  async testGroupText(req, res) {
    try {
      const { groupJid, message } = req.body;
      const instanceId = 'ws';

      logger.info(`🧪 Probando envío de texto a grupo: ${groupJid}`);

      const isConnected = sessionManager.isConnected(instanceId);
      if (!isConnected) {
        return res.status(400).json({
          success: false,
          error: 'Instancia WhatsApp no está conectada'
        });
      }

      const result = await sessionManager.sendTextMessage(
        instanceId,
        groupJid,
        message
      );

      logger.info(`✅ Texto enviado exitosamente a ${groupJid}`);

      res.json({
        success: true,
        result: {
          messageId: result.key?.id,
          remoteJid: result.key?.remoteJid
        }
      });
    } catch (error) {
      logger.error('Error en testGroupText:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Listar grupos disponibles
   */
  async listGroups(req, res) {
    try {
      const instanceId = 'ws';

      const isConnected = sessionManager.isConnected(instanceId);
      if (!isConnected) {
        return res.status(400).json({
          success: false,
          error: 'Instancia WhatsApp no está conectada'
        });
      }

      const groups = await sessionManager.getGroups(instanceId);

      res.json({
        success: true,
        total: groups.length,
        groups: groups.map(g => ({
          id: g.id,
          subject: g.subject,
          size: g.size,
          creation: g.creation
        }))
      });
    } catch (error) {
      logger.error('Error en listGroups:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Verificar estado de conexión
   */
  async checkConnection(req, res) {
    try {
      const instanceId = 'ws';
      const session = sessionManager.getSession(instanceId);
      const isConnected = sessionManager.isConnected(instanceId);
      const sessionInfo = sessionManager.getSessionInfo(instanceId);

      res.json({
        success: true,
        instanceId,
        sessionExists: !!session,
        isConnected,
        sessionInfo: sessionInfo ? {
          phoneNumber: sessionInfo.phoneNumber,
          status: sessionInfo.status,
          connectedAt: sessionInfo.connectedAt
        } : null
      });
    } catch (error) {
      logger.error('Error en checkConnection:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new TestWhatsAppController();
