import whatsappClient from '../lib/whatsapp-client.js';
import logger from '../lib/logger.js';

export const getWhatsAppStatus = async (req, res) => {
  try {
    const status = await whatsappClient.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Error getting WhatsApp status:', error);
    res.status(500).json({ error: error.message });
  }
};

export const initializeWhatsApp = async (req, res) => {
  try {
    const result = await whatsappClient.initialize();
    res.json(result);
  } catch (error) {
    logger.error('Error initializing WhatsApp:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getQRCode = async (req, res) => {
  try {
    const result = await whatsappClient.getQRCode();
    res.json(result);
  } catch (error) {
    logger.error('Error getting QR code:', error);
    res.status(404).json({ error: error.message });
  }
};

export const getGroups = async (req, res) => {
  try {
    const groups = await whatsappClient.getGroups();
    res.json({ groups });
  } catch (error) {
    logger.error('Error getting groups:', error);
    res.status(500).json({ error: error.message });
  }
};

export const testMessage = async (req, res) => {
  try {
    const { chatId, message } = req.body;
    
    if (!chatId || !message) {
      return res.status(400).json({ error: 'chatId and message are required' });
    }
    
    const result = await whatsappClient.sendTextMessage(chatId, message);
    res.json(result);
  } catch (error) {
    logger.error('Error sending test message:', error);
    res.status(500).json({ error: error.message });
  }
};

export const logoutWhatsApp = async (req, res) => {
  try {
    const result = await whatsappClient.logout();
    res.json(result);
  } catch (error) {
    logger.error('Error logging out WhatsApp:', error);
    res.status(500).json({ error: error.message });
  }
};
