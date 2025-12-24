const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const testImageGenerator = require('./test-image-generator.service');
const whatsappService = require('./whatsapp-baileys.service');
const telegramService = require('./telegram.service');
const facebookService = require('./facebook.service');
const instagramService = require('./instagram.service');

class ChannelConfigService {
  /**
   * Activa o desactiva un canal
   * @param {string} channelId - ID del GameChannel
   * @param {boolean} isActive - Estado deseado
   */
  async toggleChannelStatus(channelId, isActive) {
    const channel = await prisma.gameChannel.findUnique({
      where: { id: channelId }
    });

    if (!channel) {
      throw new Error('Canal no encontrado');
    }

    const updated = await prisma.gameChannel.update({
      where: { id: channelId },
      data: { isActive }
    });

    return {
      success: true,
      channel: updated,
      message: `Canal ${isActive ? 'activado' : 'desactivado'} exitosamente`
    };
  }

  /**
   * Envía un mensaje de prueba a un canal
   * @param {string} channelId - ID del GameChannel
   * @param {object} testConfig - Configuración de prueba
   * @param {string} testConfig.recipient - Destinatario de prueba
   * @param {string} testConfig.message - Mensaje opcional
   */
  async sendTestMessage(channelId, testConfig) {
    const channel = await prisma.gameChannel.findUnique({
      where: { id: channelId },
      include: {
        whatsappInstance: true,
        telegramInstance: true,
        facebookInstance: true,
        instagramInstance: true
      }
    });

    if (!channel) {
      throw new Error('Canal no encontrado');
    }

    // Generar imagen de prueba
    const testImage = await testImageGenerator.generateTestImage();
    const testMessage = testConfig.message || 'Mensaje de prueba del sistema';

    let result;

    try {
      switch (channel.channelType) {
        case 'WHATSAPP':
          result = await this._testWhatsApp(
            channel.whatsappInstance,
            testConfig.recipient,
            testImage,
            testMessage
          );
          break;

        case 'TELEGRAM':
          result = await this._testTelegram(
            channel.telegramInstance,
            testConfig.recipient,
            testImage,
            testMessage
          );
          break;

        case 'FACEBOOK':
          result = await this._testFacebook(
            channel.facebookInstance,
            testImage,
            testMessage
          );
          break;

        case 'INSTAGRAM':
          result = await this._testInstagram(
            channel.instagramInstance,
            testImage,
            testMessage
          );
          break;

        default:
          throw new Error(`Tipo de canal no soportado: ${channel.channelType}`);
      }

      return {
        success: true,
        result,
        message: 'Mensaje de prueba enviado exitosamente'
      };
    } catch (error) {
      console.error('Error enviando mensaje de prueba:', error);
      return {
        success: false,
        error: error.message,
        message: 'Error al enviar mensaje de prueba'
      };
    }
  }

  async _testWhatsApp(instance, recipient, imageBuffer, message) {
    if (!instance || instance.status !== 'CONNECTED') {
      throw new Error('Instancia de WhatsApp no conectada');
    }

    // Validar formato de número
    const cleanNumber = recipient.replace(/[^\d]/g, '');
    if (cleanNumber.length < 10) {
      throw new Error('Número de teléfono inválido');
    }

    const jid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;

    await whatsappService.sendMessage(instance.instanceId, jid, message);
    await whatsappService.sendImage(instance.instanceId, jid, imageBuffer, message);

    return { platform: 'WhatsApp', recipient: jid };
  }

  async _testTelegram(instance, chatId, imageBuffer, message) {
    if (!instance) {
      throw new Error('Instancia de Telegram no configurada');
    }

    // Validar chatId
    if (!chatId || (!chatId.startsWith('-') && !chatId.startsWith('@') && isNaN(chatId))) {
      throw new Error('ChatId inválido. Debe ser un ID numérico, empezar con - o @username');
    }

    await telegramService.sendPhoto(
      instance.botToken,
      chatId,
      imageBuffer,
      { caption: message }
    );

    return { platform: 'Telegram', chatId };
  }

  async _testFacebook(instance, imageBuffer, message) {
    if (!instance) {
      throw new Error('Instancia de Facebook no configurada');
    }

    const result = await facebookService.publishPhoto(
      instance.pageId,
      instance.pageAccessToken,
      imageBuffer,
      message
    );

    return { platform: 'Facebook', postId: result.id };
  }

  async _testInstagram(instance, imageBuffer, message) {
    if (!instance) {
      throw new Error('Instancia de Instagram no configurada');
    }

    // Verificar que el token no esté expirado
    if (instance.tokenExpiresAt && new Date(instance.tokenExpiresAt) < new Date()) {
      throw new Error('Token de Instagram expirado. Por favor, renueva el token.');
    }

    const result = await instagramService.publishPhoto(
      instance.userId,
      instance.accessToken,
      imageBuffer,
      message
    );

    return { platform: 'Instagram', mediaId: result.id };
  }
}

export default new ChannelConfigService();
