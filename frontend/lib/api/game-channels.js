import api from './axios';

const gameChannelsAPI = {
  // Obtener canales de un juego
  getByGame: async (gameId) => {
    const response = await api.get(`/game-channels/games/${gameId}/channels`);
    return response.data;
  },

  // Obtener un canal específico
  getById: async (id) => {
    const response = await api.get(`/game-channels/channels/${id}`);
    return response.data;
  },

  // Crear canal para un juego
  create: async (gameId, data) => {
    const response = await api.post(`/game-channels/games/${gameId}/channels`, data);
    return response.data;
  },

  // Actualizar canal
  update: async (id, data) => {
    const response = await api.put(`/game-channels/channels/${id}`, data);
    return response.data;
  },

  // Eliminar canal
  delete: async (id) => {
    const response = await api.delete(`/game-channels/channels/${id}`);
    return response.data;
  },

  // Obtener variables disponibles para plantillas
  getTemplateVariables: async () => {
    const response = await api.get('/game-channels/templates/variables');
    return response.data;
  },

  // Obtener plantilla por defecto
  getDefaultTemplate: async (channelType) => {
    const response = await api.get(`/game-channels/templates/default/${channelType}`);
    return response.data;
  },

  // Previsualizar plantilla
  previewTemplate: async (template, gameId = null) => {
    const response = await api.post('/game-channels/templates/preview', {
      template,
      gameId
    });
    return response.data;
  },

  // Obtener instancias de WhatsApp disponibles
  getWhatsAppInstances: async () => {
    const response = await api.get('/game-channels/whatsapp/instances');
    return response.data;
  }
};

export default gameChannelsAPI;
