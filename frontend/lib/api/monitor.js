/**
 * API Client para el Monitor de Sorteos
 */

import axios from './axios';

export const monitorApi = {
  /**
   * Obtener estadísticas por banca para un sorteo
   */
  getBancaStats: async (drawId) => {
    const response = await axios.get(`/monitor/bancas/${drawId}`);
    return response.data;
  },

  /**
   * Obtener estadísticas por número/item para un sorteo
   */
  getItemStats: async (drawId) => {
    const response = await axios.get(`/monitor/items/${drawId}`);
    return response.data;
  },

  /**
   * Obtener reporte de sorteos con filtros completos
   * @param {Object} params
   * @param {string} [params.dateFrom] - YYYY-MM-DD
   * @param {string} [params.dateTo]   - YYYY-MM-DD
   * @param {string} [params.gameId]   - UUID or null
   * @param {string} [params.source]   - TAQUILLA_ONLINE | EXTERNAL_API | WEBHOOK_PUSH
   * @param {string} [params.apiSystemId] - UUID or null
   */
  getDailyReport: async ({ dateFrom, dateTo, gameId, source, apiSystemId } = {}) => {
    const params = new URLSearchParams();
    if (dateFrom)    params.append('dateFrom',    dateFrom);
    if (dateTo)      params.append('dateTo',      dateTo);
    if (gameId)      params.append('gameId',      gameId);
    if (source)      params.append('source',      source);
    if (apiSystemId) params.append('apiSystemId', apiSystemId);
    const response = await axios.get(`/monitor/reporte?${params.toString()}`);
    return response.data;
  },

  /**
   * Obtener tickets de una banca específica
   */
  getTicketsByBanca: async (drawId, bancaId) => {
    const response = await axios.get(`/monitor/tickets-by-banca/${drawId}/${bancaId}`);
    return response.data;
  },

  /**
   * Obtener tickets de un item específico
   */
  getTicketsByItem: async (drawId, itemId) => {
    const response = await axios.get(`/monitor/tickets-by-item/${drawId}/${itemId}`);
    return response.data;
  },

  /**
   * Obtener tripletas que incluyen un item específico
   */
  getTripletasByItem: async (drawId, itemId) => {
    const response = await axios.get(`/monitor/tripletas-by-item/${drawId}/${itemId}`);
    return response.data;
  }
};

export default monitorApi;
