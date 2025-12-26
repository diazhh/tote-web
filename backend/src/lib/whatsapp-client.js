import axios from 'axios';
import logger from './logger.js';

const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3002';
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY || '';

const whatsappClient = axios.create({
  baseURL: `${WHATSAPP_SERVICE_URL}/api/whatsapp`,
  headers: {
    'x-api-key': WHATSAPP_API_KEY,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

whatsappClient.interceptors.response.use(
  response => response,
  error => {
    logger.error('WhatsApp client error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
);

export default {
  async getStatus() {
    try {
      const response = await whatsappClient.get('/status');
      return response.data;
    } catch (error) {
      logger.error('Error getting WhatsApp status:', error.message);
      throw error;
    }
  },

  async getGroups() {
    try {
      const response = await whatsappClient.get('/groups');
      return response.data.groups;
    } catch (error) {
      logger.error('Error getting WhatsApp groups:', error.message);
      throw error;
    }
  },

  async getGroupDetails(groupId) {
    try {
      const response = await whatsappClient.get(`/groups/${groupId}`);
      return response.data;
    } catch (error) {
      logger.error('Error getting group details:', error.message);
      throw error;
    }
  },

  async sendTextMessage(chatId, message) {
    try {
      const response = await whatsappClient.post('/send/text', {
        chatId,
        message
      });
      return response.data;
    } catch (error) {
      logger.error('Error sending text message:', error.message);
      throw error;
    }
  },

  async sendImageFromUrl(chatId, imageUrl, caption = '') {
    try {
      const response = await whatsappClient.post('/send/image', {
        chatId,
        imageUrl,
        caption
      });
      return response.data;
    } catch (error) {
      logger.error('Error sending image from URL:', error.message);
      throw error;
    }
  },

  async sendImageFromPath(chatId, imagePath, caption = '') {
    try {
      const response = await whatsappClient.post('/send/image', {
        chatId,
        imagePath,
        caption
      });
      return response.data;
    } catch (error) {
      logger.error('Error sending image from path:', error.message);
      throw error;
    }
  },

  async sendToMultipleGroups(groupIds, message, imageUrl = null) {
    try {
      const payload = {
        chatIds: groupIds,
        message
      };

      if (imageUrl) {
        payload.imageData = {
          type: 'url',
          url: imageUrl
        };
      }

      const response = await whatsappClient.post('/send/multiple', payload);
      return response.data;
    } catch (error) {
      logger.error('Error sending to multiple groups:', error.message);
      throw error;
    }
  },

  async initialize() {
    try {
      const response = await whatsappClient.post('/initialize');
      return response.data;
    } catch (error) {
      logger.error('Error initializing WhatsApp:', error.message);
      throw error;
    }
  },

  async getQRCode() {
    try {
      const response = await whatsappClient.get('/qr');
      return response.data;
    } catch (error) {
      logger.error('Error getting QR code:', error.message);
      throw error;
    }
  },

  async logout() {
    try {
      const response = await whatsappClient.post('/logout');
      return response.data;
    } catch (error) {
      logger.error('Error logging out WhatsApp:', error.message);
      throw error;
    }
  },

  async destroy() {
    try {
      const response = await whatsappClient.post('/destroy');
      return response.data;
    } catch (error) {
      logger.error('Error destroying WhatsApp client:', error.message);
      throw error;
    }
  }
};
