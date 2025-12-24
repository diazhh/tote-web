import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import messageTemplateService from '../services/message-template.service.js';
import whatsappService from '../services/whatsapp-baileys.service.js';
import channelConfigService from '../services/channel-config.service.js';

/**
 * Controlador para gestionar canales de publicación por juego
 */

/**
 * Obtener todos los canales de un juego
 */
export const getGameChannels = async (req, res) => {
  try {
    const { gameId } = req.params;

    const channels = await prisma.gameChannel.findMany({
      where: { gameId },
      orderBy: [
        { channelType: 'asc' },
        { name: 'asc' }
      ]
    });

    res.json({
      success: true,
      channels
    });
  } catch (error) {
    logger.error('Error al obtener canales del juego:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener canales del juego'
    });
  }
};

/**
 * Obtener un canal específico
 */
export const getGameChannel = async (req, res) => {
  try {
    const { id } = req.params;

    const channel = await prisma.gameChannel.findUnique({
      where: { id },
      include: {
        game: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true
          }
        }
      }
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Canal no encontrado'
      });
    }

    // Si es WhatsApp, obtener estado de la instancia
    if (channel.channelType === 'WHATSAPP' && channel.whatsappInstanceId) {
      try {
        const instanceStatus = await whatsappService.getInstanceStatus(channel.whatsappInstanceId);
        channel.whatsappStatus = instanceStatus;
      } catch (error) {
        logger.warn(`No se pudo obtener estado de instancia ${channel.whatsappInstanceId}:`, error);
        channel.whatsappStatus = { status: 'disconnected' };
      }
    }

    res.json({
      success: true,
      channel
    });
  } catch (error) {
    logger.error('Error al obtener canal:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener canal'
    });
  }
};

/**
 * Crear un nuevo canal para un juego
 */
export const createGameChannel = async (req, res) => {
  try {
    const { gameId } = req.params;
    const {
      channelType,
      name,
      whatsappInstanceId,
      telegramChatId,
      messageTemplate,
      recipients,
      isActive
    } = req.body;

    // Validar que el juego existe
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Juego no encontrado'
      });
    }

    // Validar plantilla si se proporciona
    if (messageTemplate) {
      const validation = messageTemplateService.validateTemplate(messageTemplate);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Plantilla de mensaje inválida',
          details: validation.error
        });
      }
    }

    // Validar instancia de WhatsApp si es necesario
    if (channelType === 'WHATSAPP' && whatsappInstanceId) {
      try {
        const instanceStatus = await whatsappService.getInstanceStatus(whatsappInstanceId);
        if (instanceStatus.status === 'disconnected') {
          logger.warn(`Instancia de WhatsApp ${whatsappInstanceId} está desconectada`);
        }
      } catch (error) {
        logger.warn(`No se pudo verificar instancia de WhatsApp ${whatsappInstanceId}:`, error);
      }
    }

    // Crear canal
    const channel = await prisma.gameChannel.create({
      data: {
        gameId,
        channelType,
        name,
        whatsappInstanceId,
        telegramChatId,
        messageTemplate: messageTemplate || messageTemplateService.getDefaultTemplate(channelType),
        recipients: recipients || [],
        isActive: isActive !== undefined ? isActive : true
      },
      include: {
        game: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    logger.info(`Canal creado: ${channel.name} (${channel.channelType}) para juego ${game.name}`);

    res.status(201).json({
      success: true,
      channel
    });
  } catch (error) {
    logger.error('Error al crear canal:', error);
    
    // Manejar error de duplicado
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        error: 'Ya existe un canal con ese nombre y tipo para este juego'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error al crear canal'
    });
  }
};

/**
 * Actualizar un canal
 */
export const updateGameChannel = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      whatsappInstanceId,
      telegramChatId,
      messageTemplate,
      recipients,
      isActive
    } = req.body;

    // Verificar que el canal existe
    const existingChannel = await prisma.gameChannel.findUnique({
      where: { id }
    });

    if (!existingChannel) {
      return res.status(404).json({
        success: false,
        error: 'Canal no encontrado'
      });
    }

    // Validar plantilla si se proporciona
    if (messageTemplate) {
      const validation = messageTemplateService.validateTemplate(messageTemplate);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Plantilla de mensaje inválida',
          details: validation.error
        });
      }
    }

    // Actualizar canal
    const channel = await prisma.gameChannel.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(whatsappInstanceId !== undefined && { whatsappInstanceId }),
        ...(telegramChatId !== undefined && { telegramChatId }),
        ...(messageTemplate && { messageTemplate }),
        ...(recipients && { recipients }),
        ...(isActive !== undefined && { isActive })
      },
      include: {
        game: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    logger.info(`Canal actualizado: ${channel.name} (${channel.id})`);

    res.json({
      success: true,
      channel
    });
  } catch (error) {
    logger.error('Error al actualizar canal:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar canal'
    });
  }
};

