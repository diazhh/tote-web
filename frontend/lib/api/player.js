import api from './axios';

export const playerApi = {
  getBalance: async () => {
    const response = await api.get('/api/player/balance');
    return response.data;
  },

  getStatistics: async () => {
    const response = await api.get('/api/player/statistics');
    return response.data;
  },

  getTransactions: async (params = {}) => {
    const response = await api.get('/api/player/transactions', { params });
    return response.data;
  },

  getTickets: async (params = {}) => {
    const response = await api.get('/api/player/tickets', { params });
    return response.data;
  },

  getDeposits: async (params = {}) => {
    const response = await api.get('/api/player/deposits', { params });
    return response.data;
  },

  getWithdrawals: async (params = {}) => {
    const response = await api.get('/api/player/withdrawals', { params });
    return response.data;
  }
};

export default playerApi;
