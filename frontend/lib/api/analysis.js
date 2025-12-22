/**
 * API Client para Análisis de Sorteos
 */

import axios from './axios';

export const analysisApi = {
  /**
   * Obtener análisis completo de impacto de ganadores
   */
  analyzeDrawWinnerImpact: async (drawId) => {
    const response = await axios.get(`/analysis/draw/${drawId}`);
    return response.data;
  },

  /**
   * Obtener resumen rápido de análisis
   */
  getQuickAnalysis: async (drawId) => {
    const response = await axios.get(`/analysis/draw/${drawId}/quick`);
    return response.data;
  }
};

export default analysisApi;
