const whatsappService = require('../services/whatsapp.service');
const logger = require('../config/logger');

class WhatsAppController {
  async initialize(req, res) {
    try {
      await whatsappService.initialize();
      res.json({ 
        success: true, 
        message: 'WhatsApp client initialization started',
        status: whatsappService.getStatus()
      });
    } catch (error) {
      logger.error('Error in initialize controller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getStatus(req, res) {
    try {
      const status = whatsappService.getStatus();
      res.json(status);
    } catch (error) {
      logger.error('Error in getStatus controller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getQRCode(req, res) {
    try {
      const qrCode = whatsappService.getQRCode();
      
      if (!qrCode) {
        return res.status(404).json({ 
          error: 'QR code not available',
          message: 'Client may already be authenticated or not initialized'
        });
      }
      
      res.json({ qrCode });
    } catch (error) {
      logger.error('Error in getQRCode controller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getGroups(req, res) {
    try {
      const groups = await whatsappService.getGroups();
      res.json({ groups });
    } catch (error) {
      logger.error('Error in getGroups controller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getGroupDetails(req, res) {
    try {
      const { groupId } = req.params;
      const details = await whatsappService.getGroupDetails(groupId);
      res.json(details);
    } catch (error) {
      logger.error('Error in getGroupDetails controller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async sendTextMessage(req, res) {
    try {
      const { chatId, message } = req.body;
      
      if (!chatId || !message) {
        return res.status(400).json({ error: 'chatId and message are required' });
      }
      
      const result = await whatsappService.sendTextMessage(chatId, message);
      res.json(result);
    } catch (error) {
      logger.error('Error in sendTextMessage controller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async sendImage(req, res) {
    try {
      const { chatId, caption, imageUrl, imagePath, imageBase64, filename } = req.body;
      
      if (!chatId) {
        return res.status(400).json({ error: 'chatId is required' });
      }
      
      let result;
      
      if (imageUrl) {
        result = await whatsappService.sendImageFromUrl(chatId, imageUrl, caption || '');
      } else if (imagePath) {
        result = await whatsappService.sendImageFromPath(chatId, imagePath, caption || '');
      } else if (imageBase64 && filename) {
        result = await whatsappService.sendImageFromBase64(chatId, imageBase64, filename, caption || '');
      } else {
        return res.status(400).json({ 
          error: 'Either imageUrl, imagePath, or (imageBase64 + filename) is required' 
        });
      }
      
      res.json(result);
    } catch (error) {
      logger.error('Error in sendImage controller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async sendToMultiple(req, res) {
    try {
      const { chatIds, message, imageData } = req.body;
      
      if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
        return res.status(400).json({ error: 'chatIds array is required' });
      }
      
      if (!message) {
        return res.status(400).json({ error: 'message is required' });
      }
      
      const results = await whatsappService.sendToMultipleChats(chatIds, message, imageData);
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      res.json({
        success: true,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failCount
        },
        results
      });
    } catch (error) {
      logger.error('Error in sendToMultiple controller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getContactInfo(req, res) {
    try {
      const { contactId } = req.params;
      const info = await whatsappService.getContactInfo(contactId);
      res.json(info);
    } catch (error) {
      logger.error('Error in getContactInfo controller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async logout(req, res) {
    try {
      await whatsappService.logout();
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Error in logout controller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async destroy(req, res) {
    try {
      await whatsappService.destroy();
      res.json({ success: true, message: 'Client destroyed successfully' });
    } catch (error) {
      logger.error('Error in destroy controller:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new WhatsAppController();
