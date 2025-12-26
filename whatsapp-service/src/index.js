const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const logger = require('./config/logger');
const whatsappRoutes = require('./routes/whatsapp.routes');
const whatsappService = require('./services/whatsapp.service');
const fs = require('fs').promises;
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/whatsapp', whatsappRoutes);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'whatsapp-service',
    whatsapp: whatsappService.getStatus()
  });
});

async function ensureDirectories() {
  const dirs = [
    config.sessionPath,
    'logs'
  ];
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      logger.info(`Directory ensured: ${dir}`);
    } catch (error) {
      logger.error(`Error creating directory ${dir}:`, error);
    }
  }
}

async function startServer() {
  try {
    await ensureDirectories();
    
    app.listen(config.port, () => {
      logger.info(`WhatsApp Service running on port ${config.port}`);
      logger.info(`Backend URL: ${config.backendUrl}`);
      logger.info('Service ready to accept connections');
    });
    
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  try {
    await whatsappService.destroy();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  try {
    await whatsappService.destroy();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

startServer();
