import api from './axios';

export const depositsApi = {
  createDeposit: async (data) => {
    const response = await api.post('/api/deposits', data);
    return response.data;
  },

  getMyDeposits: async (params = {}) => {
    const response = await api.get('/api/deposits/my-deposits', { params });
    return response.data;
  },

  getDepositById: async (id) => {
    const response = await api.get(`/api/deposits/${id}`);
    return response.data;
  },

  cancelDeposit: async (id) => {
    const response = await api.delete(`/api/deposits/${id}`);
    return response.data;
  },

  // Admin methods
  getAllDeposits: async (params = {}) => {
    const response = await api.get('/api/deposits', { params });
    return response.data;
  },

  approveDeposit: async (id, data) => {
    const response = await api.post(`/api/deposits/${id}/approve`, data);
    return response.data;
  },

  rejectDeposit: async (id, data) => {
    const response = await api.post(`/api/deposits/${id}/reject`, data);
    return response.data;
  }
};

export default depositsApi;
