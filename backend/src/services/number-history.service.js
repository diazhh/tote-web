import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class NumberHistoryService {
  /**
   * Get last seen information for a number in a specific game
   * @param {string} gameId - Game ID
   * @param {string} number - Number to search
   * @returns {Promise<Object>} - Last seen info
   */
  async getNumberLastSeen(gameId, number) {
    try {
      const lastWin = await prisma.draw.findFirst({
        where: {
          gameId,
          status: 'PUBLISHED',
          winnerItem: {
            number: number
          }
        },
        include: {
          winnerItem: true
        },
        orderBy: {
          drawDate: 'desc'
        }
      });

      if (!lastWin) {
        return {
          number,
          lastSeen: null,
          daysAgo: null,
          neverSeen: true
        };
      }

      const lastSeenDate = new Date(lastWin.drawDate);
      const today = new Date();
      const daysAgo = Math.floor((today - lastSeenDate) / (1000 * 60 * 60 * 24));

      return {
        number,
        lastSeen: lastWin.drawDate,
        drawTime: lastWin.drawTime,
        daysAgo,
        neverSeen: false
      };
    } catch (error) {
      logger.error(`Error getting last seen for number ${number}:`, error);
      throw error;
    }
  }

  /**
   * Get last 10 times a number has won in a specific game
   * @param {string} gameId - Game ID
   * @param {string} number - Number to search
   * @param {number} limit - Number of results (default 10)
   * @returns {Promise<Array>} - Array of wins
   */
  async getNumberHistory(gameId, number, limit = 10) {
    try {
      const wins = await prisma.draw.findMany({
        where: {
          gameId,
          status: 'PUBLISHED',
          winnerItem: {
            number: number
          }
        },
        include: {
          winnerItem: true
        },
        orderBy: {
          drawDate: 'desc'
        },
        take: limit
      });

      return wins.map(draw => ({
        drawId: draw.id,
        drawDate: draw.drawDate,
        drawTime: draw.drawTime,
        number: draw.winnerItem.number,
        name: draw.winnerItem.name
      }));
    } catch (error) {
      logger.error(`Error getting history for number ${number}:`, error);
      throw error;
    }
  }

  /**
   * Get last seen info for all numbers in a game
   * @param {string} gameId - Game ID
   * @returns {Promise<Object>} - Map of number -> last seen info
   */
  async getAllNumbersLastSeen(gameId) {
    try {
      // Get all game items
      const gameItems = await prisma.gameItem.findMany({
        where: { gameId }
      });

      // Get all published draws with winners
      const draws = await prisma.draw.findMany({
        where: {
          gameId,
          status: 'PUBLISHED',
          winnerItemId: { not: null }
        },
        include: {
          winnerItem: true
        },
        orderBy: {
          drawDate: 'desc'
        }
      });

      // Create a map of number -> last seen
      const lastSeenMap = {};
      const today = new Date();

      for (const item of gameItems) {
        const lastWin = draws.find(d => d.winnerItem.number === item.number);
        
        if (lastWin) {
          const lastSeenDate = new Date(lastWin.drawDate);
          const daysAgo = Math.floor((today - lastSeenDate) / (1000 * 60 * 60 * 24));
          
          lastSeenMap[item.number] = {
            lastSeen: lastWin.drawDate,
            drawTime: lastWin.drawTime,
            daysAgo,
            neverSeen: false
          };
        } else {
          lastSeenMap[item.number] = {
            lastSeen: null,
            drawTime: null,
            daysAgo: null,
            neverSeen: true
          };
        }
      }

      return lastSeenMap;
    } catch (error) {
      logger.error(`Error getting all numbers last seen:`, error);
      throw error;
    }
  }
}

export default new NumberHistoryService();
