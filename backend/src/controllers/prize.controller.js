import prizeProcessorService from '../services/prize-processor.service.js';
import { processTicketPrizesJob } from '../jobs/processTicketPrizes.job.js';
import logger from '../lib/logger.js';

class PrizeController {
  async processPrizes(req, res) {
    try {
      const { drawId } = req.params;

      if (!drawId) {
        return res.status(400).json({
          success: false,
          error: 'El drawId es requerido'
        });
      }

      const result = await prizeProcessorService.processPrizesForDraw(drawId);

      res.json({
        success: true,
        data: result,
        message: 'Premios procesados exitosamente'
      });
    } catch (error) {
      logger.error('Error in processPrizes:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al procesar premios'
      });
    }
  }

  async processAllPendingPrizes(req, res) {
    try {
      const result = await processTicketPrizesJob();

      res.json({
        success: true,
        data: result,
        message: result.message
      });
    } catch (error) {
      logger.error('Error in processAllPendingPrizes:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al procesar premios pendientes'
      });
    }
  }

  async getPrizesSummary(req, res) {
    try {
      const { drawId } = req.params;

      if (!drawId) {
        return res.status(400).json({
          success: false,
          error: 'El drawId es requerido'
        });
      }

      const summary = await prizeProcessorService.getPrizesSummary(drawId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error('Error in getPrizesSummary:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener resumen de premios'
      });
    }
  }
}

export default new PrizeController();
