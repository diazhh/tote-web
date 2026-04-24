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
import { getBoss } from './queue/boss.js';
import { registerAllWorkers } from './queue/register.js';
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
const isProduction = process.env.NODE_ENV === 'production';

// En producción: solo https://tote.atilax.io
// En desarrollo: permitir localhost y servidor de desarrollo
const corsOptions = {
  origin: (origin, callback) => {
    if (isProduction) {
      // Producción: solo el dominio específico
      const allowedOrigins = ['https://tote.atilax.io'];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // Desarrollo: permitir localhost y servidor de desarrollo (144.126.150.120:10000)
      if (!origin || 
          origin.startsWith('http://localhost:10000') || 
          origin.startsWith('http://127.0.0.1:') ||
          origin === 'http://144.126.150.120:10000') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control', 'Pragma'],
};

app.use(cors(corsOptions));

// Manejar preflight requests explícitamente
app.options('*', cors(corsOptions));

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

// Webhook routes — MUST be registered before express.json() to capture raw body Buffer.
// See: backend/src/routes/webhook.routes.js — uses express.raw({ type: '*/*' })
app.use('/api/webhooks', webhookRoutes);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del directorio storage
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/storage', express.static(path.join(__dirname, '../storage')));

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
import whatsappAdminRoutes from './routes/whatsapp-admin.routes.js';
import gameChannelsRoutes from './routes/game-channels.routes.js';
import adminBotRoutes from './routes/admin-bot.routes.js';

// Importar rutas de las nuevas plataformas
import telegramRoutes from './routes/telegram.routes.js';
import instagramRoutes from './routes/instagram.routes.js';
import facebookRoutes from './routes/facebook.routes.js';
import tiktokRoutes from './routes/tiktok.routes.js';

// Importar rutas de taquilla online
import systemPagoMovilRoutes from './routes/system-pago-movil.routes.js';
import depositRoutes from './routes/deposit.routes.js';
import withdrawalRoutes from './routes/withdrawal.routes.js';
import pagoMovilAccountRoutes from './routes/pago-movil-account.routes.js';
import ticketRoutes from './routes/ticket.routes.js';
import prizeRoutes from './routes/prize.routes.js';
import playerQueryRoutes from './routes/player-query.routes.js';
import systemConfigRoutes from './routes/system-config.routes.js';
import pageVisitRoutes from './routes/page-visit.routes.js';
import providerRoutes from './routes/provider.routes.js';
import tripletaRoutes from './routes/tripleta.routes.js';
import whatsappOtpRoutes from './routes/whatsapp-otp.routes.js';
import emailVerificationRoutes from './routes/email-verification.routes.js';
import passwordResetRoutes from './routes/password-reset.routes.js';
import monitorRoutes from './routes/monitor.routes.js';
import drawAnalysisRoutes from './routes/draw-analysis.routes.js';
import playerRoutes from './routes/player.routes.js';
import numberHistoryRoutes from './routes/number-history.routes.js';
import adminJobsRoutes from './routes/admin-jobs.routes.js';
import testSpecialImagesRoutes from './routes/test-special-images.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import quotaRoutes from './routes/quota.routes.js';
import portalRoutes from './routes/portal.routes.js';
import conciliacionRoutes from './routes/conciliacion.routes.js';

// ============================================
// REGISTRAR RUTAS
// ============================================

// Rutas públicas
app.use('/api/public', publicRoutes);

// Rutas públicas para imágenes (sin autenticación)
import publicImagesRoutes from './routes/public-images.routes.js';
app.use('/api/public/images', publicImagesRoutes);

// Rutas protegidas
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/items', gameItemRoutes);
app.use('/api/draws', quotaRoutes);
app.use('/api/draws', drawRoutes);
app.use('/api/templates', drawTemplateRoutes);
app.use('/api/pauses', drawPauseRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/game-channels', gameChannelsRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/system', systemConfigRoutes);

// Rutas de plataformas de canales
app.use('/api/whatsapp', whatsappBaileysRoutes);
app.use('/api/admin/whatsapp', whatsappAdminRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/facebook', facebookRoutes);
app.use('/api/tiktok', tiktokRoutes);

// Rutas de bots de administración y vinculación Telegram
import adminRoutes from './routes/admin.routes.js';
app.use('/api/admin', adminBotRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', adminBotRoutes);

// Rutas de taquilla online
app.use('/api/system-pago-movil', systemPagoMovilRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/pago-movil-accounts', pagoMovilAccountRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/prizes', prizeRoutes);
app.use('/api/player', playerQueryRoutes);
app.use('/api/page-visits', pageVisitRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/conciliacion', conciliacionRoutes);
app.use('/api/tripleta', tripletaRoutes);
app.use('/api/whatsapp-otp', whatsappOtpRoutes);
app.use('/api/email-verification', emailVerificationRoutes);
app.use('/api/password-reset', passwordResetRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/analysis', drawAnalysisRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/number-history', numberHistoryRoutes);
app.use('/api/admin/jobs', adminJobsRoutes);
app.use('/api/admin', testSpecialImagesRoutes);

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

    // Restaurar sesiones de WhatsApp (no bloqueante con timeout)
    const restoreWhatsAppSessions = async () => {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout restaurando sesiones de WhatsApp')), 10000)
        );
        
        await Promise.race([
          whatsappBaileysService.restoreSessions(),
          timeoutPromise
        ]);
        
        logger.info('✅ Sesiones de WhatsApp restauradas');
      } catch (error) {
        logger.error('⚠️  Error al restaurar sesiones de WhatsApp:', error.message);
        logger.info('ℹ️  El servidor continuará funcionando sin WhatsApp Baileys');
      }
    };
    
    // Inicializar en segundo plano sin bloquear el servidor
    restoreWhatsAppSessions();

    // Inicializar bots de administración de Telegram (no bloqueante con timeout)
    const initializeTelegramBots = async () => {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout inicializando bots de Telegram')), 10000)
        );
        
        await Promise.race([
          adminTelegramBotService.initialize(),
          timeoutPromise
        ]);
        
        logger.info('✅ Bots de administración de Telegram inicializados');
      } catch (error) {
        logger.error('⚠️  Error al inicializar bots de Telegram:', error.message);
        logger.info('ℹ️  El servidor continuará funcionando sin notificaciones de Telegram');
      }
    };
    
    // Inicializar en segundo plano sin bloquear el servidor
    initializeTelegramBots();

    // Iniciar pg-boss y registrar workers
    if (process.env.ENABLE_JOBS !== 'false') {
      const boss = getBoss();
      await boss.start();
      logger.info('✅ pg-boss iniciado correctamente');
      await registerAllWorkers(boss);
      logger.info('✅ Workers de pg-boss registrados');
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
  try {
    const boss = getBoss();
    await boss.stop({ graceful: true, timeout: 30000 });
    logger.info('pg-boss detenido correctamente');
  } catch (e) {
    logger.warn('Error al detener pg-boss:', e.message);
  }
  await adminTelegramBotService.shutdown();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT recibido, cerrando servidor...');
  stopAllJobs();
  try {
    const boss = getBoss();
    await boss.stop({ graceful: true, timeout: 30000 });
    logger.info('pg-boss detenido correctamente');
  } catch (e) {
    logger.warn('Error al detener pg-boss:', e.message);
  }
  await adminTelegramBotService.shutdown();
  await prisma.$disconnect();
  process.exit(0);
});

// Iniciar
startServer();
