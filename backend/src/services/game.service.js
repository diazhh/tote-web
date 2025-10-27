/**
 * Servicio para gestión de juegos
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

export class GameService {
  /**
   * Obtener todos los juegos
   * @param {Object} filters - Filtros opcionales
   * @returns {Promise<Array>}
   */
  async getAllGames(filters = {}) {
    try {
      const where = {};
      
      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }
      
      if (filters.type) {
        where.type = filters.type;
      }

      const games = await prisma.game.findMany({
        where,
        include: {
          _count: {
            select: {
              items: true,
              templates: true,
              draws: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      return games;
    } catch (error) {
      logger.error('Error obteniendo juegos:', error);
      throw error;
    }
  }

  /**
   * Obtener un juego por ID
   * @param {string} id - ID del juego
   * @returns {Promise<Object|null>}
   */
  async getGameById(id) {
    try {
      const game = await prisma.game.findUnique({
        where: { id },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' },
          },
          templates: {
            where: { isActive: true },
          },
          _count: {
            select: {
              draws: true,
            },
          },
        },
      });

      return game;
    } catch (error) {
      logger.error(`Error obteniendo juego ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtener un juego por slug
   * @param {string} slug - Slug del juego
   * @returns {Promise<Object|null>}
   */
  async getGameBySlug(slug) {
    try {
      const game = await prisma.game.findUnique({
        where: { slug },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' },
          },
          templates: {
            where: { isActive: true },
          },
        },
      });

      return game;
    } catch (error) {
      logger.error(`Error obteniendo juego por slug ${slug}:`, error);
      throw error;
    }
  }

  /**
   * Crear un nuevo juego
   * @param {Object} data - Datos del juego
   * @returns {Promise<Object>}
   */
  async createGame(data) {
    try {
      const game = await prisma.game.create({
        data: {
          name: data.name,
          type: data.type,
          slug: data.slug || this.generateSlug(data.name),
          totalNumbers: data.totalNumbers,
          description: data.description,
          config: data.config || {},
          isActive: data.isActive !== undefined ? data.isActive : true,
        },
      });

      logger.info(`Juego creado: ${game.name} (${game.id})`);
      return game;
    } catch (error) {
      logger.error('Error creando juego:', error);
      throw error;
    }
  }

  /**
   * Actualizar un juego
   * @param {string} id - ID del juego
   * @param {Object} data - Datos a actualizar
   * @returns {Promise<Object>}
   */
  async updateGame(id, data) {
    try {
      const game = await prisma.game.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.type && { type: data.type }),
          ...(data.slug && { slug: data.slug }),
          ...(data.totalNumbers && { totalNumbers: data.totalNumbers }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.config && { config: data.config }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      });

      logger.info(`Juego actualizado: ${game.name} (${game.id})`);
      return game;
    } catch (error) {
      logger.error(`Error actualizando juego ${id}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar un juego (soft delete)
   * @param {string} id - ID del juego
   * @returns {Promise<Object>}
   */
  async deleteGame(id) {
    try {
      const game = await prisma.game.update({
        where: { id },
        data: { isActive: false },
      });

      logger.info(`Juego desactivado: ${game.name} (${game.id})`);
      return game;
    } catch (error) {
      logger.error(`Error eliminando juego ${id}:`, error);
      throw error;
    }
  }

  /**
   * Generar slug desde nombre
   * @param {string} name - Nombre del juego
   * @returns {string}
   */
  generateSlug(name) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/[^a-z0-9]+/g, '-') // Reemplazar caracteres especiales con -
      .replace(/^-+|-+$/g, ''); // Remover - al inicio y final
  }

  /**
   * Obtener estadísticas de un juego
   * @param {string} id - ID del juego
   * @returns {Promise<Object>}
   */
  async getGameStats(id) {
    try {
      const [totalDraws, publishedDraws, scheduledDraws, items] = await Promise.all([
        prisma.draw.count({ where: { gameId: id } }),
        prisma.draw.count({ where: { gameId: id, status: 'PUBLISHED' } }),
        prisma.draw.count({ where: { gameId: id, status: 'SCHEDULED' } }),
        prisma.gameItem.count({ where: { gameId: id, isActive: true } }),
      ]);

      return {
        totalDraws,
        publishedDraws,
        scheduledDraws,
        activeItems: items,
      };
    } catch (error) {
      logger.error(`Error obteniendo estadísticas del juego ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtener items de un juego
   * @param {string} id - ID del juego
   * @returns {Promise<Array>}
   */
  async getGameItems(id) {
    try {
      const items = await prisma.gameItem.findMany({
        where: { 
          gameId: id,
          isActive: true 
        },
        orderBy: { displayOrder: 'asc' },
      });

      return items;
    } catch (error) {
      logger.error(`Error obteniendo items del juego ${id}:`, error);
      throw error;
    }
  }
}

export default new GameService();
