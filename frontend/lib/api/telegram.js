import api from './axios';

const telegramAPI = {
  /**
   * Crear una nueva instancia de Telegram
   * @param {Object} data - Datos para crear la instancia
   * @param {string} data.instanceId - ID único para la instancia
   * @param {string} data.name - Nombre descriptivo de la instancia
   * @param {string} data.botToken - Token del bot de Telegram
   * @param {string} data.chatId - ID del chat/canal (opcional)
   * @param {string} data.webhookUrl - URL del webhook (opcional)
   */
  createInstance: async (data) => {
    const response = await api.post('/telegram/instances', {
      instanceId: data.instanceId,
      name: data.name,
      botToken: data.botToken,
      chatId: data.chatId,
      webhookUrl: data.webhookUrl
    });
    return response.data;
  },

  /**
   * Obtener todas las instancias de Telegram
   */
  listInstances: async () => {
    const response = await api.get('/telegram/instances');
    return response.data;
  },

  /**
   * Obtener instancia específica
   * @param {string} instanceId - ID de la instancia
   */
  getInstance: async (instanceId) => {
    const response = await api.get(`/telegram/instances/${instanceId}`);
    return response.data;
  },

  /**
   * Enviar mensaje
   * @param {string} instanceId - ID de la instancia
   * @param {string} chatId - ID del chat
   * @param {string} message - Mensaje a enviar
   * @param {Object} options - Opciones adicionales
   */
  sendMessage: async (instanceId, chatId, message, options = {}) => {
    const response = await api.post(`/telegram/instances/${instanceId}/send-message`, {
      chatId,
      message,
      options
    });
    return response.data;
  },

  /**
   * Enviar foto
   * @param {string} instanceId - ID de la instancia
   * @param {string} chatId - ID del chat
   * @param {string} photo - URL o file_id de la foto
   * @param {string} caption - Descripción de la foto
   * @param {Object} options - Opciones adicionales
   */
  sendPhoto: async (instanceId, chatId, photo, caption = '', options = {}) => {
    const response = await api.post(`/telegram/instances/${instanceId}/send-photo`, {
      chatId,
      photo,
      caption,
      options
    });
    return response.data;
  },

  /**
   * Obtener información del chat
   * @param {string} instanceId - ID de la instancia
   * @param {string} chatId - ID del chat
   */
  getChatInfo: async (instanceId, chatId) => {
    const response = await api.get(`/telegram/instances/${instanceId}/chat/${chatId}`);
    return response.data;
  },

  /**
   * Configurar webhook
   * @param {string} instanceId - ID de la instancia
   * @param {string} webhookUrl - URL del webhook
   */
  setupWebhook: async (instanceId, webhookUrl) => {
    const response = await api.post(`/telegram/instances/${instanceId}/webhook`, {
      webhookUrl
    });
    return response.data;
  },

  /**
   * Probar conexión
   * @param {string} instanceId - ID de la instancia
   */
  testConnection: async (instanceId) => {
    const response = await api.post(`/telegram/instances/${instanceId}/test`);
    return response.data;
  },

  /**
   * Desconectar instancia
   * @param {string} instanceId - ID de la instancia
   */
  disconnectInstance: async (instanceId) => {
    const response = await api.post(`/telegram/instances/${instanceId}/disconnect`);
    return response.data;
  },

  /**
   * Eliminar instancia
   * @param {string} instanceId - ID de la instancia
   */
  deleteInstance: async (instanceId) => {
    const response = await api.delete(`/telegram/instances/${instanceId}`);
    return response.data;
  }
};

export default telegramAPI;
