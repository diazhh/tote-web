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
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 10000; // 10 segundos
    this.reconnectTimeout = null;
  }

  async initialize() {
    if (this.isInitializing) {
      logger.info('WhatsApp client already initializing, skipping...');
      return;
    }

    if (this.isReady) {
      logger.info('WhatsApp client already ready');
      return;
    }

    this.isInitializing = true;
    logger.info('Initializing WhatsApp client...');

    try {
      // Limpiar cliente anterior si existe
      if (this.client) {
        logger.info('Cleaning up previous client instance...');
        try {
          await this.client.destroy();
        } catch (err) {
          logger.warn('Error destroying previous client:', err.message);
        }
        this.client = null;
      }

      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: config.sessionPath
        }),
        puppeteer: {
          headless: true,
          executablePath: '/usr/bin/chromium-browser',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        },
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
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
      this.isReady = false;
      this.isInitializing = false;
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
      this.reconnectAttempts = 0;
    });

    this.client.on('authenticated', () => {
      logger.info('WhatsApp client authenticated');
      this.connectionStatus = 'authenticated';
      this.isInitializing = false;
      this.qrCode = null;
      this.reconnectAttempts = 0;

      // Cuando hay sesión guardada, el evento 'ready' puede no dispararse
      // Configurar timeout para forzar el estado ready si no se dispara en 10s
      setTimeout(() => {
        if (!this.isReady && this.connectionStatus === 'authenticated') {
          logger.warn('Ready event not fired after 10s, forcing ready state...');
          this.isReady = true;
          this.connectionStatus = 'connected';
          logger.info('WhatsApp client forced to ready state');
        }
      }, 10000);
    });

    this.client.on('auth_failure', (msg) => {
      logger.error('Authentication failure:', msg);
      this.connectionStatus = 'auth_failure';
      this.isInitializing = false;
    });

    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp client disconnected:', reason);
      this.isReady = false;
      this.isInitializing = false;
      this.connectionStatus = 'disconnected';
      
      // Intentar reconexión automática solo si no fue logout manual
      if (reason !== 'LOGOUT') {
        this.scheduleReconnect();
      } else {
        logger.info('Logout manual, no se intentará reconexión automática');
      }
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

  async isClientHealthy() {
    if (!this.isReady || !this.client) {
      return false;
    }

    try {
      // Intentar obtener el estado del cliente
      const state = await this.client.getState();
      return state === 'CONNECTED';
    } catch (error) {
      logger.warn('Client health check failed:', error.message);
      return false;
    }
  }

  async handleDetachedFrame() {
    logger.warn('Detached Frame detected, forcing reconnection...');
    this.isReady = false;
    this.connectionStatus = 'disconnected';
    
    try {
      if (this.client) {
        await this.client.destroy();
      }
    } catch (err) {
      logger.warn('Error destroying client during reconnection:', err.message);
    }
    
    this.client = null;
    
    // Esperar 2 segundos antes de reinicializar
    await this.delay(2000);
    await this.initialize();
    
    // Esperar hasta 30 segundos para que el cliente esté listo
    const maxWait = 30000;
    const startTime = Date.now();
    
    while (!this.isReady && (Date.now() - startTime) < maxWait) {
      await this.delay(1000);
    }
    
    if (!this.isReady) {
      throw new Error('Failed to reconnect WhatsApp client');
    }
    
    logger.info('Successfully reconnected after detached frame');
  }

  async getGroups() {
    if (!this.isReady) {
      logger.warn('WhatsApp client is not ready, returning empty groups list');
      return [];
    }

    // Intentar obtener grupos con reintentos si el cliente no está completamente listo
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
        lastError = error;
        
        // Si el error es por cliente no completamente listo, esperar y reintentar
        if (error.message && (
          error.message.includes('detached Frame') || 
          error.message.includes('Cannot read properties of undefined') ||
          error.message.includes('Execution context was destroyed')
        )) {
          if (attempt < maxRetries) {
            logger.warn(`Client not fully ready (attempt ${attempt}/${maxRetries}), waiting 2s before retry...`);
            await this.delay(2000);
            continue;
          } else {
            logger.warn('Client not fully ready after all retries, returning empty groups list');
            return [];
          }
        }
        
        // Si es otro tipo de error, lanzarlo inmediatamente
        logger.error('Error getting groups:', error);
        throw error;
      }
    }

    // Si llegamos aquí, todos los reintentos fallaron
    logger.warn('Failed to get groups after all retries, returning empty list');
    return [];
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

    // Intentar hasta 2 veces (1 intento + 1 reintento con reconexión)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        logger.info(`Sending text message to ${chatId}`);
        const result = await this.client.sendMessage(chatId, message, {
          sendSeen: false
        });
        logger.info('Text message sent successfully');
        return {
          success: true,
          messageId: result.id._serialized,
          timestamp: result.timestamp
        };
      } catch (error) {
        logger.error(`Error sending text message (attempt ${attempt}/2):`, error.message);
        
        // Si el error es por Frame desconectado y es el primer intento, reconectar
        if (attempt === 1 && error.message && (
          error.message.includes('detached Frame') ||
          error.message.includes('Execution context was destroyed')
        )) {
          logger.warn('Detached Frame detected, attempting reconnection...');
          await this.handleDetachedFrame();
          continue; // Reintentar
        }
        
        // Si el error es por cliente no listo
        if (error.message && (
          error.message.includes('detached Frame') ||
          error.message.includes('Cannot read properties of undefined') ||
          error.message.includes('Execution context was destroyed')
        )) {
          throw new Error('WhatsApp client is not fully ready yet. Please wait a moment and try again.');
        }
        
        throw error;
      }
    }
  }

  async sendImageFromUrl(chatId, imageUrl, caption = '') {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    // Intentar hasta 2 veces (1 intento + 1 reintento con reconexión)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        logger.info(`Sending image from URL to ${chatId}: ${imageUrl}`);
        const media = await MessageMedia.fromUrl(imageUrl);
        const result = await this.client.sendMessage(chatId, media, { 
          caption,
          sendSeen: false
        });
        logger.info('Image sent successfully');
        return {
          success: true,
          messageId: result.id._serialized,
          timestamp: result.timestamp
        };
      } catch (error) {
        logger.error(`Error sending image from URL (attempt ${attempt}/2):`, error.message);
        
        // Si el error es por Frame desconectado y es el primer intento, reconectar
        if (attempt === 1 && error.message && (
          error.message.includes('detached Frame') ||
          error.message.includes('Execution context was destroyed')
        )) {
          logger.warn('Detached Frame detected, attempting reconnection...');
          await this.handleDetachedFrame();
          continue; // Reintentar
        }
        
        // Si el error es por cliente no listo
        if (error.message && (
          error.message.includes('detached Frame') ||
          error.message.includes('Cannot read properties of undefined') ||
          error.message.includes('Execution context was destroyed')
        )) {
          throw new Error('WhatsApp client is not fully ready yet. Please wait a moment and try again.');
        }
        
        throw error;
      }
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
      const result = await this.client.sendMessage(chatId, media, { 
        caption,
        sendSeen: false
      });
      
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
      const result = await this.client.sendMessage(chatId, media, { 
        caption,
        sendSeen: false
      });
      
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

  scheduleReconnect() {
    // Limpiar timeout anterior si existe
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Verificar si ya estamos intentando reconectar o si ya está listo
    if (this.isInitializing) {
      logger.info('Already attempting to reconnect, skipping...');
      return;
    }

    if (this.isReady) {
      logger.info('Client already ready, no reconnection needed');
      this.reconnectAttempts = 0;
      return;
    }

    // Verificar límite de intentos
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Manual intervention required.`);
      this.connectionStatus = 'failed';
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts; // Backoff exponencial

    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);

    this.reconnectTimeout = setTimeout(async () => {
      try {
        logger.info(`Attempting automatic reconnection (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        // Destruir cliente anterior si existe
        if (this.client) {
          try {
            await this.client.destroy();
          } catch (err) {
            logger.warn('Error destroying old client:', err.message);
          }
          this.client = null;
        }

        // Reinicializar
        await this.initialize();
        
        logger.info('Automatic reconnection successful!');
        
      } catch (error) {
        logger.error('Automatic reconnection failed:', error.message);
        // Programar siguiente intento solo si no alcanzamos el límite
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          logger.error('Max reconnection attempts reached after failure');
          this.connectionStatus = 'failed';
        }
      }
    }, delay);
  }

  cancelReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
      logger.info('Reconnection attempts cancelled');
    }
    this.reconnectAttempts = 0;
  }

  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
    this.cancelReconnect();
    logger.info('Reconnection attempts counter reset');
  }
}

module.exports = new WhatsAppService();
