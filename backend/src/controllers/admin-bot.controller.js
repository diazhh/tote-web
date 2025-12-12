import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import adminTelegramBotService from '../services/admin-telegram-bot.service.js';

/**
 * Controlador para gestionar bots de administración de Telegram
 */
class AdminBotController {
  /**
   * GET /api/admin/bots
   * Listar todos los bots de administración
   */
  async listBots(req, res) {
    try {
      const bots = await prisma.adminTelegramBot.findMany({
        include: {
          gameAssignments: {
            include: {
              game: {
                select: { id: true, name: true, slug: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Ocultar tokens parcialmente
      const safeBots = bots.map(bot => ({
        ...bot,
        botToken: bot.botToken.substring(0, 10) + '...' + bot.botToken.substring(bot.botToken.length - 5)
      }));

      res.json({
        success: true,
        data: safeBots
      });
    } catch (error) {
      logger.error('Error listando bots:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/admin/bots/:id
   * Obtener un bot específico
   */
  async getBot(req, res) {
    try {
      const { id } = req.params;

      const bot = await prisma.adminTelegramBot.findUnique({
        where: { id },
        include: {
          gameAssignments: {
            include: {
              game: {
                select: { id: true, name: true, slug: true }
              }
            }
          }
        }
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Bot no encontrado'
        });
      }

      res.json({
        success: true,
        data: {
          ...bot,
          botToken: bot.botToken.substring(0, 10) + '...' + bot.botToken.substring(bot.botToken.length - 5)
        }
      });
    } catch (error) {
      logger.error('Error obteniendo bot:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/admin/bots
   * Crear un nuevo bot de administración
   */
  async createBot(req, res) {
    try {
      const { name, botToken } = req.body;

      if (!name || !botToken) {
        return res.status(400).json({
          success: false,
          error: 'Nombre y token del bot son requeridos'
        });
      }

      // Verificar que el token no exista
      const existing = await prisma.adminTelegramBot.findUnique({
        where: { botToken }
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Este bot ya está registrado'
        });
      }

      const bot = await adminTelegramBotService.createBot({ name, botToken });

      res.status(201).json({
        success: true,
        data: {
          ...bot,
          botToken: bot.botToken.substring(0, 10) + '...'
        },
        message: `Bot @${bot.botUsername} creado e iniciado correctamente`
      });
    } catch (error) {
      logger.error('Error creando bot:', error);
      
      // Error específico de token inválido
      if (error.message?.includes('ETELEGRAM') || error.message?.includes('401')) {
        return res.status(400).json({
          success: false,
          error: 'Token de bot inválido. Verifica el token con @BotFather'
        });
      }

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * PUT /api/admin/bots/:id
   * Actualizar un bot
   */
  async updateBot(req, res) {
    try {
      const { id } = req.params;
      const { name, isActive } = req.body;

      const bot = await prisma.adminTelegramBot.findUnique({
        where: { id }
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Bot no encontrado'
        });
      }

      const updatedBot = await prisma.adminTelegramBot.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(typeof isActive === 'boolean' && { isActive })
        }
      });

      // Si se desactivó, detener el bot
      if (isActive === false) {
        await adminTelegramBotService.stopBot(id);
      } else if (isActive === true && bot.isActive === false) {
        // Si se activó, iniciar el bot
        await adminTelegramBotService.startBot(updatedBot);
      }

      res.json({
        success: true,
        data: updatedBot,
        message: 'Bot actualizado correctamente'
      });
    } catch (error) {
      logger.error('Error actualizando bot:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * DELETE /api/admin/bots/:id
   * Eliminar un bot
   */
  async deleteBot(req, res) {
    try {
      const { id } = req.params;

      const bot = await prisma.adminTelegramBot.findUnique({
        where: { id }
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Bot no encontrado'
        });
      }

      await adminTelegramBotService.deleteBot(id);

      res.json({
        success: true,
        message: 'Bot eliminado correctamente'
      });
    } catch (error) {
      logger.error('Error eliminando bot:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/admin/bots/:id/games
   * Asignar juegos a un bot
   */
  async assignGames(req, res) {
    try {
      const { id } = req.params;
      const { gameIds } = req.body;

      if (!Array.isArray(gameIds)) {
        return res.status(400).json({
          success: false,
          error: 'gameIds debe ser un array'
        });
      }

      const bot = await prisma.adminTelegramBot.findUnique({
        where: { id }
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Bot no encontrado'
        });
      }

      // Eliminar asignaciones actuales
      await prisma.adminBotGame.deleteMany({
        where: { botId: id }
      });

      // Crear nuevas asignaciones
      if (gameIds.length > 0) {
        await prisma.adminBotGame.createMany({
          data: gameIds.map(gameId => ({
            botId: id,
            gameId
          }))
        });
      }

      // Obtener bot actualizado
      const updatedBot = await prisma.adminTelegramBot.findUnique({
        where: { id },
        include: {
          gameAssignments: {
            include: {
              game: {
                select: { id: true, name: true, slug: true }
              }
            }
          }
        }
      });

      res.json({
        success: true,
        data: updatedBot,
        message: `${gameIds.length} juego(s) asignado(s) al bot`
      });
    } catch (error) {
      logger.error('Error asignando juegos:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/admin/bots/:id/test
   * Enviar mensaje de prueba
   */
  async testBot(req, res) {
    try {
      const { id } = req.params;
      const { chatId, message } = req.body;

      if (!chatId) {
        return res.status(400).json({
          success: false,
          error: 'chatId es requerido'
        });
      }

      const bot = await prisma.adminTelegramBot.findUnique({
        where: { id }
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Bot no encontrado'
        });
      }

      const botInstance = adminTelegramBotService.bots.get(id);
      if (!botInstance) {
        return res.status(400).json({
          success: false,
          error: 'Bot no está corriendo'
        });
      }

      const testMessage = message || `
🧪 <b>Mensaje de prueba</b>

Este es un mensaje de prueba del bot de administración.

✅ El bot está funcionando correctamente.
      `.trim();

      await botInstance.sendMessage(chatId, testMessage, { parse_mode: 'HTML' });

      res.json({
        success: true,
        message: 'Mensaje de prueba enviado'
      });
    } catch (error) {
      logger.error('Error enviando mensaje de prueba:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/users/telegram/link-code
   * Generar código de vinculación para el usuario actual
   */
  async generateLinkCode(req, res) {
    try {
      const userId = req.user.id;

      const code = await adminTelegramBotService.generateLinkCode(userId);

      // Obtener bot activo para mostrar el username
      const activeBot = await prisma.adminTelegramBot.findFirst({
        where: { isActive: true, status: 'CONNECTED' }
      });

      res.json({
        success: true,
        data: {
          code,
          expiresIn: '10 minutos',
          botUsername: activeBot?.botUsername || null,
          instructions: activeBot 
            ? `Abre Telegram, busca @${activeBot.botUsername} y envía: /vincular ${code}`
            : 'No hay bot de administración configurado'
        }
      });
    } catch (error) {
      logger.error('Error generando código:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * DELETE /api/users/telegram/unlink
   * Desvincular Telegram del usuario actual
   */
  async unlinkTelegram(req, res) {
    try {
      const userId = req.user.id;

      await prisma.user.update({
        where: { id: userId },
        data: {
          telegramUserId: null,
          telegramChatId: null
        }
      });

      res.json({
        success: true,
        message: 'Telegram desvinculado correctamente'
      });
    } catch (error) {
      logger.error('Error desvinculando Telegram:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/users/telegram/status
   * Obtener estado de vinculación del usuario actual
   */
  async getTelegramStatus(req, res) {
    try {
      const userId = req.user.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          telegramUserId: true,
          telegramChatId: true,
          games: {
            include: {
              game: {
                select: { id: true, name: true, slug: true }
              }
            }
          }
        }
      });

      const isLinked = !!user.telegramChatId;

      // Obtener bot activo
      const activeBot = await prisma.adminTelegramBot.findFirst({
        where: { isActive: true, status: 'CONNECTED' }
      });

      res.json({
        success: true,
        data: {
          isLinked,
          telegramUserId: user.telegramUserId,
          games: user.games.map(ug => ({
            ...ug.game,
            notify: ug.notify
          })),
          botUsername: activeBot?.botUsername || null,
          botAvailable: !!activeBot
        }
      });
    } catch (error) {
      logger.error('Error obteniendo estado de Telegram:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * PUT /api/users/games/:gameId/notify
   * Activar/desactivar notificaciones para un juego
   */
  async toggleGameNotify(req, res) {
    try {
      const userId = req.user.id;
      const { gameId } = req.params;
      const { notify } = req.body;

      const userGame = await prisma.userGame.findUnique({
        where: {
          userId_gameId: { userId, gameId }
        }
      });

      if (!userGame) {
        return res.status(404).json({
          success: false,
          error: 'No tienes acceso a este juego'
        });
      }

      await prisma.userGame.update({
        where: { id: userGame.id },
        data: { notify: notify !== false }
      });

      res.json({
        success: true,
        message: notify !== false 
          ? 'Notificaciones activadas para este juego'
          : 'Notificaciones desactivadas para este juego'
      });
    } catch (error) {
      logger.error('Error actualizando notificaciones:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new AdminBotController();
