import api from './axios';

/**
 * API client para autenticación
 */
const authAPI = {
  /**
   * Login de usuario
   */
  login: async (username, password) => {
    const response = await api.post('/api/auth/login', { username, password });
    return response.data;
  },

  /**
   * Obtener usuario actual
   */
  me: async () => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },

  /**
   * Cambiar contraseña
   */
  changePassword: async (currentPassword, newPassword) => {
    const response = await api.post('/api/auth/change-password', {
      currentPassword,
      newPassword
    });
    return response.data;
  },

  /**
   * Listar usuarios (solo ADMIN)
   */
  listUsers: async () => {
    const response = await api.get('/api/auth/users');
    return response.data;
  },

  /**
   * Registrar nuevo usuario (solo ADMIN)
   */
  register: async (userData) => {
    const response = await api.post('/api/auth/register', userData);
    return response.data;
  },

  /**
   * Actualizar usuario (solo ADMIN)
   */
  updateUser: async (userId, updates) => {
    const response = await api.patch(`/api/auth/users/${userId}`, updates);
    return response.data;
  }
};

export default authAPI;
