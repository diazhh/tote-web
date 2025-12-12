import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

// Helper para obtener inicio y fin del día en Venezuela (UTC-4)
function getVenezuelaDayBounds(date) {
  // Crear fecha en Venezuela
  const d = new Date(date);
  
  // Si la fecha viene como string YYYY-MM-DD, interpretarla como fecha en Venezuela
  if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Crear fecha a medianoche en Venezuela (UTC-4 = +4 horas en UTC)
    const [year, month, day] = date.split('-').map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0)); // 00:00 VE = 04:00 UTC
    const endOfDay = new Date(Date.UTC(year, month - 1, day + 1, 3, 59, 59, 999)); // 23:59 VE = 03:59 UTC del día siguiente
    return { startOfDay, endOfDay };
  }
  
  // Para fechas Date, usar la hora local del servidor ajustada a Venezuela
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  const startOfDay = new Date(Date.UTC(year, month, day, 4, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month, day + 1, 3, 59, 59, 999));
  return { startOfDay, endOfDay };
}

// Helper para obtener el día actual en Venezuela
function getTodayVenezuelaBounds() {
  // Obtener la hora actual en Venezuela
  const now = new Date();
  const venezuelaOffset = -4 * 60; // UTC-4 en minutos
  const localOffset = now.getTimezoneOffset();
  const venezuelaTime = new Date(now.getTime() + (localOffset - venezuelaOffset) * 60 * 1000);
  
  const year = venezuelaTime.getFullYear();
  const month = venezuelaTime.getMonth();
  const day = venezuelaTime.getDate();
  
  const startOfDay = new Date(Date.UTC(year, month, day, 4, 0, 0, 0)); // 00:00 VE = 04:00 UTC
  const endOfDay = new Date(Date.UTC(year, month, day + 1, 3, 59, 59, 999)); // 23:59 VE = 03:59 UTC del día siguiente
  return { startOfDay, endOfDay };
}

