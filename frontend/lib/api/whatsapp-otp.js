import api from './axios';

export const whatsappOtpApi = {
  sendOtp: async () => {
    const response = await api.post('/whatsapp-otp/send');
    return response.data;
  },

  verifyOtp: async (code) => {
    const response = await api.post('/whatsapp-otp/verify', { code });
    return response.data;
  },

  toggleNotifications: async (enabled) => {
    const response = await api.put('/whatsapp-otp/notifications', { enabled });
    return response.data;
  }
};

export default whatsappOtpApi;
