const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const logger = require('../config/logger');
const config = require('../config/config');
const fs = require('fs').promises;
const path = require('path');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.qrCode = null;
    this.isReady = false;
    this.isInitializing = false;
    this.connectionStatus = 'disconnected';
  }

  async initialize() {
    if (this.isInitializing || this.isReady) {
      logger.info('WhatsApp client already initializing or ready');
      return;
    }

    this.isInitializing = true;
    logger.info('Initializing WhatsApp client...');

    try {
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: config.sessionPath
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        }
      });

      this.setupEventHandlers();
      await this.client.initialize();
      
    } catch (error) {
      logger.error('Error initializing WhatsApp client:', error);
      this.isInitializing = false;
      this.connectionStatus = 'error';
      throw error;
    }
  }

  setupEventHandlers() {
    this.client.on('qr', async (qr) => {
      logger.info('QR Code received');
      this.connectionStatus = 'qr_ready';
      try {
        this.qrCode = await qrcode.toDataURL(qr);
        logger.info('QR Code generated successfully');
      } catch (error) {
        logger.error('Error generating QR code:', error);
      }
    });

    this.client.on('ready', () => {
      logger.info('WhatsApp client is ready!');
      this.isReady = true;
      this.isInitializing = false;
      this.connectionStatus = 'connected';
      this.qrCode = null;
    });

    this.client.on('authenticated', () => {
      logger.info('WhatsApp client authenticated');
      this.connectionStatus = 'authenticated';
    });

    this.client.on('auth_failure', (msg) => {
      logger.error('Authentication failure:', msg);
      this.connectionStatus = 'auth_failure';
      this.isInitializing = false;
    });

    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp client disconnected:', reason);
      this.isReady = false;
      this.connectionStatus = 'disconnected';
    });

    this.client.on('message', async (message) => {
      logger.debug('Message received:', {
        from: message.from,
        body: message.body
      });
    });
  }

  getStatus() {
    return {
      isReady: this.isReady,
      isInitializing: this.isInitializing,
      connectionStatus: this.connectionStatus,
      hasQR: !!this.qrCode
    };
  }

  getQRCode() {
    return this.qrCode;
  }

  async getGroups() {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const chats = await this.client.getChats();
      const groups = chats.filter(chat => chat.isGroup);
      
      return groups.map(group => ({
        id: group.id._serialized,
        name: group.name,
        participantsCount: group.participants ? group.participants.length : 0,
        isReadOnly: group.isReadOnly,
        timestamp: group.timestamp
      }));
    } catch (error) {
      logger.error('Error getting groups:', error);
      throw error;
    }
  }

  async getGroupDetails(groupId) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const chat = await this.client.getChatById(groupId);
      
      if (!chat.isGroup) {
        throw new Error('Chat is not a group');
      }

      return {
        id: chat.id._serialized,
        name: chat.name,
        participantsCount: chat.participants ? chat.participants.length : 0,
        participants: chat.participants ? chat.participants.map(p => ({
          id: p.id._serialized,
          isAdmin: p.isAdmin,
          isSuperAdmin: p.isSuperAdmin
        })) : [],
        isReadOnly: chat.isReadOnly,
        timestamp: chat.timestamp
      };
    } catch (error) {
      logger.error('Error getting group details:', error);
      throw error;
    }
  }

  async sendTextMessage(chatId, message) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      logger.info(`Sending text message to ${chatId}`);
      const result = await this.client.sendMessage(chatId, message);
      logger.info('Text message sent successfully');
      return {
        success: true,
        messageId: result.id._serialized,
        timestamp: result.timestamp
      };
    } catch (error) {
      logger.error('Error sending text message:', error);
      throw error;
    }
  }

  async sendImageFromUrl(chatId, imageUrl, caption = '') {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      logger.info(`Sending image from URL to ${chatId}: ${imageUrl}`);
      const media = await MessageMedia.fromUrl(imageUrl);
      const result = await this.client.sendMessage(chatId, media, { caption });
      logger.info('Image sent successfully');
      return {
        success: true,
        messageId: result.id._serialized,
        timestamp: result.timestamp
      };
    } catch (error) {
      logger.error('Error sending image from URL:', error);
      throw error;
    }
  }

  async sendImageFromPath(chatId, imagePath, caption = '') {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      logger.info(`Sending image from path to ${chatId}: ${imagePath}`);
      
      const fileData = await fs.readFile(imagePath, { encoding: 'base64' });
      const mimeType = this.getMimeType(imagePath);
      
      const media = new MessageMedia(mimeType, fileData, path.basename(imagePath));
      const result = await this.client.sendMessage(chatId, media, { caption });
      
      logger.info('Image sent successfully');
      return {
        success: true,
        messageId: result.id._serialized,
        timestamp: result.timestamp
      };
    } catch (error) {
      logger.error('Error sending image from path:', error);
      throw error;
    }
  }

  async sendImageFromBase64(chatId, base64Data, filename, caption = '') {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      logger.info(`Sending image from base64 to ${chatId}`);
      
      const mimeType = this.getMimeType(filename);
      const media = new MessageMedia(mimeType, base64Data, filename);
      const result = await this.client.sendMessage(chatId, media, { caption });
      
      logger.info('Image sent successfully');
      return {
        success: true,
        messageId: result.id._serialized,
        timestamp: result.timestamp
      };
    } catch (error) {
      logger.error('Error sending image from base64:', error);
      throw error;
    }
  }

  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  async sendToMultipleChats(chatIds, message, imageData = null) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    const results = [];
    
    for (const chatId of chatIds) {
      try {
        let result;
        
        if (imageData) {
          if (imageData.type === 'url') {
            result = await this.sendImageFromUrl(chatId, imageData.url, message);
          } else if (imageData.type === 'path') {
            result = await this.sendImageFromPath(chatId, imageData.path, message);
          } else if (imageData.type === 'base64') {
            result = await this.sendImageFromBase64(chatId, imageData.data, imageData.filename, message);
          }
        } else {
          result = await this.sendTextMessage(chatId, message);
        }
        
        results.push({
          chatId,
          success: true,
          ...result
        });
        
        await this.delay(2000);
        
      } catch (error) {
        logger.error(`Error sending to ${chatId}:`, error);
        results.push({
          chatId,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  async getContactInfo(contactId) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const contact = await this.client.getContactById(contactId);
      return {
        id: contact.id._serialized,
        name: contact.name,
        pushname: contact.pushname,
        number: contact.number,
        isMyContact: contact.isMyContact,
        isBlocked: contact.isBlocked
      };
    } catch (error) {
      logger.error('Error getting contact info:', error);
      throw error;
    }
  }

  async logout() {
    if (!this.client) {
      return;
    }

    try {
      logger.info('Logging out WhatsApp client...');
      await this.client.logout();
      this.isReady = false;
      this.connectionStatus = 'disconnected';
      this.qrCode = null;
      logger.info('WhatsApp client logged out successfully');
    } catch (error) {
      logger.error('Error logging out:', error);
      throw error;
    }
  }

  async destroy() {
    if (!this.client) {
      return;
    }

    try {
      logger.info('Destroying WhatsApp client...');
      await this.client.destroy();
      this.isReady = false;
      this.connectionStatus = 'disconnected';
      this.qrCode = null;
      this.client = null;
      logger.info('WhatsApp client destroyed successfully');
    } catch (error) {
      logger.error('Error destroying client:', error);
      throw error;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new WhatsAppService();