/**
 * Eliminar un canal
 */
export const deleteGameChannel = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el canal existe
    const channel = await prisma.gameChannel.findUnique({
      where: { id }
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Canal no encontrado'
      });
    }

    // Eliminar canal
    await prisma.gameChannel.delete({
      where: { id }
    });

    logger.info(`Canal eliminado: ${channel.name} (${channel.id})`);

    res.json({
      success: true,
      message: 'Canal eliminado exitosamente'
    });
  } catch (error) {
    logger.error('Error al eliminar canal:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar canal'
    });
  }
};

/**
 * Obtener plantilla por defecto para un tipo de canal
 */
export const getDefaultTemplate = async (req, res) => {
  try {
    const { channelType } = req.params;

    const template = messageTemplateService.getDefaultTemplate(channelType);

    res.json({
      success: true,
      template,
      channelType
    });
  } catch (error) {
    logger.error('Error al obtener plantilla por defecto:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener plantilla por defecto'
    });
  }
};

/**
 * Obtener variables disponibles para plantillas
 */
export const getTemplateVariables = async (req, res) => {
  try {
    const variables = messageTemplateService.getAvailableVariables();

    res.json({
      success: true,
      variables
    });
  } catch (error) {
    logger.error('Error al obtener variables de plantilla:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener variables de plantilla'
    });
  }
};

/**
 * Previsualizar mensaje con plantilla
 */
export const previewTemplate = async (req, res) => {
  try {
    const { template, gameId } = req.body;

    if (!template) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere una plantilla'
      });
    }

    // Validar plantilla
    const validation = messageTemplateService.validateTemplate(template);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Plantilla inválida',
        details: validation.error
      });
    }

    // Obtener juego si se proporciona
    let game = null;
    if (gameId) {
      game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          items: {
            take: 1,
            orderBy: { displayOrder: 'asc' }
          }
        }
      });
    }

    // Crear datos de prueba
    const testDraw = {
      id: 'preview-id',
      scheduledAt: new Date().toISOString(),
      status: 'DRAWN',
      game: game || {
        name: 'LOTOANIMALITO',
        slug: 'lotoanimalito',
        type: 'ANIMALITOS'
      },
      winnerItem: game?.items[0] || {
        number: '01',
        name: 'CARNERO'
      },
      imageUrl: 'https://example.com/image.jpg'
    };

    // Renderizar plantilla
    const preview = messageTemplateService.renderDrawMessage(template, testDraw);

    res.json({
      success: true,
      preview,
      testData: messageTemplateService.prepareDrawData(testDraw)
    });
  } catch (error) {
    logger.error('Error al previsualizar plantilla:', error);
    res.status(500).json({
      success: false,
      error: 'Error al previsualizar plantilla',
      details: error.message
    });
  }
};

/**
 * Listar instancias de WhatsApp disponibles
 */
export const getWhatsAppInstances = async (req, res) => {
  try {
    const instances = await whatsappService.listInstances();

    res.json({
      success: true,
      instances
    });
  } catch (error) {
    logger.error('Error al obtener instancias de WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener instancias de WhatsApp'
    });
  }
};

/**
 * Enviar mensaje de prueba a un canal
 */
export const sendTestMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { recipient, message } = req.body;

    if (!recipient) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un destinatario para la prueba'
      });
    }

    const result = await channelConfigService.sendTestMessage(id, {
      recipient,
      message: message || 'Mensaje de prueba del sistema - Tote Web'
    });

    if (result.success) {
      logger.info(`Prueba de canal ${id} enviada exitosamente a ${recipient}`);
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error al enviar mensaje de prueba:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al enviar mensaje de prueba'
    });
  }
};

/**
 * Activar o desactivar un canal
 */
export const toggleChannelActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el campo isActive (boolean)'
      });
    }

    const result = await channelConfigService.toggleChannelStatus(id, isActive);

    logger.info(`Canal ${id} ${isActive ? 'activado' : 'desactivado'}`);
    res.json(result);
  } catch (error) {
    logger.error('Error al cambiar estado del canal:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al cambiar estado del canal'
    });
  }
};
