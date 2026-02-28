import api from './axios';

const emailVerificationAPI = {
  sendCode: async () => {
    const response = await api.post('/email-verification/send');
    return response.data;
  },

  verifyCode: async (code) => {
    const response = await api.post('/email-verification/verify', { code });
    return response.data;
  },

  getStatus: async () => {
    const response = await api.get('/email-verification/status');
    return response.data;
  }
};

export default emailVerificationAPI;
