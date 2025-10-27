import api from './axios';

const facebookAPI = {
  /**
   * Crear una nueva instancia de Facebook
   * @param {Object} data - Datos para crear la instancia
   * @param {string} data.instanceId - ID único para la instancia
   * @param {string} data.name - Nombre descriptivo de la instancia
   * @param {string} data.pageAccessToken - Page Access Token
   * @param {string} data.appSecret - App Secret
   * @param {string} data.webhookToken - Token de verificación del webhook
   * @param {string} data.pageId - ID de la página de Facebook
   */
  createInstance: async (data) => {
    const response = await api.post('/api/facebook/instances', {
      instanceId: data.instanceId,
      name: data.name,
      pageAccessToken: data.pageAccessToken,
      appSecret: data.appSecret,
      webhookToken: data.webhookToken,
      pageId: data.pageId
    });
    return response.data;
  },

  /**
   * Obtener todas las instancias de Facebook
   */
  listInstances: async () => {
    const response = await api.get('/api/facebook/instances');
    return response.data;
  },

  /**
   * Obtener instancia específica
   * @param {string} instanceId - ID de la instancia
   */
  getInstance: async (instanceId) => {
    const response = await api.get(`/api/facebook/instances/${instanceId}`);
    return response.data;
  },

  /**
   * Enviar mensaje
   * @param {string} instanceId - ID de la instancia
   * @param {string} recipientId - ID del destinatario
   * @param {string} message - Mensaje a enviar
   * @param {Object} options - Opciones adicionales
   */
  sendMessage: async (instanceId, recipientId, message, options = {}) => {
    const response = await api.post(`/api/facebook/instances/${instanceId}/send-message`, {
      recipientId,
      message,
      options
    });
    return response.data;
  },

  /**
   * Enviar imagen
   * @param {string} instanceId - ID de la instancia
   * @param {string} recipientId - ID del destinatario
   * @param {string} imageUrl - URL de la imagen
   * @param {Object} options - Opciones adicionales
   */
  sendImage: async (instanceId, recipientId, imageUrl, options = {}) => {
    const response = await api.post(`/api/facebook/instances/${instanceId}/send-image`, {
      recipientId,
      imageUrl,
      options
    });
    return response.data;
  },

  /**
   * Obtener información del usuario
   * @param {string} instanceId - ID de la instancia
   * @param {string} userId - ID del usuario
   */
  getUserInfo: async (instanceId, userId) => {
    const response = await api.get(`/api/facebook/instances/${instanceId}/user/${userId}`);
    return response.data;
  },

  /**
   * Configurar webhook
   * @param {string} instanceId - ID de la instancia
   * @param {string} webhookUrl - URL del webhook
   */
  setupWebhook: async (instanceId, webhookUrl) => {
    const response = await api.post(`/api/facebook/instances/${instanceId}/webhook`, {
      webhookUrl
    });
    return response.data;
  },

  /**
   * Probar conexión
   * @param {string} instanceId - ID de la instancia
   */
  testConnection: async (instanceId) => {
    const response = await api.post(`/api/facebook/instances/${instanceId}/test`);
    return response.data;
  },

  /**
   * Desconectar instancia
   * @param {string} instanceId - ID de la instancia
   */
  disconnectInstance: async (instanceId) => {
    const response = await api.post(`/api/facebook/instances/${instanceId}/disconnect`);
    return response.data;
  },

  /**
   * Eliminar instancia
   * @param {string} instanceId - ID de la instancia
   */
  deleteInstance: async (instanceId) => {
    const response = await api.delete(`/api/facebook/instances/${instanceId}`);
    return response.data;
  }
};

export default facebookAPI;
