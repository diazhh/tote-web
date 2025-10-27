import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class DrawTemplateService {
  /**
   * Crear una nueva plantilla de sorteo
   */
  async create({ gameId, name, description, daysOfWeek, drawTimes }) {
    try {
      // Validar que el juego existe
      const game = await prisma.game.findUnique({
        where: { id: gameId }
      });

      if (!game) {
        throw new Error('Juego no encontrado');
      }

      // Validar días de la semana (1-7)
      if (!Array.isArray(daysOfWeek) || daysOfWeek.some(d => d < 1 || d > 7)) {
        throw new Error('Días de la semana inválidos (deben ser 1-7)');
      }

      // Validar formato de horas (HH:MM)
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!Array.isArray(drawTimes) || drawTimes.some(t => !timeRegex.test(t))) {
        throw new Error('Formato de horas inválido (debe ser HH:MM)');
      }

      const template = await prisma.drawTemplate.create({
        data: {
          gameId,
          name,
          description,
          daysOfWeek,
          drawTimes,
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

      logger.info(`Plantilla creada: ${name} para juego ${game.name}`);
      return template;
    } catch (error) {
      logger.error('Error al crear plantilla:', error);
      throw error;
    }
  }

  /**
   * Obtener todas las plantillas
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

      const templates = await prisma.drawTemplate.findMany({
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
        orderBy: { createdAt: 'desc' }
      });

      return templates;
    } catch (error) {
      logger.error('Error al obtener plantillas:', error);
      throw error;
    }
  }

  /**
   * Obtener plantilla por ID
   */
  async getById(id) {
    try {
      const template = await prisma.drawTemplate.findUnique({
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

      if (!template) {
        throw new Error('Plantilla no encontrada');
      }

      return template;
    } catch (error) {
      logger.error('Error al obtener plantilla:', error);
      throw error;
    }
  }

  /**
   * Actualizar plantilla
   */
  async update(id, data) {
    try {
      const template = await prisma.drawTemplate.findUnique({
        where: { id }
      });

      if (!template) {
        throw new Error('Plantilla no encontrada');
      }

      // Validar días de la semana si se proporcionan
      if (data.daysOfWeek) {
        if (!Array.isArray(data.daysOfWeek) || data.daysOfWeek.some(d => d < 1 || d > 7)) {
          throw new Error('Días de la semana inválidos (deben ser 1-7)');
        }
      }

      // Validar formato de horas si se proporcionan
      if (data.drawTimes) {
        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
        if (!Array.isArray(data.drawTimes) || data.drawTimes.some(t => !timeRegex.test(t))) {
          throw new Error('Formato de horas inválido (debe ser HH:MM)');
        }
      }

      const updated = await prisma.drawTemplate.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.daysOfWeek && { daysOfWeek: data.daysOfWeek }),
          ...(data.drawTimes && { drawTimes: data.drawTimes }),
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

      logger.info(`Plantilla actualizada: ${updated.name}`);
      return updated;
    } catch (error) {
      logger.error('Error al actualizar plantilla:', error);
      throw error;
    }
  }

  /**
   * Eliminar plantilla
   */
  async delete(id) {
    try {
      const template = await prisma.drawTemplate.findUnique({
        where: { id }
      });

      if (!template) {
        throw new Error('Plantilla no encontrada');
      }

      await prisma.drawTemplate.delete({
        where: { id }
      });

      logger.info(`Plantilla eliminada: ${template.name}`);
      return true;
    } catch (error) {
      logger.error('Error al eliminar plantilla:', error);
      throw error;
    }
  }

  /**
   * Obtener plantillas activas para un día específico
   */
  async getActiveForDay(dayOfWeek) {
    try {
      // dayOfWeek: 1-7 (1=Lunes, 7=Domingo)
      if (dayOfWeek < 1 || dayOfWeek > 7) {
        throw new Error('Día de la semana inválido (debe ser 1-7)');
      }

      const templates = await prisma.drawTemplate.findMany({
        where: {
          isActive: true,
          daysOfWeek: {
            has: dayOfWeek
          }
        },
        include: {
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true,
              isActive: true
            }
          }
        }
      });

      // Filtrar solo juegos activos
      return templates.filter(t => t.game.isActive);
    } catch (error) {
      logger.error('Error al obtener plantillas del día:', error);
      throw error;
    }
  }
}

export default new DrawTemplateService();
