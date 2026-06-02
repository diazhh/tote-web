/**
 * API client para el rol VIEWER (visor). Solo reporte de ventas.
 */
import axios from './axios';

const visorApi = {
  /** GET /api/visor/scope — juegos visibles para el visor */
  async getScope() {
    const response = await axios.get('/visor/scope');
    return response.data;
  },

  /**
   * GET /api/visor/report — reporte de ventas (sin premios ni utilidad)
   * @param {object} params
   * @param {string} params.dateFrom YYYY-MM-DD
   * @param {string} params.dateTo   YYYY-MM-DD
   * @param {string[]} [params.gameIds]
   */
  async getReport({ dateFrom, dateTo, gameIds } = {}) {
    const params = new URLSearchParams();
    params.append('dateFrom', dateFrom);
    params.append('dateTo', dateTo);
    if (gameIds && gameIds.length > 0) params.append('gameIds', gameIds.join(','));
    const response = await axios.get(`/visor/report?${params.toString()}`);
    return response.data;
  },
};

export default visorApi;
