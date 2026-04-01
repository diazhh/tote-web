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
   * Obtener reporte diario
   * @param {string} date - YYYY-MM-DD (legacy single day)
   * @param {string|null} gameId - optional game UUID filter
   * @param {Object} extraFilters - dateFrom, dateTo, source, apiSystemId (BACK-01/02)
   */
  getDailyReport: async (date, gameId = null, extraFilters = {}) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (gameId) params.append('gameId', gameId);
    if (extraFilters.dateFrom)    params.append('dateFrom',    extraFilters.dateFrom);
    if (extraFilters.dateTo)      params.append('dateTo',      extraFilters.dateTo);
    if (extraFilters.source)      params.append('source',      extraFilters.source);
    if (extraFilters.apiSystemId) params.append('apiSystemId', extraFilters.apiSystemId);
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
