import api from './axios';

export const pagoMovilApi = {
  getMyAccounts: async () => {
    const response = await api.get('/pago-movil-accounts/my-accounts');
    return response.data;
  },

  getDefaultAccount: async () => {
    const response = await api.get('/pago-movil-accounts/default');
    return response.data;
  },

  createAccount: async (data) => {
    const response = await api.post('/pago-movil-accounts', data);
    return response.data;
  },

  updateAccount: async (id, data) => {
    const response = await api.put(`/pago-movil-accounts/${id}`, data);
    return response.data;
  },

  deleteAccount: async (id) => {
    const response = await api.delete(`/pago-movil-accounts/${id}`);
    return response.data;
  },

  setDefaultAccount: async (id) => {
    const response = await api.patch(`/pago-movil-accounts/${id}/set-default`);
    return response.data;
  },

  getSystemAccounts: async () => {
    const response = await api.get('/system-pago-movil/active');
    return response.data;
  },

  // Admin methods for system accounts
  getAllSystemAccounts: async () => {
    const response = await api.get('/system-pago-movil');
    return response.data;
  },

  createSystemAccount: async (data) => {
    const response = await api.post('/system-pago-movil', data);
    return response.data;
  },

  updateSystemAccount: async (id, data) => {
    const response = await api.put(`/system-pago-movil/${id}`, data);
    return response.data;
  },

  deleteSystemAccount: async (id) => {
    const response = await api.delete(`/system-pago-movil/${id}`);
    return response.data;
  }
};

export default pagoMovilApi;
