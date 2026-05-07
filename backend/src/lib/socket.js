import { Server } from 'socket.io';
import logger from './logger.js';
import authService from '../services/auth.service.js';

let io = null;

/**
 * Inicializar Socket.io
 */
export function initializeSocket(server) {
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim())
    : ['http://localhost:3000'];

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true
    },
    // Limita el buffer por mensaje para evitar abuse desde clientes maliciosos.
    maxHttpBufferSize: 64 * 1024
  });

  // Middleware: si el cliente envía un token válido, adjunta el usuario al
  // socket. Conexiones anónimas siguen permitidas (para /jugar y salas de
  // juego públicas), pero sin acceso a la sala admin.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      return next(); // anónimo OK
    }
    try {
      const decoded = authService.verifyToken(token);
      const user = await authService.getUserById(decoded.id);
      if (user && user.isActive) {
        socket.data.user = { id: user.id, role: user.role, username: user.username };
      }
    } catch {
      // Token inválido/expirado — tratar como anónimo, no fallar el handshake.
    }
    next();
  });

  io.on('connection', (socket) => {
    logger.info(`Cliente conectado: ${socket.id}${socket.data.user ? ` (user=${socket.data.user.username})` : ''}`);

    // Unirse a una sala de juego específico (público)
    socket.on('join:game', (gameSlug) => {
      if (typeof gameSlug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(gameSlug)) return;
      socket.join(`game:${gameSlug}`);
      logger.debug(`Cliente ${socket.id} se unió a sala game:${gameSlug}`);
    });

    // Salir de una sala de juego
    socket.on('leave:game', (gameSlug) => {
      if (typeof gameSlug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(gameSlug)) return;
      socket.leave(`game:${gameSlug}`);
      logger.debug(`Cliente ${socket.id} salió de sala game:${gameSlug}`);
    });

    // Unirse a sala de administración — REQUIERE rol ADMIN
    socket.on('join:admin', () => {
      if (socket.data.user?.role !== 'ADMIN') {
        logger.warn(`Cliente ${socket.id} intentó join:admin sin privilegios`);
        socket.emit('admin:denied', { error: 'unauthorized' });
        return;
      }
      socket.join('admin');
      logger.debug(`Cliente ${socket.id} (${socket.data.user.username}) se unió a sala admin`);
    });

    socket.on('disconnect', () => {
      logger.info(`Cliente desconectado: ${socket.id}`);
    });
  });

  logger.info('✅ Socket.io inicializado');
  return io;
}

/**
 * Obtener instancia de Socket.io
 */
export function getIO() {
  if (!io) {
    throw new Error('Socket.io no ha sido inicializado');
  }
  return io;
}

/**
 * Emitir evento a todos los clientes
 */
export function emitToAll(event, data) {
  if (io) {
    io.emit(event, data);
    logger.debug(`Evento emitido a todos: ${event}`);
  }
}

/**
 * Emitir evento a una sala específica
 */
export function emitToRoom(room, event, data) {
  if (io) {
    io.to(room).emit(event, data);
    logger.debug(`Evento emitido a sala ${room}: ${event}`);
  }
}

/**
 * Emitir evento a sala de juego
 */
export function emitToGame(gameSlug, event, data) {
  emitToRoom(`game:${gameSlug}`, event, data);
}

/**
 * Emitir evento a sala de administración
 */
export function emitToAdmin(event, data) {
  emitToRoom('admin', event, data);
}

export default {
  initializeSocket,
  getIO,
  emitToAll,
  emitToRoom,
  emitToGame,
  emitToAdmin
};
