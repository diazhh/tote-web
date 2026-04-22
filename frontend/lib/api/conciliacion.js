// frontend/lib/api/conciliacion.js
import axios from './axios';

export const conciliacionApi = {
  /**
   * @param {Object} params
   * @param {string} params.dateFrom  - YYYY-MM-DD
   * @param {string} params.dateTo    - YYYY-MM-DD
   * @param {string[]} [params.gameIds] - optional UUID array
   */
  getReport: async ({ dateFrom, dateTo, gameIds = [] } = {}) => {
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo)   params.append('dateTo',   dateTo);
    gameIds.forEach(id => params.append('gameIds[]', id));
    const response = await axios.get(`/conciliacion?${params.toString()}`);
    return response.data;
  },
};

export default conciliacionApi;
