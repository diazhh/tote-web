import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class DrawPauseService {
  /**
   * Crear una nueva pausa
   */
  async create({ gameId, startDate, endDate, reason }) {
    try {
      // Validar que el juego existe
      const game = await prisma.game.findUnique({
        where: { id: gameId }
      });

      if (!game) {
        throw new Error('Juego no encontrado');
      }

      // Validar fechas
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start >= end) {
        throw new Error('La fecha de inicio debe ser anterior a la fecha de fin');
      }

      const pause = await prisma.drawPause.create({
        data: {
          gameId,
          startDate: start,
          endDate: end,
          reason,
          isActive: true
        },
        include: {
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          }
        }
      });

      logger.info(`Pausa creada para juego ${game.name}: ${start.toISOString()} - ${end.toISOString()}`);
      return pause;
    } catch (error) {
      logger.error('Error al crear pausa:', error);
      throw error;
    }
  }

  /**
   * Obtener todas las pausas
   */
  async getAll({ gameId, isActive } = {}) {
    try {
      const where = {};
      
      if (gameId) {
        where.gameId = gameId;
      }
      
      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const pauses = await prisma.drawPause.findMany({
        where,
        include: {
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          }
        },
        orderBy: { startDate: 'desc' }
      });

      return pauses;
    } catch (error) {
      logger.error('Error al obtener pausas:', error);
      throw error;
    }
  }

  /**
   * Obtener pausa por ID
   */
  async getById(id) {
    try {
      const pause = await prisma.drawPause.findUnique({
        where: { id },
        include: {
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          }
        }
      });

      if (!pause) {
        throw new Error('Pausa no encontrada');
      }

      return pause;
    } catch (error) {
      logger.error('Error al obtener pausa:', error);
      throw error;
    }
  }

  /**
   * Actualizar pausa
   */
  async update(id, data) {
    try {
      const pause = await prisma.drawPause.findUnique({
        where: { id }
      });

      if (!pause) {
        throw new Error('Pausa no encontrada');
      }

      // Validar fechas si se proporcionan
      if (data.startDate || data.endDate) {
        const start = data.startDate ? new Date(data.startDate) : pause.startDate;
        const end = data.endDate ? new Date(data.endDate) : pause.endDate;

        if (start >= end) {
          throw new Error('La fecha de inicio debe ser anterior a la fecha de fin');
        }
      }

      const updated = await prisma.drawPause.update({
        where: { id },
        data: {
          ...(data.startDate && { startDate: new Date(data.startDate) }),
          ...(data.endDate && { endDate: new Date(data.endDate) }),
          ...(data.reason !== undefined && { reason: data.reason }),
          ...(data.isActive !== undefined && { isActive: data.isActive })
        },
        include: {
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          }
        }
      });

      logger.info(`Pausa actualizada: ${updated.id}`);
      return updated;
    } catch (error) {
      logger.error('Error al actualizar pausa:', error);
      throw error;
    }
  }

  /**
   * Eliminar pausa
   */
  async delete(id) {
    try {
      const pause = await prisma.drawPause.findUnique({
        where: { id }
      });

      if (!pause) {
        throw new Error('Pausa no encontrada');
      }

      await prisma.drawPause.delete({
        where: { id }
      });

      logger.info(`Pausa eliminada: ${id}`);
      return true;
    } catch (error) {
      logger.error('Error al eliminar pausa:', error);
      throw error;
    }
  }

  /**
   * Verificar si un juego está pausado en una fecha específica
   */
  async isGamePausedOnDate(gameId, date) {
    try {
      const targetDate = new Date(date);

      const pause = await prisma.drawPause.findFirst({
        where: {
          gameId,
          isActive: true,
          startDate: {
            lte: targetDate
          },
          endDate: {
            gte: targetDate
          }
        }
      });

      return pause !== null;
    } catch (error) {
      logger.error('Error al verificar pausa:', error);
      throw error;
    }
  }

  /**
   * Obtener pausas activas para una fecha
   */
  async getActivePausesForDate(date) {
    try {
      const targetDate = new Date(date);

      const pauses = await prisma.drawPause.findMany({
        where: {
          isActive: true,
          startDate: {
            lte: targetDate
          },
          endDate: {
            gte: targetDate
          }
        },
        include: {
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          }
        }
      });

      return pauses;
    } catch (error) {
      logger.error('Error al obtener pausas activas:', error);
      throw error;
    }
  }
}

export default new DrawPauseService();
