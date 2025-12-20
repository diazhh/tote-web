import api from './axios';

export const pagoMovilApi = {
  getMyAccounts: async () => {
    const response = await api.get('/api/pago-movil-accounts/my-accounts');
    return response.data;
  },

  getDefaultAccount: async () => {
    const response = await api.get('/api/pago-movil-accounts/default');
    return response.data;
  },

  createAccount: async (data) => {
    const response = await api.post('/api/pago-movil-accounts', data);
    return response.data;
  },

  updateAccount: async (id, data) => {
    const response = await api.put(`/api/pago-movil-accounts/${id}`, data);
    return response.data;
  },

  deleteAccount: async (id) => {
    const response = await api.delete(`/api/pago-movil-accounts/${id}`);
    return response.data;
  },

  setDefaultAccount: async (id) => {
    const response = await api.patch(`/api/pago-movil-accounts/${id}/set-default`);
    return response.data;
  },

  getSystemAccounts: async () => {
    const response = await api.get('/api/system-pago-movil/active');
    return response.data;
  },

  // Admin methods for system accounts
  getAllSystemAccounts: async () => {
    const response = await api.get('/api/system-pago-movil');
    return response.data;
  },

  createSystemAccount: async (data) => {
    const response = await api.post('/api/system-pago-movil', data);
    return response.data;
  },

  updateSystemAccount: async (id, data) => {
    const response = await api.put(`/api/system-pago-movil/${id}`, data);
    return response.data;
  },

  deleteSystemAccount: async (id) => {
    const response = await api.delete(`/api/system-pago-movil/${id}`);
    return response.data;
  }
};

export default pagoMovilApi;
