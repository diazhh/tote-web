import api from './axios';

export const adminPlayersApi = {
  // Read-only endpoints
  getPlayers: async (params = {}) => {
    const response = await api.get('/players', { params });
    return response.data;
  },

  getPlayerDetails: async (id) => {
    const response = await api.get(`/players/${id}`);
    return response.data;
  },

  getPlayerTickets: async (id, params = {}) => {
    const response = await api.get(`/players/${id}/tickets`, { params });
    return response.data;
  },

  getPlayerTripletas: async (id, params = {}) => {
    const response = await api.get(`/players/${id}/tripletas`, { params });
    return response.data;
  },

  getPlayerMovements: async (id, params = {}) => {
    const response = await api.get(`/players/${id}/movements`, { params });
    return response.data;
  },

  getPlayerStats: async (id) => {
    const response = await api.get(`/players/${id}/stats`);
    return response.data;
  },

  getPlayerDeposits: async (id, params = {}) => {
    const response = await api.get(`/players/${id}/deposits`, { params });
    return response.data;
  },

  getPlayerWithdrawals: async (id, params = {}) => {
    const response = await api.get(`/players/${id}/withdrawals`, { params });
    return response.data;
  },

  // Admin-only action endpoints
  toggleStatus: async (id) => {
    const response = await api.patch(`/players/${id}/status`);
    return response.data;
  },

  updateProfile: async (id, data) => {
    const response = await api.patch(`/players/${id}/profile`, data);
    return response.data;
  },

  sendResetLink: async (id) => {
    const response = await api.post(`/players/${id}/send-reset-link`);
    return response.data;
  },

  adjustBalance: async (id, data) => {
    const response = await api.post(`/players/${id}/adjustment`, data);
    return response.data;
  },

  giveBonus: async (id, data) => {
    const response = await api.post(`/players/${id}/bonus`, data);
    return response.data;
  }
};

export default adminPlayersApi;
