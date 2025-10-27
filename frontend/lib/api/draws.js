import api from './axios';

/**
 * API client para sorteos (admin)
 */
const drawsAPI = {
  /**
   * Listar sorteos con filtros
   */
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.gameId) params.append('gameId', filters.gameId);
    if (filters.status) params.append('status', filters.status);
    if (filters.startDate) params.append('dateFrom', filters.startDate);
    if (filters.endDate) params.append('dateTo', filters.endDate);
    
    // Convertir paginación de page/pageSize a limit/skip
    if (filters.pageSize) {
      params.append('limit', filters.pageSize);
      if (filters.page && filters.page > 1) {
        params.append('skip', (filters.page - 1) * filters.pageSize);
      }
    }

    const response = await api.get(`/api/draws?${params.toString()}`);
    return response.data;
  },

  /**
   * Obtener sorteo por ID
   */
  getById: async (id) => {
    const response = await api.get(`/api/draws/${id}`);
    return response.data;
  },

  /**
   * Crear sorteo manual
   */
  create: async (drawData) => {
    const response = await api.post('/api/draws', drawData);
    return response.data;
  },

  /**
   * Actualizar sorteo
   */
  update: async (id, updates) => {
    const response = await api.put(`/api/draws/${id}`, updates);
    return response.data;
  },

  /**
   * Cancelar sorteo
   */
  cancel: async (id) => {
    const response = await api.delete(`/api/draws/${id}`);
    return response.data;
  },

  /**
   * Generar sorteos del día
   */
  generateDaily: async (date) => {
    const response = await api.post('/api/draws/generate-daily', { date });
    return response.data;
  },

  /**
   * Sorteos de hoy
   */
  today: async () => {
    const response = await api.get('/api/draws/today');
    return response.data;
  },

  /**
   * Próximos sorteos
   */
  upcoming: async (limit = 10) => {
    const response = await api.get(`/api/draws?limit=${limit}&orderBy=asc`);
    return response.data;
  },

  /**
   * Preseleccionar ganador
   */
  preselect: async (id, itemId = null) => {
    const response = await api.post(`/api/draws/${id}/preselect`, { itemId });
    return response.data;
  },

  /**
   * Cambiar ganador
   */
  changeWinner: async (id, itemId) => {
    const response = await api.post(`/api/draws/${id}/change-winner`, { newWinnerItemId: itemId });
    return response.data;
  },

  /**
   * Forzar publicación
   */
  publish: async (id, channels = null) => {
    const response = await api.post(`/api/draws/${id}/publish`, { channels });
    return response.data;
  },

  /**
   * Obtener publicaciones
   */
  getPublications: async (id) => {
    const response = await api.get(`/api/draws/${id}/publications`);
    return response.data;
  }
};

export default drawsAPI;
