import { Server } from 'socket.io';
import logger from './logger.js';

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
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Cliente conectado: ${socket.id}`);

    // Unirse a una sala de juego específico
    socket.on('join:game', (gameSlug) => {
      socket.join(`game:${gameSlug}`);
      logger.debug(`Cliente ${socket.id} se unió a sala game:${gameSlug}`);
    });

    // Salir de una sala de juego
    socket.on('leave:game', (gameSlug) => {
      socket.leave(`game:${gameSlug}`);
      logger.debug(`Cliente ${socket.id} salió de sala game:${gameSlug}`);
    });

    // Unirse a sala de administración
    socket.on('join:admin', () => {
      socket.join('admin');
      logger.debug(`Cliente ${socket.id} se unió a sala admin`);
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
