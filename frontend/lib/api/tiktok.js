import api from './axios';

const tiktokAPI = {
  /**
   * Crear una nueva instancia de TikTok
   * @param {Object} data - Datos para crear la instancia
   * @param {string} data.instanceId - ID único para la instancia
   * @param {string} data.name - Nombre descriptivo de la instancia
   * @param {string} data.clientKey - TikTok Client Key
   * @param {string} data.clientSecret - TikTok Client Secret
   * @param {string} data.redirectUri - URI de redirección OAuth
   */
  createInstance: async (data) => {
    const response = await api.post('/tiktok/instances', {
      instanceId: data.instanceId,
      name: data.name,
      clientKey: data.clientKey,
      clientSecret: data.clientSecret,
      redirectUri: data.redirectUri
    });
    return response.data;
  },

  /**
   * Autorizar instancia con código OAuth
   * @param {string} instanceId - ID de la instancia
   * @param {string} code - Código de autorización OAuth
   * @param {string} redirectUri - URI de redirección
   */
  authorizeInstance: async (instanceId, code, redirectUri) => {
    const response = await api.post(`/tiktok/instances/${instanceId}/authorize`, {
      code,
      redirectUri
    });
    return response.data;
  },

  /**
   * Obtener todas las instancias de TikTok
   */
  listInstances: async () => {
    const response = await api.get('/tiktok/instances');
    return response.data;
  },

  /**
   * Obtener instancia específica
   * @param {string} instanceId - ID de la instancia
   */
  getInstance: async (instanceId) => {
    const response = await api.get(`/tiktok/instances/${instanceId}`);
    return response.data;
  },

  /**
   * Obtener videos del usuario
   * @param {string} instanceId - ID de la instancia
   * @param {number} limit - Límite de videos a obtener
   */
  getUserVideos: async (instanceId, limit = 20) => {
    const response = await api.get(`/tiktok/instances/${instanceId}/videos`, {
      params: { limit }
    });
    return response.data;
  },

  /**
   * Refrescar token de acceso
   * @param {string} instanceId - ID de la instancia
   */
  refreshToken: async (instanceId) => {
    const response = await api.post(`/tiktok/instances/${instanceId}/refresh-token`);
    return response.data;
  },

  /**
   * Revocar acceso
   * @param {string} instanceId - ID de la instancia
   */
  revokeAccess: async (instanceId) => {
    const response = await api.post(`/tiktok/instances/${instanceId}/revoke`);
    return response.data;
  },

  /**
   * Probar conexión
   * @param {string} instanceId - ID de la instancia
   */
  testConnection: async (instanceId) => {
    const response = await api.post(`/tiktok/instances/${instanceId}/test`);
    return response.data;
  },

  /**
   * Desconectar instancia
   * @param {string} instanceId - ID de la instancia
   */
  disconnectInstance: async (instanceId) => {
    const response = await api.post(`/tiktok/instances/${instanceId}/disconnect`);
    return response.data;
  },

  /**
   * Eliminar instancia
   * @param {string} instanceId - ID de la instancia
   */
  deleteInstance: async (instanceId) => {
    const response = await api.delete(`/tiktok/instances/${instanceId}`);
    return response.data;
  },

  /**
   * Generar URL de autorización OAuth
   * @param {string} clientKey - TikTok Client Key
   * @param {string} redirectUri - URI de redirección
   * @param {string} scopes - Permisos solicitados
   */
  generateAuthUrl: (clientKey, redirectUri, scopes = 'user.info.basic,video.list') => {
    const baseUrl = 'https://www.tiktok.com/v2/auth/authorize';
    const params = new URLSearchParams({
      client_key: clientKey,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state: Math.random().toString(36).substring(7)
    });
    return `${baseUrl}?${params.toString()}`;
  }
};

export default tiktokAPI;
