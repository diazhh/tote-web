/**
 * Servicio para gestión de sorteos
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

export class DrawService {
  /**
   * Obtener sorteos con filtros
   * @param {Object} filters - Filtros
   * @returns {Promise<Object>} { draws: Array, total: number }
   */
  async getDraws(filters = {}) {
    try {
      const where = {};
      
      if (filters.gameId) {
        where.gameId = filters.gameId;
      }
      
      if (filters.status) {
        where.status = filters.status;
      }
      
      if (filters.dateFrom || filters.dateTo) {
        where.scheduledAt = {};
        if (filters.dateFrom) {
          where.scheduledAt.gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          where.scheduledAt.lte = new Date(filters.dateTo);
        }
      }

      // Obtener total de registros y los datos paginados en paralelo
      const [draws, total] = await Promise.all([
        prisma.draw.findMany({
          where,
          include: {
            game: true,
            preselectedItem: true,
            winnerItem: true,
            template: true,
            publications: true,
          },
          orderBy: {
            scheduledAt: filters.orderBy === 'asc' ? 'asc' : 'desc',
          },
          ...(filters.limit && { take: filters.limit }),
          ...(filters.skip && { skip: filters.skip }),
        }),
        prisma.draw.count({ where })
      ]);

      return { draws, total };
    } catch (error) {
      logger.error('Error obteniendo sorteos:', error);
      throw error;
    }
  }

  /**
   * Obtener sorteo por ID
   * @param {string} id - ID del sorteo
   * @returns {Promise<Object|null>}
   */
  async getDrawById(id) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id },
        include: {
          game: {
            include: {
              items: {
                where: { isActive: true },
              },
            },
          },
          preselectedItem: true,
          winnerItem: true,
          template: true,
          publications: true,
        },
      });

      return draw;
    } catch (error) {
      logger.error(`Error obteniendo sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtener sorteos de hoy
   * @param {string} gameId - ID del juego (opcional)
   * @returns {Promise<Array>}
   */
  async getTodayDraws(gameId = null) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const where = {
        scheduledAt: {
          gte: today,
          lt: tomorrow,
        },
      };

      if (gameId) {
        where.gameId = gameId;
      }

      const draws = await prisma.draw.findMany({
        where,
        include: {
          game: true,
          preselectedItem: true,
          winnerItem: true,
          publications: true,
        },
        orderBy: {
          scheduledAt: 'asc',
        },
      });

      return draws;
    } catch (error) {
      logger.error('Error obteniendo sorteos de hoy:', error);
      throw error;
    }
  }

  /**
   * Obtener próximo sorteo
   * @param {string} gameId - ID del juego (opcional)
   * @returns {Promise<Object|null>}
   */
  async getNextDraw(gameId = null) {
    try {
      const where = {
        scheduledAt: {
          gte: new Date(),
        },
        status: {
          in: ['SCHEDULED', 'CLOSED'],
        },
      };

      if (gameId) {
        where.gameId = gameId;
      }

      const draw = await prisma.draw.findFirst({
        where,
        include: {
          game: true,
          preselectedItem: true,
        },
        orderBy: {
          scheduledAt: 'asc',
        },
      });

      return draw;
    } catch (error) {
      logger.error('Error obteniendo próximo sorteo:', error);
      throw error;
    }
  }

  /**
   * Crear un sorteo
   * @param {Object} data - Datos del sorteo
   * @returns {Promise<Object>}
   */
  async createDraw(data) {
    try {
      const draw = await prisma.draw.create({
        data: {
          gameId: data.gameId,
          templateId: data.templateId,
          scheduledAt: new Date(data.scheduledAt),
          status: data.status || 'SCHEDULED',
          preselectedItemId: data.preselectedItemId,
          winnerItemId: data.winnerItemId,
          notes: data.notes,
        },
        include: {
          game: true,
          preselectedItem: true,
          winnerItem: true,
        },
      });

      logger.info(`Sorteo creado: ${draw.game.name} - ${draw.scheduledAt}`);
      return draw;
    } catch (error) {
      logger.error('Error creando sorteo:', error);
      throw error;
    }
  }

  /**
   * Actualizar un sorteo
   * @param {string} id - ID del sorteo
   * @param {Object} data - Datos a actualizar
   * @returns {Promise<Object>}
   */
  async updateDraw(id, data) {
    try {
      const draw = await prisma.draw.update({
        where: { id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.preselectedItemId !== undefined && { preselectedItemId: data.preselectedItemId }),
          ...(data.winnerItemId !== undefined && { winnerItemId: data.winnerItemId }),
          ...(data.imageUrl && { imageUrl: data.imageUrl }),
          ...(data.closedAt && { closedAt: new Date(data.closedAt) }),
          ...(data.drawnAt && { drawnAt: new Date(data.drawnAt) }),
          ...(data.publishedAt && { publishedAt: new Date(data.publishedAt) }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        include: {
          game: true,
          preselectedItem: true,
          winnerItem: true,
        },
      });

      logger.info(`Sorteo actualizado: ${draw.id}`);
      return draw;
    } catch (error) {
      logger.error(`Error actualizando sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Cerrar un sorteo (5 min antes)
   * @param {string} id - ID del sorteo
   * @param {string} preselectedItemId - ID del item preseleccionado
   * @returns {Promise<Object>}
   */
  async closeDraw(id, preselectedItemId) {
    try {
      const draw = await prisma.draw.update({
        where: { id },
        data: {
          status: 'CLOSED',
          preselectedItemId,
          closedAt: new Date(),
        },
        include: {
          game: true,
          preselectedItem: true,
        },
      });

      logger.info(`Sorteo cerrado: ${draw.id} - Preseleccionado: ${draw.preselectedItem?.number}`);
      return draw;
    } catch (error) {
      logger.error(`Error cerrando sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Ejecutar un sorteo (confirmar ganador)
   * @param {string} id - ID del sorteo
   * @param {string} winnerItemId - ID del item ganador (opcional, usa preseleccionado si no se provee)
   * @returns {Promise<Object>}
   */
  async executeDraw(id, winnerItemId = null) {
    try {
      const draw = await this.getDrawById(id);
      
      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      const finalWinnerId = winnerItemId || draw.preselectedItemId;
      
      if (!finalWinnerId) {
        throw new Error('No hay ganador seleccionado');
      }

      const updatedDraw = await prisma.draw.update({
        where: { id },
        data: {
          status: 'DRAWN',
          winnerItemId: finalWinnerId,
          drawnAt: new Date(),
        },
        include: {
          game: true,
          winnerItem: true,
        },
      });

      // Actualizar lastWin del item ganador
      await prisma.gameItem.update({
        where: { id: finalWinnerId },
        data: { lastWin: new Date() },
      });

      logger.info(`Sorteo ejecutado: ${updatedDraw.id} - Ganador: ${updatedDraw.winnerItem?.number}`);
      
      // Generar imagen del sorteo automáticamente
      try {
        const { generateDrawImage } = await import('./imageService.js');
        await generateDrawImage(updatedDraw.id);
        logger.info(`✅ Imagen generada para sorteo ${updatedDraw.id}`);
      } catch (imageError) {
        logger.error(`❌ Error generando imagen para sorteo ${updatedDraw.id}:`, imageError);
        // No detener el flujo si falla la imagen
      }

      // Crear registros de publicación para cada canal activo
      const channels = ['TELEGRAM', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM'];
      
      for (const channel of channels) {
        try {
          await prisma.drawPublication.create({
            data: {
              drawId: updatedDraw.id,
              channel: channel,
              status: 'PENDING'
            }
          });
        } catch (pubError) {
          logger.error(`Error creando publicación para ${channel}:`, pubError);
        }
      }
      
      return updatedDraw;
    } catch (error) {
      logger.error(`Error ejecutando sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Preseleccionar ganador de un sorteo
   * @param {string} id - ID del sorteo
   * @param {string} itemId - ID del item a preseleccionar (null para aleatorio)
   * @returns {Promise<Object>}
   */
  async preselectWinner(id, itemId = null) {
    try {
      const draw = await this.getDrawById(id);
      
      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      if (draw.status !== 'SCHEDULED') {
        throw new Error('Solo se puede preseleccionar ganador en sorteos programados');
      }

      let selectedItemId = itemId;
      
      // Si no se proporciona itemId, seleccionar uno aleatorio
      if (!selectedItemId) {
        const items = draw.game.items.filter(item => item.isActive);
        if (items.length === 0) {
          throw new Error('No hay items disponibles para el sorteo');
        }
        const randomItem = items[Math.floor(Math.random() * items.length)];
        selectedItemId = randomItem.id;
      }

      const updatedDraw = await prisma.draw.update({
        where: { id },
        data: {
          preselectedItemId: selectedItemId,
        },
        include: {
          game: true,
          preselectedItem: true,
          winnerItem: true,
        },
      });

      logger.info(`Ganador preseleccionado en sorteo ${id}: ${updatedDraw.preselectedItem?.number}`);
      return updatedDraw;
    } catch (error) {
      logger.error(`Error preseleccionando ganador del sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Cambiar ganador de un sorteo
   * @param {string} id - ID del sorteo
   * @param {string} newWinnerItemId - ID del nuevo item ganador
   * @returns {Promise<Object>}
   */
  async changeWinner(id, newWinnerItemId) {
    try {
      const draw = await this.getDrawById(id);
      
      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      if (draw.status !== 'CLOSED' && draw.status !== 'DRAWN') {
        throw new Error('Solo se puede cambiar el ganador de sorteos cerrados o ejecutados');
      }

      const updatedDraw = await prisma.draw.update({
        where: { id },
        data: {
          preselectedItemId: newWinnerItemId,
          ...(draw.status === 'DRAWN' && { winnerItemId: newWinnerItemId }),
        },
        include: {
          game: true,
          preselectedItem: true,
          winnerItem: true,
        },
      });

      logger.info(`Ganador cambiado en sorteo ${id}: ${updatedDraw.preselectedItem?.number}`);
      return updatedDraw;
    } catch (error) {
      logger.error(`Error cambiando ganador del sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Cancelar un sorteo
   * @param {string} id - ID del sorteo
   * @param {string} reason - Razón de cancelación
   * @returns {Promise<Object>}
   */
  async cancelDraw(id, reason) {
    try {
      const draw = await prisma.draw.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: reason,
        },
        include: {
          game: true,
        },
      });

      logger.info(`Sorteo cancelado: ${draw.id} - Razón: ${reason}`);
      return draw;
    } catch (error) {
      logger.error(`Error cancelando sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtener sorteos que deben cerrarse (5 min antes)
   * @returns {Promise<Array>}
   */
  async getDrawsToClose() {
    try {
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      const draws = await prisma.draw.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledAt: {
            lte: fiveMinutesFromNow,
            gte: now,
          },
        },
        include: {
          game: {
            include: {
              items: {
                where: { isActive: true },
              },
            },
          },
        },
      });

      return draws;
    } catch (error) {
      logger.error('Error obteniendo sorteos para cerrar:', error);
      throw error;
    }
  }

  /**
   * Obtener sorteos que deben ejecutarse
   * @returns {Promise<Array>}
   */
  async getDrawsToExecute() {
    try {
      const now = new Date();

      const draws = await prisma.draw.findMany({
        where: {
          status: 'CLOSED',
          scheduledAt: {
            lte: now,
          },
        },
        include: {
          game: true,
          preselectedItem: true,
        },
      });

      return draws;
    } catch (error) {
      logger.error('Error obteniendo sorteos para ejecutar:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de sorteos
   * @param {string} gameId - ID del juego (opcional)
   * @param {Date} dateFrom - Fecha desde
   * @param {Date} dateTo - Fecha hasta
   * @returns {Promise<Object>}
   */
  async getDrawStats(gameId = null, dateFrom = null, dateTo = null) {
    try {
      const where = {};
      
      if (gameId) {
        where.gameId = gameId;
      }
      
      if (dateFrom || dateTo) {
        where.scheduledAt = {};
        if (dateFrom) {
          where.scheduledAt.gte = new Date(dateFrom);
        }
        if (dateTo) {
          where.scheduledAt.lte = new Date(dateTo);
        }
      }

      const [total, scheduled, closed, drawn, published, cancelled] = await Promise.all([
        prisma.draw.count({ where }),
        prisma.draw.count({ where: { ...where, status: 'SCHEDULED' } }),
        prisma.draw.count({ where: { ...where, status: 'CLOSED' } }),
        prisma.draw.count({ where: { ...where, status: 'DRAWN' } }),
        prisma.draw.count({ where: { ...where, status: 'PUBLISHED' } }),
        prisma.draw.count({ where: { ...where, status: 'CANCELLED' } }),
      ]);

      return {
        total,
        scheduled,
        closed,
        drawn,
        published,
        cancelled,
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas de sorteos:', error);
      throw error;
    }
  }
}

export default new DrawService();