class PublicController {
  /**
   * GET /api/public/games
   * Listar juegos activos
   */
  async getGames(req, res) {
    try {
      const games = await prisma.game.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          description: true,
          totalNumbers: true
        },
        orderBy: { name: 'asc' }
      });

      res.json({
        success: true,
        data: games
      });
    } catch (error) {
      logger.error('Error en getGames público:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/public/draws/today
   * Obtener sorteos de hoy (todos los juegos)
   */
  async getDrawsToday(req, res) {
    try {
      const { startOfDay: startDate, endOfDay: endDate } = getTodayVenezuelaBounds();

      const draws = await prisma.draw.findMany({
        where: {
          scheduledAt: {
            gte: startDate,
            lte: endDate
          },
          game: {
            isActive: true
          }
        },
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          imageUrl: true,
          imageGenerated: true,
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          },
          winnerItem: {
            select: {
              number: true,
              name: true
            }
          }
        },
        orderBy: { scheduledAt: 'asc' }
      });

      // Solo mostrar winnerItem cuando el sorteo está PUBLISHED
      const sanitizedDraws = draws.map(draw => ({
        ...draw,
        winnerItem: draw.status === 'PUBLISHED' ? draw.winnerItem : null
      }));

      res.json({
        success: true,
        data: sanitizedDraws
      });
    } catch (error) {
      logger.error('Error en getDrawsToday:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/public/draws/by-date
   * Obtener sorteos de una fecha específica (todos los juegos)
   */
  async getDrawsByDate(req, res) {
    try {
      const { date } = req.query;
      
      if (!date) {
        return res.status(400).json({
          success: false,
          error: 'Fecha requerida'
        });
      }

      const { startOfDay: startDate, endOfDay: endDate } = getVenezuelaDayBounds(date);

      const draws = await prisma.draw.findMany({
        where: {
          scheduledAt: {
            gte: startDate,
            lte: endDate
          },
          game: {
            isActive: true
          }
        },
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          imageUrl: true,
          imageGenerated: true,
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          },
          winnerItem: {
            select: {
              number: true,
              name: true
            }
          }
        },
        orderBy: { scheduledAt: 'asc' }
      });

      // Solo mostrar winnerItem cuando el sorteo está PUBLISHED
      const sanitizedDraws = draws.map(draw => ({
        ...draw,
        winnerItem: draw.status === 'PUBLISHED' ? draw.winnerItem : null
      }));

      res.json({
        success: true,
        data: sanitizedDraws
      });
    } catch (error) {
      logger.error('Error en getDrawsByDate:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/public/draws/game/:gameSlug/today
   * Obtener sorteos de hoy para un juego específico
   */
  async getGameDrawsToday(req, res) {
    try {
      const { gameSlug } = req.params;
      const { startOfDay: startDate, endOfDay: endDate } = getTodayVenezuelaBounds();

      const game = await prisma.game.findUnique({
        where: { slug: gameSlug }
      });

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Juego no encontrado'
        });
      }

      const draws = await prisma.draw.findMany({
        where: {
          gameId: game.id,
          scheduledAt: {
            gte: startDate,
            lte: endDate
          }
        },
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          imageUrl: true,
          imageGenerated: true,
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          },
          winnerItem: {
            select: {
              number: true,
              name: true
            }
          }
        },
        orderBy: { scheduledAt: 'asc' }
      });

      // Solo mostrar winnerItem cuando el sorteo está PUBLISHED
      const sanitizedDraws = draws.map(draw => ({
        ...draw,
        winnerItem: draw.status === 'PUBLISHED' ? draw.winnerItem : null
      }));

      res.json({
        success: true,
        data: sanitizedDraws
      });
    } catch (error) {
      logger.error('Error en getGameDrawsToday:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/public/draws/game/:gameSlug/history
   * Obtener histórico de sorteos de un juego
   */
  async getGameHistory(req, res) {
    try {
      const { gameSlug } = req.params;
      const { page = 1, pageSize = 20, startDate, endDate, number } = req.query;

      const game = await prisma.game.findUnique({
        where: { slug: gameSlug }
      });

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Juego no encontrado'
        });
      }

      const where = {
        gameId: game.id,
        status: 'PUBLISHED'
      };

      // Filtros opcionales
      if (startDate || endDate) {
        where.scheduledAt = {};
        if (startDate) where.scheduledAt.gte = new Date(startDate);
        if (endDate) where.scheduledAt.lte = new Date(endDate);
      }

      if (number) {
        where.winnerItem = {
          number: number
        };
      }

      const skip = (parseInt(page) - 1) * parseInt(pageSize);
      const take = parseInt(pageSize);

      const [draws, total] = await Promise.all([
        prisma.draw.findMany({
          where,
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            imageUrl: true,
            imageGenerated: true,
            game: {
              select: {
                id: true,
                name: true,
                slug: true,
                type: true
              }
            },
            winnerItem: {
              select: {
                number: true,
                name: true
              }
            }
          },
          orderBy: { scheduledAt: 'desc' },
          skip,
          take
        }),
        prisma.draw.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          draws: draws.map(draw => ({
            ...draw,
            winnerItem: draw.status === 'PUBLISHED' ? draw.winnerItem : null
          })),
          pagination: {
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            total,
            totalPages: Math.ceil(total / parseInt(pageSize))
          }
        }
      });
    } catch (error) {
      logger.error('Error en getGameHistory:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/public/draws/next
   * Obtener próximos sorteos
   */
  async getNextDraws(req, res) {
    try {
      const { limit = 10 } = req.query;

      const draws = await prisma.draw.findMany({
        where: {
          scheduledAt: {
            gte: new Date()
          },
          status: {
            in: ['SCHEDULED', 'CLOSED']
          },
          game: {
            isActive: true
          }
        },
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          imageUrl: true,
          imageGenerated: true,
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          },
        },
        orderBy: { scheduledAt: 'asc' },
        take: parseInt(limit)
      });

      // No mostrar preselectedItem en endpoints públicos
      res.json({
        success: true,
        data: draws
      });
    } catch (error) {
      logger.error('Error en getNextDraws:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/public/draws/:id
   * Obtener un sorteo específico
   */
  async getDraw(req, res) {
    try {
      const { id } = req.params;

      const draw = await prisma.draw.findUnique({
        where: { id },
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          imageUrl: true,
          imageGenerated: true,
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          },
          winnerItem: {
            select: {
              number: true,
              name: true
            }
          }
        }
      });

      if (!draw) {
        return res.status(404).json({
          success: false,
          error: 'Sorteo no encontrado'
        });
      }

      // Solo mostrar winnerItem cuando el sorteo está PUBLISHED
      res.json({
        success: true,
        data: {
          ...draw,
          winnerItem: draw.status === 'PUBLISHED' ? draw.winnerItem : null
        }
      });
    } catch (error) {
      logger.error('Error en getDraw:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/public/stats/game/:gameSlug
   * Obtener estadísticas de un juego
   */
  async getGameStats(req, res) {
    try {
      const { gameSlug } = req.params;
      const { days = 30 } = req.query;

      const game = await prisma.game.findUnique({
        where: { slug: gameSlug }
      });

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Juego no encontrado'
        });
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      // Total de sorteos
      const totalDraws = await prisma.draw.count({
        where: {
          gameId: game.id,
          status: 'PUBLISHED',
          scheduledAt: {
            gte: startDate
          }
        }
      });

      // Números más ganadores
      const winnerStats = await prisma.draw.groupBy({
        by: ['winnerItemId'],
        where: {
          gameId: game.id,
          status: 'PUBLISHED',
          scheduledAt: {
            gte: startDate
          },
          winnerItemId: {
            not: null
          }
        },
        _count: {
          winnerItemId: true
        },
        orderBy: {
          _count: {
            winnerItemId: 'desc'
          }
        },
        take: 10
      });

      // Obtener detalles de los números ganadores
      const topWinners = await Promise.all(
        winnerStats.map(async (stat) => {
          const item = await prisma.gameItem.findUnique({
            where: { id: stat.winnerItemId },
            select: {
              number: true,
              name: true
            }
          });
          return {
            ...item,
            count: stat._count.winnerItemId
          };
        })
      );

      res.json({
        success: true,
        data: {
          game: {
            id: game.id,
            name: game.name,
            slug: game.slug,
            type: game.type
          },
          period: {
            days: parseInt(days),
            startDate
          },
          totalDraws,
          topWinners
        }
      });
    } catch (error) {
      logger.error('Error en getGameStats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new PublicController();
