import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import logger from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { initializeSocket } from './lib/socket.js';
import { startAllJobs, stopAllJobs } from './jobs/index.js';
import whatsappBaileysService from './services/whatsapp-baileys.service.js';
import adminTelegramBotService from './services/admin-telegram-bot.service.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Confiar en proxy (HAProxy/nginx)
app.set('trust proxy', 1);

// ============================================
// MIDDLEWARES
// ============================================

// Seguridad - Configurar Helmet para permitir imágenes desde el backend
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "http://localhost:3001", "https://localhost:3001"],
    },
  },
}));

// CORS - debe ir ANTES del rate limiter para manejar preflight requests
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Manejar preflight requests explícitamente
app.options('*', cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting - General (más permisivo)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // Límite de 1000 requests por ventana
  message: 'Demasiadas peticiones desde esta IP, por favor intenta más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting - Auth (más estricto para prevenir brute force, pero suficiente para uso normal)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // 50 intentos de login por ventana
  message: 'Demasiados intentos de autenticación, por favor intenta más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging de requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// ============================================
// RUTAS
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ============================================
// IMPORTAR RUTAS
// ============================================

import gameRoutes from './routes/game.routes.js';
import gameItemRoutes from './routes/game-item.routes.js';
import drawRoutes from './routes/draw.routes.js';
import authRoutes from './routes/auth.routes.js';
import drawTemplateRoutes from './routes/draw-template.routes.js';
import drawPauseRoutes from './routes/draw-pause.routes.js';
import publicRoutes from './routes/public.routes.js';
import channelRoutes from './routes/channel.routes.js';
import imageRoutes from './routes/images.js';
import whatsappBaileysRoutes from './routes/whatsapp-baileys.routes.js';
import gameChannelsRoutes from './routes/game-channels.routes.js';
import adminBotRoutes from './routes/admin-bot.routes.js';

// Importar rutas de las nuevas plataformas
import telegramRoutes from './routes/telegram.routes.js';
import instagramRoutes from './routes/instagram.routes.js';
import facebookRoutes from './routes/facebook.routes.js';
import tiktokRoutes from './routes/tiktok.routes.js';

// ============================================
// REGISTRAR RUTAS
// ============================================

// Rutas públicas
app.use('/api/public', publicRoutes);

// Rutas protegidas
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/items', gameItemRoutes);
app.use('/api/draws', drawRoutes);
app.use('/api/templates', drawTemplateRoutes);
app.use('/api/pauses', drawPauseRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/game-channels', gameChannelsRoutes);
app.use('/api/images', imageRoutes);
// app.use('/api/system', systemConfigRoutes); // TODO: Importar systemConfigRoutes si es necesario

// Rutas de plataformas de canales
app.use('/api/whatsapp', whatsappBaileysRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/facebook', facebookRoutes);
app.use('/api/tiktok', tiktokRoutes);

// Rutas de bots de administración y vinculación Telegram
app.use('/api/admin', adminBotRoutes);
app.use('/api/users', adminBotRoutes);

// Rutas anidadas para items de juegos
import gameItemController from './controllers/game-item.controller.js';
app.get('/api/games/:gameId/items', gameItemController.getItemsByGame.bind(gameItemController));
app.get('/api/games/:gameId/items/random', gameItemController.getRandomItem.bind(gameItemController));
app.get('/api/games/:gameId/items/winners', gameItemController.getMostWinningItems.bind(gameItemController));
app.get('/api/games/:gameId/items/:number', gameItemController.getItemByNumber.bind(gameItemController));

// Ruta de prueba
app.get('/api/test', async (req, res) => {
  try {
    // Probar conexión a BD
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      message: 'Sistema Totalizador de Loterías - API funcionando',
      database: 'connected',
    });
  } catch (error) {
    logger.error('Error en test endpoint:', error);
    res.status(500).json({
      message: 'Error en la conexión a la base de datos',
      error: error.message,
    });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path,
  });
});

// Error Handler Global
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Error interno del servidor' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ============================================
// INICIO DEL SERVIDOR
// ============================================

async function startServer() {
  try {
    // Verificar conexión a BD
    await prisma.$connect();
    logger.info('✅ Conectado a PostgreSQL');

    // Inicializar Socket.io
    initializeSocket(server);

    // Iniciar servidor
    server.listen(PORT, () => {
      logger.info(`🚀 Servidor iniciado en puerto ${PORT}`);
      logger.info(`📍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔗 API: http://localhost:${PORT}/api`);
    });

    // Restaurar sesiones de WhatsApp
    try {
      await whatsappBaileysService.restoreSessions();
      logger.info('✅ Sesiones de WhatsApp restauradas');
    } catch (error) {
      logger.error('⚠️  Error al restaurar sesiones de WhatsApp:', error);
    }

    // Inicializar bots de administración de Telegram
    try {
      await adminTelegramBotService.initialize();
      logger.info('✅ Bots de administración de Telegram inicializados');
    } catch (error) {
      logger.error('⚠️  Error al inicializar bots de Telegram:', error);
    }

    // Iniciar sistema de Jobs
    if (process.env.ENABLE_JOBS !== 'false') {
      startAllJobs();
    } else {
      logger.info('⚠️  Jobs deshabilitados (ENABLE_JOBS=false)');
    }
  } catch (error) {
    logger.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
}

// Manejo de señales de terminación
process.on('SIGTERM', async () => {
  logger.info('SIGTERM recibido, cerrando servidor...');
  stopAllJobs();
  await adminTelegramBotService.shutdown();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT recibido, cerrando servidor...');
  stopAllJobs();
  await adminTelegramBotService.shutdown();
  await prisma.$disconnect();
  process.exit(0);
});

// Iniciar
startServer();
