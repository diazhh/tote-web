import api from './axios';

const tripletaAPI = {
  /**
   * Crear una apuesta tripleta
   */
  createBet: async (data) => {
    const response = await api.post('/tripleta/bet', data);
    return response.data;
  },

  /**
   * Obtener mis apuestas tripleta
   */
  getMyBets: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.gameId) params.append('gameId', filters.gameId);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);

    const response = await api.get(`/tripleta/my-bets?${params.toString()}`);
    return response.data;
  },

  /**
   * Obtener una apuesta por ID
   */
  getById: async (id) => {
    const response = await api.get(`/tripleta/${id}`);
    return response.data;
  },

  /**
   * Obtener estadísticas de tripletas para un juego
   */
  getGameStats: async (gameId) => {
    const response = await api.get(`/tripleta/game/${gameId}/stats`);
    return response.data;
  },
};

export default tripletaAPI;
