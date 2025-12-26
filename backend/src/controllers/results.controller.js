/**
 * Controlador para resultados públicos
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getVenezuelaDateAsUTC } from '../lib/dateUtils.js';

export class ResultsController {
  /**
   * Obtener resultados del día
   * Retorna un objeto con 23 juegos, cada uno con array de sorteos totalizados
   * GET /api/public/results/today
   */
  async getTodayResults(req, res) {
    try {
      const todayVenezuela = getVenezuelaDateAsUTC();

      // Obtener todos los juegos activos
      const games = await prisma.game.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
      });

      // Obtener sorteos TOTALIZADOS del día
      const draws = await prisma.draw.findMany({
        where: {
          drawDate: todayVenezuela,
          status: 'PUBLISHED'
        },
        include: {
          game: true,
          winnerItem: true
        },
        orderBy: {
          drawTime: 'asc'
        }
      });

      // Agrupar sorteos por juego
      const results = {};
      
      for (const game of games) {
        const gameDraws = draws
          .filter(draw => draw.gameId === game.id)
          .map(draw => ({
            hora: draw.drawTime.substring(0, 5), // HH:MM
            numero: draw.winnerItem?.number || null,
            nombre: draw.winnerItem?.name || null
          }));

        results[game.id] = {
          nombre: game.name,
          sorteos: gameDraws
        };
      }

      res.json({
        fecha: todayVenezuela.toISOString().split('T')[0],
        juegos: results
      });

    } catch (error) {
      logger.error('Error obteniendo resultados del día:', error);
      res.status(500).json({
        error: 'Error obteniendo resultados',
        message: error.message
      });
    }
  }
}

export default new ResultsController();
