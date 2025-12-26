import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import testImageGenerator from './test-image-generator.service.js';
import whatsappService from './whatsapp-baileys.service.js';
import telegramService from './telegram.service.js';
import facebookService from './facebook.service.js';
import instagramService from './instagram.service.js';

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
        game: true
      }
    });

    if (!channel) {
      throw new Error('Canal no encontrado');
    }

    // Obtener las instancias si existen
    let whatsappInstance = null;
    let telegramInstance = null;
    let facebookInstance = null;
    let instagramInstance = null;

    if (channel.whatsappInstanceId) {
      whatsappInstance = await prisma.whatsAppInstance.findUnique({
        where: { instanceId: channel.whatsappInstanceId }
      });
    }

    if (channel.telegramInstanceId) {
      telegramInstance = await prisma.telegramInstance.findUnique({
        where: { id: channel.telegramInstanceId }
      });
    }

    if (channel.facebookInstanceId) {
      facebookInstance = await prisma.facebookInstance.findUnique({
        where: { id: channel.facebookInstanceId }
      });
    }

    if (channel.instagramInstanceId) {
      instagramInstance = await prisma.instagramInstance.findUnique({
        where: { id: channel.instagramInstanceId }
      });
    }

    // Generar imagen de prueba
    const testImage = await testImageGenerator.generateTestImage();
    const testMessage = testConfig.message || 'Mensaje de prueba del sistema';

    let result;

    try {
      switch (channel.channelType) {
        case 'WHATSAPP':
          result = await this._testWhatsApp(
            whatsappInstance,
            testConfig.recipient,
            testImage,
            testMessage
          );
          break;

        case 'TELEGRAM':
          result = await this._testTelegram(
            telegramInstance,
            testConfig.recipient,
            testImage,
            testMessage
          );
          break;

        case 'FACEBOOK':
          result = await this._testFacebook(
            facebookInstance,
            testImage,
            testMessage
          );
          break;

        case 'INSTAGRAM':
          result = await this._testInstagram(
            instagramInstance,
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
    if (!instance) {
      throw new Error('Instancia de WhatsApp no encontrada');
    }

    // Validar formato de número
    const cleanNumber = recipient.replace(/[^\d]/g, '');
    if (cleanNumber.length < 10) {
      throw new Error('Número de teléfono inválido');
    }

    // Enviar mensaje de prueba usando el método del servicio (igual que en /api/whatsapp/instances/:id/test)
    await whatsappService.sendTestMessage(instance.instanceId, cleanNumber, message);

    return { platform: 'WhatsApp', recipient: cleanNumber };
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
