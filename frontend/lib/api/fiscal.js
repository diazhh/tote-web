/**
 * API client para el rol FISCALIZADOR.
 */
import axios from './axios';

const fiscalApi = {
  /** GET /api/fiscal/scope — juegos y proveedores visibles + flag taquilla */
  async getScope() {
    const response = await axios.get('/fiscal/scope');
    return response.data;
  },

  /**
   * GET /api/fiscal/report
   * @param {object} params
   * @param {string} params.dateFrom YYYY-MM-DD
   * @param {string} params.dateTo   YYYY-MM-DD
   * @param {string[]} [params.gameIds]
   * @param {string[]} [params.apiSystemIds]
   * @param {boolean}  [params.includeTaquilla]
   */
  async getReport({ dateFrom, dateTo, gameIds, apiSystemIds, includeTaquilla } = {}) {
    const params = new URLSearchParams();
    params.append('dateFrom', dateFrom);
    params.append('dateTo', dateTo);
    if (gameIds && gameIds.length > 0) params.append('gameIds', gameIds.join(','));
    if (apiSystemIds && apiSystemIds.length > 0) params.append('apiSystemIds', apiSystemIds.join(','));
    if (includeTaquilla === false) params.append('includeTaquilla', 'false');
    const response = await axios.get(`/fiscal/report?${params.toString()}`);
    return response.data;
  },
};

export default fiscalApi;
