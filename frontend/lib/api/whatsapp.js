import api from './axios';

const whatsappAPI = {
  /**
   * Crear una instancia de WhatsApp y su canal asociado
   * @param {Object} data - Datos para crear la instancia
   * @param {string} data.instanceId - ID único para la instancia
   * @param {string} data.name - Nombre descriptivo de la instancia
   * @param {string[]} data.recipients - Lista de destinatarios
   */
  createWhatsAppInstance: async (data) => {
    // Crear instancia y canal en una sola llamada
    const response = await api.post('/whatsapp/instances', {
      instanceId: data.instanceId,
      name: data.name,
      channelData: {
        name: data.name,
        recipients: data.recipients
      }
    });
    
    return response.data;
  },
  /**
   * Inicializar una nueva instancia de WhatsApp
   * @param {string} instanceId - ID único para la instancia
   * @param {string} name - Nombre descriptivo de la instancia
   * @param {string} channelConfigId - ID de la configuración del canal (opcional)
   */
  initializeInstance: async (instanceId, name = null, channelConfigId = null) => {
    const response = await api.post('/whatsapp/instances', {
      instanceId,
      name,
      channelConfigId
    });
    return response.data;
  },

  /**
   * Obtener todas las instancias de WhatsApp
   */
  listInstances: async () => {
    const response = await api.get('/whatsapp/instances');
    return response.data;
  },

  /**
   * Obtener código QR para una instancia
   * @param {string} instanceId - ID de la instancia
   */
  getQRCode: async (instanceId) => {
    const response = await api.get(`/whatsapp/instances/${instanceId}/qr`);
    return response.data;
  },

  /**
   * Obtener estado de una instancia
   * @param {string} instanceId - ID de la instancia
   */
  getInstanceStatus: async (instanceId) => {
    const response = await api.get(`/whatsapp/instances/${instanceId}/status`);
    return response.data;
  },

  /**
   * Reinicializar una instancia (generar nuevo QR)
   * @param {string} instanceId - ID de la instancia
   */
  reinitializeInstance: async (instanceId) => {
    const response = await api.post(`/whatsapp/instances/${instanceId}/reinitialize`);
    return response.data;
  },

  /**
   * Reconectar una instancia
   * @param {string} instanceId - ID de la instancia
   */
  reconnectInstance: async (instanceId) => {
    const response = await api.post(`/whatsapp/instances/${instanceId}/reconnect`);
    return response.data;
  },

  /**
   * Desconectar una instancia
   * @param {string} instanceId - ID de la instancia
   */
  disconnectInstance: async (instanceId) => {
    const response = await api.post(`/whatsapp/instances/${instanceId}/disconnect`);
    return response.data;
  },

  /**
   * Eliminar una instancia y sus datos
   * @param {string} instanceId - ID de la instancia
   */
  deleteInstance: async (instanceId) => {
    const response = await api.delete(`/whatsapp/instances/${instanceId}`);
    return response.data;
  },

  /**
   * Enviar mensaje de prueba
   * @param {string} instanceId - ID de la instancia
   * @param {string} phoneNumber - Número de teléfono con código de país
   * @param {string} message - Mensaje a enviar
   */
  sendTestMessage: async (instanceId, phoneNumber, message) => {
    const response = await api.post(`/whatsapp/instances/${instanceId}/test`, {
      phoneNumber,
      message
    });
    return response.data;
  },

  /**
   * Verificar si un número existe en WhatsApp
   * @param {string} instanceId - ID de la instancia
   * @param {string} phoneNumber - Número de teléfono con código de país
   */
  checkNumber: async (instanceId, phoneNumber) => {
    const response = await api.post(`/whatsapp/instances/${instanceId}/check-number`, {
      phoneNumber
    });
    return response.data;
  },

  /**
   * Limpiar sesiones inactivas
   */
  cleanupSessions: async () => {
    const response = await api.post('/whatsapp/cleanup');
    return response.data;
  },

  /**
   * Activar/Desactivar instancia (pausar envíos)
   * @param {string} instanceId - ID de la instancia
   * @param {boolean} isActive - Estado activo/inactivo
   */
  toggleActive: async (instanceId, isActive) => {
    const response = await api.patch(`/whatsapp/instances/${instanceId}/toggle`, { isActive });
    return response.data;
  }
};

export default whatsappAPI;
