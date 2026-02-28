import api from './axios';

const passwordResetAPI = {
  requestReset: async (email) => {
    const response = await api.post('/password-reset/request', { email });
    return response.data;
  },

  resetPassword: async (token, password) => {
    const response = await api.post('/password-reset/reset', { token, password });
    return response.data;
  },

  validateToken: async (token) => {
    const response = await api.get('/password-reset/validate', { params: { token } });
    return response.data;
  }
};

export default passwordResetAPI;
