/**
 * Servicio para gestión de items de juegos
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

export class GameItemService {
  /**
   * Obtener todos los items de un juego
   * @param {string} gameId - ID del juego
   * @param {Object} filters - Filtros opcionales
   * @returns {Promise<Array>}
   */
  async getItemsByGame(gameId, filters = {}) {
    try {
      const where = { gameId };
      
      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      const items = await prisma.gameItem.findMany({
        where,
        orderBy: { displayOrder: 'asc' },
      });

      return items;
    } catch (error) {
      logger.error(`Error obteniendo items del juego ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Obtener un item por ID
   * @param {string} id - ID del item
   * @returns {Promise<Object|null>}
   */
  async getItemById(id) {
    try {
      const item = await prisma.gameItem.findUnique({
        where: { id },
        include: {
          game: true,
        },
      });

      return item;
    } catch (error) {
      logger.error(`Error obteniendo item ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtener un item por número
   * @param {string} gameId - ID del juego
   * @param {string} number - Número del item
   * @returns {Promise<Object|null>}
   */
  async getItemByNumber(gameId, number) {
    try {
      const item = await prisma.gameItem.findUnique({
        where: {
          gameId_number: {
            gameId,
            number,
          },
        },
        include: {
          game: true,
        },
      });

      return item;
    } catch (error) {
      logger.error(`Error obteniendo item ${number} del juego ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Crear un nuevo item
   * @param {Object} data - Datos del item
   * @returns {Promise<Object>}
   */
  async createItem(data) {
    try {
      // Obtener el siguiente displayOrder
      const lastItem = await prisma.gameItem.findFirst({
        where: { gameId: data.gameId },
        orderBy: { displayOrder: 'desc' },
      });

      const displayOrder = data.displayOrder !== undefined 
        ? data.displayOrder 
        : (lastItem ? lastItem.displayOrder + 1 : 0);

      const item = await prisma.gameItem.create({
        data: {
          gameId: data.gameId,
          number: data.number,
          name: data.name,
          displayOrder,
          multiplier: data.multiplier || 30.00,
          lastWin: data.lastWin,
          isActive: data.isActive !== undefined ? data.isActive : true,
        },
      });

      logger.info(`Item creado: ${item.number} - ${item.name} (${item.id})`);
      return item;
    } catch (error) {
      logger.error('Error creando item:', error);
      throw error;
    }
  }

  /**
   * Actualizar un item
   * @param {string} id - ID del item
   * @param {Object} data - Datos a actualizar
   * @returns {Promise<Object>}
   */
  async updateItem(id, data) {
    try {
      const item = await prisma.gameItem.update({
        where: { id },
        data: {
          ...(data.number && { number: data.number }),
          ...(data.name && { name: data.name }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
          ...(data.multiplier && { multiplier: data.multiplier }),
          ...(data.lastWin !== undefined && { lastWin: data.lastWin }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      });

      logger.info(`Item actualizado: ${item.number} - ${item.name} (${item.id})`);
      return item;
    } catch (error) {
      logger.error(`Error actualizando item ${id}:`, error);
      throw error;
    }
  }

  /**
   * Actualizar lastWin de un item
   * @param {string} id - ID del item
   * @param {Date} date - Fecha del último triunfo
   * @returns {Promise<Object>}
   */
  async updateLastWin(id, date) {
    try {
      const item = await prisma.gameItem.update({
        where: { id },
        data: { lastWin: date },
      });

      logger.info(`LastWin actualizado para item ${item.number}: ${date}`);
      return item;
    } catch (error) {
      logger.error(`Error actualizando lastWin del item ${id}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar un item (soft delete)
   * @param {string} id - ID del item
   * @returns {Promise<Object>}
   */
  async deleteItem(id) {
    try {
      const item = await prisma.gameItem.update({
        where: { id },
        data: { isActive: false },
      });

      logger.info(`Item desactivado: ${item.number} - ${item.name} (${item.id})`);
      return item;
    } catch (error) {
      logger.error(`Error eliminando item ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtener items más ganadores
   * @param {string} gameId - ID del juego
   * @param {number} limit - Límite de resultados
   * @returns {Promise<Array>}
   */
  async getMostWinningItems(gameId, limit = 10) {
    try {
      const items = await prisma.gameItem.findMany({
        where: {
          gameId,
          isActive: true,
          lastWin: { not: null },
        },
        orderBy: {
          lastWin: 'desc',
        },
        take: limit,
      });

      return items;
    } catch (error) {
      logger.error(`Error obteniendo items más ganadores del juego ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Obtener item aleatorio de un juego
   * @param {string} gameId - ID del juego
   * @returns {Promise<Object|null>}
   */
  async getRandomItem(gameId) {
    try {
      const items = await prisma.gameItem.findMany({
        where: {
          gameId,
          isActive: true,
        },
      });

      if (items.length === 0) {
        return null;
      }

      const randomIndex = Math.floor(Math.random() * items.length);
      return items[randomIndex];
    } catch (error) {
      logger.error(`Error obteniendo item aleatorio del juego ${gameId}:`, error);
      throw error;
    }
  }
}

export default new GameItemService();
