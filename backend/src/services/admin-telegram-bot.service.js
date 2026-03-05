import TelegramBot from 'node-telegram-bot-api';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Servicio para gestionar bots de Telegram de administración
 * Maneja la vinculación de usuarios y envío de notificaciones
 */
class AdminTelegramBotService {
  constructor() {
    this.bots = new Map(); // Map de botId -> TelegramBot instance
  }

  /**
   * Inicializar todos los bots activos
   */
  async initialize() {
    try {
      const activeBots = await prisma.adminTelegramBot.findMany({
        where: { isActive: true }
      });

      for (const bot of activeBots) {
        await this.startBot(bot);
      }

      logger.info(`✅ ${activeBots.length} bot(s) de administración iniciados`);
    } catch (error) {
      logger.error('Error inicializando bots de administración:', error);
    }
  }

  /**
   * Iniciar un bot específico
   * @param {object} botConfig - Configuración del bot desde la BD
   */
  async startBot(botConfig) {
    try {
      if (this.bots.has(botConfig.id)) {
        logger.info(`Bot ${botConfig.name} ya está corriendo`);
        return;
      }

      const bot = new TelegramBot(botConfig.botToken, { polling: true });

      // Obtener info del bot
      const botInfo = await bot.getMe();
      
      // Actualizar username en BD si cambió
      if (botInfo.username !== botConfig.botUsername) {
        await prisma.adminTelegramBot.update({
          where: { id: botConfig.id },
          data: { 
            botUsername: botInfo.username,
            status: 'CONNECTED'
          }
        });
      } else {
        await prisma.adminTelegramBot.update({
          where: { id: botConfig.id },
          data: { status: 'CONNECTED' }
        });
      }

      // Configurar handlers
      this.setupHandlers(bot, botConfig.id);

      this.bots.set(botConfig.id, bot);
      logger.info(`✅ Bot @${botInfo.username} (${botConfig.name}) iniciado`);

      return bot;
    } catch (error) {
      logger.error(`Error iniciando bot ${botConfig.name}:`, error);
      
      await prisma.adminTelegramBot.update({
        where: { id: botConfig.id },
        data: { status: 'ERROR' }
      });
      
      throw error;
    }
  }

  /**
   * Detener un bot específico
   * @param {string} botId - ID del bot
   */
  async stopBot(botId) {
    const bot = this.bots.get(botId);
    if (bot) {
      await bot.stopPolling();
      this.bots.delete(botId);
      
      await prisma.adminTelegramBot.update({
        where: { id: botId },
        data: { status: 'DISCONNECTED' }
      });
      
      logger.info(`Bot ${botId} detenido`);
    }
  }

