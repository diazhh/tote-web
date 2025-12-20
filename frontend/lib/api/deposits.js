import api from './axios';

export const depositsApi = {
  createDeposit: async (data) => {
    const response = await api.post('/deposits', data);
    return response.data;
  },

  getMyDeposits: async (params = {}) => {
    const response = await api.get('/deposits/my-deposits', { params });
    return response.data;
  },

  getDepositById: async (id) => {
    const response = await api.get(`/deposits/${id}`);
    return response.data;
  },

  cancelDeposit: async (id) => {
    const response = await api.delete(`/deposits/${id}`);
    return response.data;
  },

  // Admin methods
  getAllDeposits: async (params = {}) => {
    const response = await api.get('/deposits', { params });
    return response.data;
  },

  approveDeposit: async (id, data) => {
    const response = await api.post(`/deposits/${id}/approve`, data);
    return response.data;
  },

  rejectDeposit: async (id, data) => {
    const response = await api.post(`/deposits/${id}/reject`, data);
    return response.data;
  }
};

export default depositsApi;
