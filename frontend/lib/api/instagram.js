import api from './axios';

const instagramAPI = {
  /**
   * Crear una nueva instancia de Instagram
   * @param {Object} data - Datos para crear la instancia
   * @param {string} data.instanceId - ID único para la instancia
   * @param {string} data.name - Nombre descriptivo de la instancia
   * @param {string} data.appId - Facebook App ID
   * @param {string} data.appSecret - Facebook App Secret
   * @param {string} data.redirectUri - URI de redirección OAuth
   */
  createInstance: async (data) => {
    const response = await api.post('/instagram/instances', {
      instanceId: data.instanceId,
      name: data.name,
      appId: data.appId,
      appSecret: data.appSecret,
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
    const response = await api.post(`/instagram/instances/${instanceId}/authorize`, {
      code,
      redirectUri
    });
    return response.data;
  },

  /**
   * Obtener todas las instancias de Instagram
   */
  listInstances: async () => {
    const response = await api.get('/instagram/instances');
    return response.data;
  },

  /**
   * Obtener instancia específica
   * @param {string} instanceId - ID de la instancia
   */
  getInstance: async (instanceId) => {
    const response = await api.get(`/instagram/instances/${instanceId}`);
    return response.data;
  },

  /**
   * Obtener media del usuario
   * @param {string} instanceId - ID de la instancia
   * @param {number} limit - Límite de elementos a obtener
   */
  getUserMedia: async (instanceId, limit = 25) => {
    const response = await api.get(`/instagram/instances/${instanceId}/media`, {
      params: { limit }
    });
    return response.data;
  },

  /**
   * Refrescar token de acceso
   * @param {string} instanceId - ID de la instancia
   */
  refreshToken: async (instanceId) => {
    const response = await api.post(`/instagram/instances/${instanceId}/refresh-token`);
    return response.data;
  },

  /**
   * Probar conexión
   * @param {string} instanceId - ID de la instancia
   */
  testConnection: async (instanceId) => {
    const response = await api.post(`/instagram/instances/${instanceId}/test`);
    return response.data;
  },

  /**
   * Desconectar instancia
   * @param {string} instanceId - ID de la instancia
   */
  disconnectInstance: async (instanceId) => {
    const response = await api.post(`/instagram/instances/${instanceId}/disconnect`);
    return response.data;
  },

  /**
   * Eliminar instancia
   * @param {string} instanceId - ID de la instancia
   */
  deleteInstance: async (instanceId) => {
    const response = await api.delete(`/instagram/instances/${instanceId}`);
    return response.data;
  },

  /**
   * Generar URL de autorización OAuth
   * @param {string} appId - Facebook App ID
   * @param {string} redirectUri - URI de redirección
   * @param {string} scopes - Permisos solicitados
   */
  generateAuthUrl: (appId, redirectUri, scopes = 'user_profile,user_media') => {
    const baseUrl = 'https://api.instagram.com/oauth/authorize';
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: 'code'
    });
    return `${baseUrl}?${params.toString()}`;
  },

  /**
   * Activar/Desactivar instancia (pausar envíos)
   * @param {string} instanceId - ID de la instancia
   * @param {boolean} isActive - Estado activo/inactivo
   */
  toggleActive: async (instanceId, isActive) => {
    const response = await api.patch(`/instagram/instances/${instanceId}/toggle`, { isActive });
    return response.data;
  }
};

export default instagramAPI;