  /**
   * Configurar handlers del bot
   * @param {TelegramBot} bot - Instancia del bot
   * @param {string} botId - ID del bot en la BD
   */
  setupHandlers(bot, botId) {
    // Comando /start
    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const welcomeMessage = `
🎰 <b>Bot de Administración - Tote</b>

Bienvenido al sistema de notificaciones para administradores.

<b>Comandos disponibles:</b>
/vincular <code>CODIGO</code> - Vincular tu cuenta con un código
/estado - Ver estado de tu vinculación
/desvincular - Desvincular tu cuenta

Para vincular tu cuenta:
1. Ve al panel de administración
2. En tu perfil, genera un código de vinculación
3. Usa el comando /vincular seguido del código

Ejemplo: <code>/vincular 123456</code>
      `.trim();

      await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'HTML' });
    });

    // Comando /vincular
    bot.onText(/\/vincular(?:\s+(\d{6}))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const telegramUserId = msg.from.id.toString();
      const code = match[1];

      if (!code) {
        await bot.sendMessage(chatId, 
          '⚠️ Debes proporcionar el código de 6 dígitos.\n\nEjemplo: <code>/vincular 123456</code>', 
          { parse_mode: 'HTML' }
        );
        return;
      }

      try {
        // Buscar código válido
        const linkCode = await prisma.telegramLinkCode.findUnique({
          where: { code },
          include: { user: true }
        });

        if (!linkCode) {
          await bot.sendMessage(chatId, '❌ Código inválido o no encontrado.');
          return;
        }

        if (new Date() > linkCode.expiresAt) {
          await bot.sendMessage(chatId, '❌ El código ha expirado. Genera uno nuevo desde el panel.');
          // Eliminar código expirado
          await prisma.telegramLinkCode.delete({ where: { id: linkCode.id } });
          return;
        }

        // Verificar si el usuario de Telegram ya está vinculado a otra cuenta
        const existingUser = await prisma.user.findFirst({
          where: { 
            telegramUserId,
            id: { not: linkCode.userId }
          }
        });

        if (existingUser) {
          await bot.sendMessage(chatId, 
            '⚠️ Esta cuenta de Telegram ya está vinculada a otro usuario del sistema.'
          );
          return;
        }

        // Vincular usuario
        await prisma.user.update({
          where: { id: linkCode.userId },
          data: {
            telegramUserId,
            telegramChatId: chatId.toString()
          }
        });

        // Eliminar código usado
        await prisma.telegramLinkCode.delete({ where: { id: linkCode.id } });

        // Obtener juegos del usuario
        const userGames = await prisma.userGame.findMany({
          where: { userId: linkCode.userId },
          include: { game: true }
        });

        const gamesText = userGames.length > 0
          ? userGames.map(ug => `• ${ug.game.name}`).join('\n')
          : 'Ninguno asignado';

        await bot.sendMessage(chatId, `
✅ <b>¡Cuenta vinculada exitosamente!</b>

👤 Usuario: <b>${linkCode.user.username}</b>
📧 Email: ${linkCode.user.email}

🎮 <b>Juegos asignados:</b>
${gamesText}

Ahora recibirás notificaciones de los sorteos de tus juegos asignados.
        `.trim(), { parse_mode: 'HTML' });

        logger.info(`Usuario ${linkCode.user.username} vinculó su Telegram (${telegramUserId})`);

      } catch (error) {
        logger.error('Error en vinculación:', error);
        await bot.sendMessage(chatId, '❌ Error al vincular. Intenta de nuevo.');
      }
    });

    // Comando /estado
    bot.onText(/\/estado/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramUserId = msg.from.id.toString();

      try {
        const user = await prisma.user.findFirst({
          where: { telegramUserId },
          include: {
            games: {
              include: { game: true }
            }
          }
        });

        if (!user) {
          await bot.sendMessage(chatId, 
            '⚠️ Tu cuenta de Telegram no está vinculada a ningún usuario del sistema.\n\nUsa /vincular <código> para vincular tu cuenta.'
          );
          return;
        }

        const gamesText = user.games.length > 0
          ? user.games.map(ug => {
              const notifyIcon = ug.notify ? '🔔' : '🔕';
              return `${notifyIcon} ${ug.game.name}`;
            }).join('\n')
          : 'Ninguno asignado';

        await bot.sendMessage(chatId, `
📊 <b>Estado de tu cuenta</b>

👤 Usuario: <b>${user.username}</b>
📧 Email: ${user.email}
🔗 Estado: <b>Vinculado</b>

🎮 <b>Juegos asignados:</b>
${gamesText}

🔔 = Notificaciones activas
🔕 = Notificaciones desactivadas
        `.trim(), { parse_mode: 'HTML' });

      } catch (error) {
        logger.error('Error en /estado:', error);
        await bot.sendMessage(chatId, '❌ Error al obtener estado.');
      }
    });

    // Comando /desvincular
    bot.onText(/\/desvincular/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramUserId = msg.from.id.toString();

      try {
        const user = await prisma.user.findFirst({
          where: { telegramUserId }
        });

        if (!user) {
          await bot.sendMessage(chatId, '⚠️ Tu cuenta no está vinculada.');
          return;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            telegramUserId: null,
            telegramChatId: null
          }
        });

        await bot.sendMessage(chatId, `
✅ <b>Cuenta desvinculada</b>

Tu cuenta de Telegram ha sido desvinculada del usuario <b>${user.username}</b>.

Ya no recibirás notificaciones de sorteos.

Para volver a vincular, genera un nuevo código desde el panel de administración.
        `.trim(), { parse_mode: 'HTML' });

        logger.info(`Usuario ${user.username} desvinculó su Telegram`);

      } catch (error) {
        logger.error('Error en /desvincular:', error);
        await bot.sendMessage(chatId, '❌ Error al desvincular.');
      }
    });

    // ============================================
    // COMANDOS DE CAMBIO DE RESULTADO
    // ============================================

    // Comando 'cambiar XX' para LOTTOPANTERA
    bot.onText(/^cambiar\s+(\d{1,2})$/i, async (msg, match) => {
      // Special case: '0' = DELFIN, '00' = BALLENA
      const number = match[1] === '0' ? '0' : match[1].padStart(2, '0');
      await this.handleChangeResult(bot, msg, 'lottopantera', number);
    });

    // Comando 'triple XXX' para TRIPLE PANTERA
    bot.onText(/^triple\s+(\d{1,3})$/i, async (msg, match) => {
      await this.handleChangeResult(bot, msg, 'triple-pantera', match[1].padStart(3, '0'));
    });

    // Comando 'panda XX' para LOTOANIMALITO
    bot.onText(/^panda\s+(\d{1,2})$/i, async (msg, match) => {
      // Special case: '0' = DELFIN, '00' = BALLENA
      const number = match[1] === '0' ? '0' : match[1].padStart(2, '0');
      await this.handleChangeResult(bot, msg, 'lotoanimalito', number);
    });

    // Comando /ayuda para mostrar comandos de cambio
    bot.onText(/\/ayuda|\/help/i, async (msg) => {
      const chatId = msg.chat.id;
      const telegramUserId = msg.from.id.toString();

      // Verificar si está vinculado
      const user = await prisma.user.findFirst({
        where: { telegramUserId },
        include: { games: { include: { game: true } } }
      });

      if (!user) {
        await bot.sendMessage(chatId, '⚠️ Debes vincular tu cuenta primero con /vincular');
        return;
      }

      const helpMessage = `
🎰 <b>Comandos de Cambio de Resultado</b>

Para pre-seleccionar el ganador del próximo sorteo:

<b>LOTTOPANTERA:</b>
<code>cambiar 05</code> - Pre-selecciona el número 05

<b>TRIPLE PANTERA:</b>
<code>triple 123</code> - Pre-selecciona el número 123

<b>LOTOANIMALITO:</b>
<code>panda 15</code> - Pre-selecciona el número 15

⚠️ <i>Solo puedes cambiar resultados de juegos a los que tienes acceso.</i>
⚠️ <i>El cambio se aplica al próximo sorteo programado.</i>

<b>Otros comandos:</b>
/estado - Ver tu estado de vinculación
/desvincular - Desvincular tu cuenta
      `.trim();

      await bot.sendMessage(chatId, helpMessage, { parse_mode: 'HTML' });
    });

    // Manejar errores de polling
    bot.on('polling_error', (error) => {
      logger.error(`Error de polling en bot ${botId}:`, error.message);
    });
  }

  /**
   * Manejar solicitud de cambio de resultado
   * @param {TelegramBot} bot - Instancia del bot
   * @param {object} msg - Mensaje de Telegram
   * @param {string} gameSlug - Slug del juego
   * @param {string} number - Número a pre-seleccionar
   */
  async handleChangeResult(bot, msg, gameSlug, number) {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();

    try {
      // Verificar que el usuario está vinculado
      const user = await prisma.user.findFirst({
        where: { telegramUserId },
        include: {
          games: {
            include: { game: true }
          }
        }
      });

      if (!user) {
        await bot.sendMessage(chatId, '⚠️ Tu cuenta no está vinculada. Usa /vincular primero.');
        return;
      }

      // Buscar el juego
      const game = await prisma.game.findFirst({
        where: { slug: gameSlug, isActive: true }
      });

      if (!game) {
        await bot.sendMessage(chatId, `❌ Juego no encontrado: ${gameSlug}`);
        return;
      }

      // Verificar que el usuario tiene acceso al juego
      const hasAccess = user.games.some(ug => ug.gameId === game.id);
      if (!hasAccess && user.role !== 'ADMIN') {
        await bot.sendMessage(chatId, `❌ No tienes acceso al juego ${game.name}`);
        return;
      }

      // Buscar el item (número) en el juego
      const gameItem = await prisma.gameItem.findFirst({
        where: {
          gameId: game.id,
          number: number,
          isActive: true
        }
      });

      if (!gameItem) {
        await bot.sendMessage(chatId, `❌ Número ${number} no válido para ${game.name}`);
        return;
      }

      // Buscar el próximo sorteo pendiente (SCHEDULED o CLOSED)
      // Usar drawDate y drawTime con hora de Venezuela
      const now = new Date();
      const venezuelaDateStr = now.toLocaleDateString('en-CA', {
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const venezuelaTime = now.toLocaleTimeString('es-VE', {
        timeZone: 'America/Caracas',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      const [year, month, day] = venezuelaDateStr.split('-').map(Number);
      const todayVenezuela = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      
      // Primero buscar sorteos de hoy con hora mayor a la actual
      let nextDraw = await prisma.draw.findFirst({
        where: {
          gameId: game.id,
          status: { in: ['SCHEDULED', 'CLOSED'] },
          drawDate: todayVenezuela,
          drawTime: { gt: venezuelaTime }
        },
        orderBy: { drawTime: 'asc' },
        include: {
          preselectedItem: true
        }
      });
      
      // Si no hay de hoy, buscar de días futuros
      if (!nextDraw) {
        nextDraw = await prisma.draw.findFirst({
          where: {
            gameId: game.id,
            status: { in: ['SCHEDULED', 'CLOSED'] },
            drawDate: { gt: todayVenezuela }
          },
          orderBy: [
            { drawDate: 'asc' },
            { drawTime: 'asc' }
          ],
          include: {
            preselectedItem: true
          }
        });
      }

      if (!nextDraw) {
        await bot.sendMessage(chatId, `❌ No hay sorteos programados para ${game.name}`);
        return;
      }

      const previousItem = nextDraw.preselectedItem;

      // Actualizar el pre-seleccionado
      await prisma.draw.update({
        where: { id: nextDraw.id },
        data: { preselectedItemId: gameItem.id }
      });

      // Registrar en audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'PREWINNER_CHANGED_TELEGRAM',
          entity: 'Draw',
          entityId: nextDraw.id,
          changes: {
            previousItemId: previousItem?.id || null,
            previousNumber: previousItem?.number || null,
            newItemId: gameItem.id,
            newNumber: gameItem.number,
            changedBy: user.username,
            changedVia: 'Telegram'
          }
        }
      });

      // Formatear hora del sorteo (drawTime ya está en hora Venezuela)
      const [hours, mins] = nextDraw.drawTime.split(':');
      const hour = parseInt(hours, 10);
      const minute = mins;
      const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
      const displayHour = hour % 12 || 12;
      const drawTime = `${displayHour.toString().padStart(2, '0')}:${minute} ${ampm}`;

      // Confirmar al usuario que hizo el cambio
      await bot.sendMessage(chatId, `
✅ <b>Cambio realizado</b>

🎰 <b>Juego:</b> ${game.name}
⏰ <b>Sorteo:</b> ${drawTime}
${previousItem ? `\n❌ <b>Anterior:</b> ${previousItem.number} - ${previousItem.name}` : ''}
✅ <b>Nuevo:</b> ${gameItem.number} - ${gameItem.name}

📢 Se notificará a los demás administradores.
      `.trim(), { parse_mode: 'HTML' });

      // Notificar a todos los administradores del juego (excepto al que hizo el cambio)
      await this.notifyChangeToAdmins(game, nextDraw, gameItem, previousItem, user, drawTime);

      logger.info(`🔄 ${user.username} cambió pre-ganador de ${game.name} a ${gameItem.number} via Telegram`);

    } catch (error) {
      logger.error('Error en handleChangeResult:', error);
      await bot.sendMessage(chatId, '❌ Error al procesar el cambio. Intenta de nuevo.');
    }
  }

  /**
   * Notificar cambio de resultado a todos los administradores del juego
   */
  async notifyChangeToAdmins(game, draw, newItem, previousItem, changedByUser, drawTime) {
    try {
      // Obtener todos los administradores del juego con Telegram vinculado
      const admins = await prisma.userGame.findMany({
        where: {
          gameId: game.id,
          notify: true,
          user: {
            isActive: true,
            telegramChatId: { not: null },
            // Excluir al usuario que hizo el cambio
            id: { not: changedByUser.id }
          }
        },
        include: { user: true }
      });

      if (admins.length === 0) {
        return;
      }

      const message = `
🔔 <b>CAMBIO DE PRE-GANADOR</b>

🎰 <b>Juego:</b> ${game.name}
⏰ <b>Sorteo:</b> ${drawTime}
${previousItem ? `\n❌ <b>Anterior:</b> ${previousItem.number} - ${previousItem.name}` : ''}
✅ <b>Nuevo:</b> ${newItem.number} - ${newItem.name}

👤 <b>Cambiado por:</b> ${changedByUser.username}
📱 <b>Vía:</b> Telegram
      `.trim();

      // Enviar a cada administrador
      for (const admin of admins) {
        try {
          await this.sendMessageDirect(admin.user.telegramChatId, message);
        } catch (error) {
          logger.error(`Error notificando cambio a ${admin.user.username}:`, error.message);
        }
      }

      logger.info(`📢 Notificado cambio de pre-ganador a ${admins.length} administrador(es)`);

    } catch (error) {
      logger.error('Error en notifyChangeToAdmins:', error);
    }
  }

  /**
   * Enviar mensaje directo usando cualquier bot activo
   */
  async sendMessageDirect(chatId, message) {
    // Usar el primer bot activo disponible
    for (const [botId, bot] of this.bots) {
      try {
        await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
        return true;
      } catch (error) {
        continue;
      }
    }
    return false;
  }

  /**
   * Enviar mensaje a un chat específico usando el bot asignado al juego
   * @param {string} gameId - ID del juego
   * @param {string} chatId - Chat ID del destinatario
   * @param {string} message - Mensaje a enviar
   * @param {object} options - Opciones adicionales
   */
  async sendMessage(gameId, chatId, message, options = {}) {
    try {
      // Buscar bot asignado al juego
      const botGame = await prisma.adminBotGame.findFirst({
        where: { gameId },
        include: { bot: true }
      });

      if (!botGame || !botGame.bot.isActive) {
        logger.warn(`No hay bot de admin activo para el juego ${gameId}`);
        return false;
      }

      const bot = this.bots.get(botGame.botId);
      if (!bot) {
        logger.warn(`Bot ${botGame.botId} no está corriendo`);
        return false;
      }

      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        ...options
      });

      return true;
    } catch (error) {
      logger.error(`Error enviando mensaje a ${chatId}:`, error);
      return false;
    }
  }

  /**
   * Enviar foto a un chat específico
   * @param {string} gameId - ID del juego
   * @param {string} chatId - Chat ID del destinatario
   * @param {string} photoPath - Ruta de la imagen
   * @param {string} caption - Texto de la imagen
   */
  async sendPhoto(gameId, chatId, photoPath, caption = '') {
    try {
      const botGame = await prisma.adminBotGame.findFirst({
        where: { gameId },
        include: { bot: true }
      });

      if (!botGame || !botGame.bot.isActive) {
        return false;
      }

      const bot = this.bots.get(botGame.botId);
      if (!bot) {
        return false;
      }

      // Si es una URL, enviar directamente; si es ruta local, usar stream
      if (typeof photoPath === 'string' && (photoPath.startsWith('http://') || photoPath.startsWith('https://'))) {
        await bot.sendPhoto(chatId, photoPath, {
          caption,
          parse_mode: 'HTML'
        });
      } else if (typeof photoPath === 'string') {
        const fs = await import('fs');
        await bot.sendPhoto(chatId, fs.createReadStream(photoPath), {
          caption,
          parse_mode: 'HTML'
        });
      }

      return true;
    } catch (error) {
      logger.error(`Error enviando foto a ${chatId}:`, error);
      return false;
    }
  }

  /**
   * Enviar documento (PDF) por Telegram
   * @param {string} gameId - ID del juego
   * @param {string} chatId - Chat ID del destinatario
   * @param {string} documentPath - Ruta del documento
   * @param {string} caption - Texto del documento
   */
  async sendDocument(gameId, chatId, documentPath, caption = '') {
    try {
      const botGame = await prisma.adminBotGame.findFirst({
        where: { gameId },
        include: { bot: true }
      });

      if (!botGame || !botGame.bot.isActive) {
        return false;
      }

      const bot = this.bots.get(botGame.botId);
      if (!bot) {
        return false;
      }

      const fs = await import('fs');
      
      // Verificar que el archivo existe
      if (!fs.existsSync(documentPath)) {
        logger.warn(`Documento no encontrado: ${documentPath}`);
        return false;
      }

      await bot.sendDocument(chatId, fs.createReadStream(documentPath), {
        caption,
        parse_mode: 'HTML'
      });

      return true;
    } catch (error) {
      logger.error(`Error enviando documento a ${chatId}:`, error);
      return false;
    }
  }

  /**
   * Obtener todos los administradores de un juego con Telegram vinculado
   * @param {string} gameId - ID del juego
   * @returns {Promise<Array>} - Lista de usuarios
   */
  async getGameAdmins(gameId) {
    return prisma.userGame.findMany({
      where: {
        gameId,
        notify: true,
        user: {
          isActive: true,
          telegramChatId: { not: null }
        }
      },
      include: { user: true }
    });
  }

  /**
   * Notificar a todos los administradores de un juego
   * @param {string} gameId - ID del juego
   * @param {string} message - Mensaje a enviar
   * @param {string} photoPath - Ruta de imagen opcional
   * @param {string} documentPath - Ruta de documento PDF opcional
   */
  async notifyGameAdmins(gameId, message, photoPath = null, documentPath = null) {
    // NOTE: El bot de admin se mantiene activo en local para testing.
    // DISABLE_SOCIAL_CHANNELS solo aplica a canales públicos (publicationService, playerNotification).
    try {
      const admins = await this.getGameAdmins(gameId);

      if (admins.length === 0) {
        logger.info(`No hay administradores para notificar del juego ${gameId}`);
        return { notified: 0, total: 0 };
      }

      let notified = 0;
      for (const admin of admins) {
        try {
          await this.sendMessage(gameId, admin.user.telegramChatId, message);
          
          if (photoPath) {
            await this.sendPhoto(gameId, admin.user.telegramChatId, photoPath);
          }
          
          if (documentPath) {
            await this.sendDocument(gameId, admin.user.telegramChatId, documentPath, '📄 Reporte de cierre');
          }
          
          notified++;
        } catch (error) {
          logger.error(`Error notificando a ${admin.user.username}:`, error);
        }
      }

      logger.info(`📱 Notificados ${notified}/${admins.length} administradores del juego`);
      return { notified, total: admins.length };
    } catch (error) {
      logger.error('Error en notifyGameAdmins:', error);
      return { notified: 0, total: 0 };
    }
  }

  /**
   * Crear un nuevo bot de administración
   * @param {object} data - Datos del bot
   */
  async createBot(data) {
    const { name, botToken } = data;

    // Verificar token
    const tempBot = new TelegramBot(botToken);
    const botInfo = await tempBot.getMe();

    const bot = await prisma.adminTelegramBot.create({
      data: {
        name,
        botToken,
        botUsername: botInfo.username,
        status: 'DISCONNECTED'
      }
    });

    // Iniciar el bot
    await this.startBot(bot);

    return bot;
  }

  /**
   * Eliminar un bot
   * @param {string} botId - ID del bot
   */
  async deleteBot(botId) {
    await this.stopBot(botId);
    await prisma.adminTelegramBot.delete({ where: { id: botId } });
  }

  /**
   * Asignar bot a un juego
   * @param {string} botId - ID del bot
   * @param {string} gameId - ID del juego
   */
  async assignBotToGame(botId, gameId) {
    return prisma.adminBotGame.create({
      data: { botId, gameId }
    });
  }

  /**
   * Desasignar bot de un juego
   * @param {string} botId - ID del bot
   * @param {string} gameId - ID del juego
   */
  async unassignBotFromGame(botId, gameId) {
    return prisma.adminBotGame.deleteMany({
      where: { botId, gameId }
    });
  }

  /**
   * Generar código de vinculación para un usuario
   * @param {string} userId - ID del usuario
   * @returns {Promise<string>} - Código generado
   */
  async generateLinkCode(userId) {
    // Eliminar código anterior si existe
    await prisma.telegramLinkCode.deleteMany({
      where: { userId }
    });

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Crear código con expiración de 10 minutos
    await prisma.telegramLinkCode.create({
      data: {
        userId,
        code,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });

    return code;
  }

  /**
   * Detener todos los bots
   */
  async shutdown() {
    for (const [botId, bot] of this.bots) {
      await bot.stopPolling();
      logger.info(`Bot ${botId} detenido`);
    }
    this.bots.clear();
  }
}

export default new AdminTelegramBotService();
