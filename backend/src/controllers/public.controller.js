import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { formatDate } from '../lib/dateUtils.js';

// Helper para obtener drawDate de una fecha
function getDrawDate(date) {
  const d = new Date(date);
  const dateStr = d.toISOString().split('T')[0];
  return new Date(dateStr + 'T00:00:00.000Z');
}

// Helper para obtener el drawDate de hoy
function getTodayDrawDate() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  return new Date(dateStr + 'T00:00:00.000Z');
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
      const todayDrawDate = getTodayDrawDate();

      const draws = await prisma.draw.findMany({
        where: {
          drawDate: todayDrawDate,
          game: {
            isActive: true
          }
        },
        select: {
          id: true,
          drawDate: true,
          drawTime: true,
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
        orderBy: [
          { drawDate: 'asc' },
          { drawTime: 'asc' }
        ]
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

      const drawDate = getDrawDate(date);

      const draws = await prisma.draw.findMany({
        where: {
          drawDate: drawDate,
          game: {
            isActive: true
          }
        },
        select: {
          id: true,
          drawDate: true,
          drawTime: true,
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
        orderBy: [
          { drawDate: 'asc' },
          { drawTime: 'asc' }
        ]
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
      const todayDrawDate = getTodayDrawDate();

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
          drawDate: todayDrawDate
        },
        select: {
          id: true,
          drawDate: true,
          drawTime: true,
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
        orderBy: [
          { drawDate: 'asc' },
          { drawTime: 'asc' }
        ]
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
        where.drawDate = {};
        if (startDate) where.drawDate.gte = getDrawDate(startDate);
        if (endDate) where.drawDate.lte = getDrawDate(endDate);
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
            drawDate: true,
            drawTime: true,
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
          orderBy: [
            { drawDate: 'desc' },
            { drawTime: 'desc' }
          ],
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
      const { getVenezuelaDateAsUTC, getVenezuelaTimeString } = await import('../lib/dateUtils.js');
      const todayVenezuela = getVenezuelaDateAsUTC();
      const currentTime = getVenezuelaTimeString();

      const draws = await prisma.draw.findMany({
        where: {
          OR: [
            { drawDate: todayVenezuela, drawTime: { gt: currentTime } },
            { drawDate: { gt: todayVenezuela } }
          ],
          status: {
            in: ['SCHEDULED', 'CLOSED']
          },
          game: {
            isActive: true
          }
        },
        select: {
          id: true,
          drawDate: true,
          drawTime: true,
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
        orderBy: [
          { drawDate: 'asc' },
          { drawTime: 'asc' }
        ],
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
          drawDate: true,
          drawTime: true,
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
      const startDrawDate = getDrawDate(startDate);
      const totalDraws = await prisma.draw.count({
        where: {
          gameId: game.id,
          status: 'PUBLISHED',
          drawDate: {
            gte: startDrawDate
          }
        }
      });

      // Números más ganadores
      const winnerStats = await prisma.draw.groupBy({
        by: ['winnerItemId'],
        where: {
          gameId: game.id,
          status: 'PUBLISHED',
          drawDate: {
            gte: startDrawDate
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
