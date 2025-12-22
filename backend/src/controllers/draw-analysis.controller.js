/**
 * Controlador para Análisis de Sorteos
 */

import drawAnalysisService from '../services/draw-analysis.service.js';
import logger from '../lib/logger.js';

class DrawAnalysisController {
  /**
   * GET /api/analysis/draw/:drawId
   * Obtener análisis completo de impacto de ganadores
   */
  async analyzeDrawWinnerImpact(req, res) {
    try {
      const { drawId } = req.params;
      const analysis = await drawAnalysisService.analyzeDrawWinnerImpact(drawId);
      res.json({ success: true, data: analysis });
    } catch (error) {
      logger.error('Error en analyzeDrawWinnerImpact:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/analysis/draw/:drawId/quick
   * Obtener resumen rápido de análisis
   */
  async getQuickAnalysis(req, res) {
    try {
      const { drawId } = req.params;
      const analysis = await drawAnalysisService.getQuickAnalysis(drawId);
      res.json({ success: true, data: analysis });
    } catch (error) {
      logger.error('Error en getQuickAnalysis:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new DrawAnalysisController();
