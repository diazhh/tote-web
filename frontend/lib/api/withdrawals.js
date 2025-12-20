import api from './axios';

export const withdrawalsApi = {
  createWithdrawal: async (data) => {
    const response = await api.post('/withdrawals', data);
    return response.data;
  },

  getMyWithdrawals: async (params = {}) => {
    const response = await api.get('/withdrawals/my-withdrawals', { params });
    return response.data;
  },

  getWithdrawalById: async (id) => {
    const response = await api.get(`/withdrawals/${id}`);
    return response.data;
  },

  cancelWithdrawal: async (id) => {
    const response = await api.delete(`/withdrawals/${id}`);
    return response.data;
  },

  // Admin methods
  getAllWithdrawals: async (params = {}) => {
    const response = await api.get('/withdrawals', { params });
    return response.data;
  },

  processWithdrawal: async (id) => {
    const response = await api.post(`/withdrawals/${id}/process`);
    return response.data;
  },

  completeWithdrawal: async (id, data) => {
    const response = await api.post(`/withdrawals/${id}/complete`, data);
    return response.data;
  },

  rejectWithdrawal: async (id, data) => {
    const response = await api.post(`/withdrawals/${id}/reject`, data);
    return response.data;
  }
};

export default withdrawalsApi;
