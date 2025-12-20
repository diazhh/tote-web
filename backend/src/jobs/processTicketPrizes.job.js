import prizeProcessorService from '../services/prize-processor.service.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

export async function processTicketPrizesJob() {
  try {
    logger.info('Starting processTicketPrizes job');

    const drawnDraws = await prisma.draw.findMany({
      where: {
        status: 'DRAWN',
        winnerItemId: {
          not: null
        }
      },
      include: {
        game: true,
        winnerItem: true
      }
    });

    if (drawnDraws.length === 0) {
      logger.info('No draws in DRAWN status to process');
      return {
        success: true,
        message: 'No hay sorteos pendientes de procesar',
        processed: 0
      };
    }

    logger.info(`Found ${drawnDraws.length} draws to process prizes`);

    const results = [];

    for (const draw of drawnDraws) {
      try {
        const result = await prizeProcessorService.processPrizesForDraw(draw.id);
        results.push({
          drawId: draw.id,
          gameName: draw.game.name,
          success: true,
          ...result
        });
      } catch (error) {
        logger.error(`Error processing prizes for draw ${draw.id}:`, error);
        results.push({
          drawId: draw.id,
          gameName: draw.game.name,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    logger.info('processTicketPrizes job completed', {
      total: results.length,
      success: successCount,
      failures: failureCount
    });

    return {
      success: true,
      message: `Procesados ${successCount} sorteos exitosamente, ${failureCount} fallidos`,
      processed: successCount,
      failed: failureCount,
      results
    };
  } catch (error) {
    logger.error('Error in processTicketPrizes job:', error);
    throw error;
  }
}
