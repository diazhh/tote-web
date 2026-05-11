import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import adminTelegramBotService from './admin-telegram-bot.service.js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Servicio para notificar a administradores sobre eventos del sistema
 */
class AdminNotificationService {
  constructor() {
    // ID de la instancia de Telegram para notificaciones admin
    this.telegramInstanceId = process.env.ADMIN_TELEGRAM_INSTANCE_ID || 'admin-bot';
  }

  /**
   * Obtener administradores asociados a un juego que deben recibir notificaciones
   * @param {string} gameId - ID del juego
   * @returns {Promise<Array>} - Lista de usuarios con telegramChatId
   */
  async getGameAdmins(gameId) {
    try {
      const userGames = await prisma.userGame.findMany({
        where: {
          gameId,
          notify: true,
          user: {
            isActive: true,
            telegramChatId: {
              not: null
            },
            role: {
              in: ['ADMIN', 'OPERATOR']
            }
          }
        },
        include: {
          user: true
        }
      });

      return userGames.map(ug => ug.user);
    } catch (error) {
      logger.error('Error obteniendo admins del juego:', error);
      return [];
    }
  }

  /**
   * Notificar pre-ganador seleccionado a los administradores
   * @param {object} data - Datos del pre-ganador
   */
  async notifyPrewinnerSelected(data) {
    const {
      drawId,
      game,
      drawDate,
      drawTime,
      prewinnerItem,
      totalSales,
      maxPayout,
      potentialPayout,
      salesByItem,
      tripletaRiskTop5,
      isTerminal,
      terminalTickets,
      sourceStatus
    } = data;

    try {
      // Formatear mensaje (Terminal tiene formato especial sin pre-ganador)
      const message = isTerminal
        ? this.formatTerminalCloseMessage({ game, drawDate, drawTime, terminalTickets, sourceStatus })
        : this.formatPrewinnerMessage({
            game, drawDate, drawTime, prewinnerItem, totalSales,
            maxPayout, potentialPayout, salesByItem, tripletaRiskTop5, sourceStatus
          });

      // Enviar solo mensaje de texto al admin (el PDF adjunto se eliminó —
      // ver spec 2026-05-11-eliminar-pdf-cierre-sorteo-design.md)
      const result = await adminTelegramBotService.notifyGameAdmins(game.id, message);
      
      logger.info(`📱 Notificaciones pre-ganador enviadas: ${result.notified}/${result.total}`);
      return result;

    } catch (error) {
      logger.error('Error en notifyPrewinnerSelected:', error);
      throw error;
    }
  }

  /**
   * Bloque "Fuentes de venta" — muestra status por proveedor (SRQ, Maxplay, etc).
   * `sourceStatus` shape: { srq: { ok, imported, reason }, maxplay: { ok, imported, reason }, ... }
   */
  formatSourceStatusBlock(sourceStatus) {
    if (!sourceStatus) return '';

    const lines = [];
    const fmt = (label, s) => {
      if (!s) return null;
      // Disabled-by-flag is not a failure — present it as a neutral note
      if (s.ok && s.reason && s.reason !== 'ok' && s.imported === 0) {
        const noteMap = {
          maxplay_disabled: 'desactivado por configuración',
          game_not_supported: 'no aplica a este juego',
          draw_frozen: 'sorteo ya cerrado',
          draw_frozen_under_lock: 'sorteo ya cerrado',
        };
        const note = noteMap[s.reason] || s.reason;
        return `▪️ ${label}: <i>${note}</i>`;
      }
      if (s.ok) return `✅ ${label}: ${s.imported} jugadas importadas`;
      const cause = (s.reason || 'error desconocido').replace(/^scrape_failed:\s*/, '');
      return `❌ ${label}: <i>no se pudo traer</i> — ${cause}`;
    };

    const labels = { srq: 'SRQ', maxplay: 'Maxplay', push: 'Push' };
    for (const key of Object.keys(sourceStatus)) {
      const ln = fmt(labels[key] || key, sourceStatus[key]);
      if (ln) lines.push(ln);
    }
    if (lines.length === 0) return '';
    return `\n📥 <b>Fuentes de venta:</b>\n${lines.join('\n')}\n`;
  }

  /**
   * Formatear mensaje de pre-ganador
   */
  formatPrewinnerMessage(data) {
    const {
      game,
      drawDate,
      drawTime,
      prewinnerItem,
      totalSales,
      maxPayout,
      potentialPayout,
      salesByItem,
      tripletaRiskTop5,
      sourceStatus
    } = data;

    const dateStr = format(new Date(drawDate), "EEEE d 'de' MMMM, yyyy", { locale: es });
    // drawTime ya está en formato HH:MM:SS, convertir a 12h
    const [hours, minutes] = drawTime.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
    const displayHour = hour % 12 || 12;
    const timeStr = `${displayHour}:${minutes} ${ampm}`;

    // Top 5 números más jugados
    const topItems = salesByItem
      ? Object.values(salesByItem)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)
      : [];

    let topItemsStr = '';
    if (topItems.length > 0) {
      topItemsStr = '\n\n📊 <b>Top 5 más jugados:</b>\n';
      topItems.forEach((item, i) => {
        const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▪️';
        topItemsStr += `${emoji} ${item.number} (${item.name}): $${item.amount.toFixed(2)}\n`;
      });
    }

    // Top 5 riesgo de tripletas
    let tripletaRiskStr = '';
    if (tripletaRiskTop5 && tripletaRiskTop5.length > 0) {
      tripletaRiskStr = '\n\n🎲 <b>Top 5 Riesgo Tripletas:</b>\n';
      tripletaRiskTop5.forEach((item, i) => {
        const emoji = i === 0 ? '🔴' : i === 1 ? '🟠' : i === 2 ? '🟡' : '▪️';
        const riskEmoji = item.tripletaCount >= 5 ? '⚠️' : item.tripletaCount >= 3 ? '⚡' : '📍';
        tripletaRiskStr += `${emoji} ${item.number} (${item.name}): ${item.tripletaCount} tripletas - $${item.tripletaPrize.toFixed(2)} ${riskEmoji}\n`;
      });
    }

    const message = `
🎯 <b>PRE-GANADOR SELECCIONADO</b>

🎰 <b>Juego:</b> ${game.name}
📅 <b>Fecha:</b> ${dateStr}
⏰ <b>Hora:</b> ${timeStr}

━━━━━━━━━━━━━━━━━━━━

🏆 <b>Número Pre-seleccionado:</b>
<code>${prewinnerItem.number}</code> - ${prewinnerItem.name}

━━━━━━━━━━━━━━━━━━━━

💰 <b>Resumen Financiero:</b>
• Ventas totales: <b>$${totalSales.toFixed(2)}</b>
• Máximo a pagar (${game.config?.percentageToDistribute || 70}%): <b>$${maxPayout.toFixed(2)}</b>
• Pago potencial: <b>$${potentialPayout.toFixed(2)}</b>
• Multiplicador: <b>x${prewinnerItem.multiplier}</b>
${topItemsStr}${tripletaRiskStr}${this.formatSourceStatusBlock(sourceStatus)}
━━━━━━━━━━━━━━━━━━━━

⚠️ <i>Este es un número pre-seleccionado. El resultado final puede cambiar.</i>
`.trim();

    return message;
  }

  /**
   * Formatear mensaje de cierre Terminal (sin pre-ganador)
   */
  formatTerminalCloseMessage(data) {
    const { game, drawDate, drawTime, terminalTickets, sourceStatus } = data;
    const dateStr = format(new Date(drawDate), "EEEE d 'de' MMMM, yyyy", { locale: es });
    const [hours, minutes] = drawTime.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
    const displayHour = hour % 12 || 12;
    const timeStr = `${displayHour}:${minutes} ${ampm}`;

    return `
🔒 <b>TERMINAL CERRADO</b>

🎰 <b>Juego:</b> ${game.name}
📅 <b>Fecha:</b> ${dateStr}
⏰ <b>Hora:</b> ${timeStr}

━━━━━━━━━━━━━━━━━━━━

🎫 <b>Tickets importados:</b> ${terminalTickets || 0}
${this.formatSourceStatusBlock(sourceStatus)}
⚠️ <i>El ganador se determinara al ejecutar el sorteo Triple vinculado (ultimos 2 digitos).</i>
`.trim();
  }

  /**
   * Enviar notificación por Telegram
   * @param {string} chatId - Chat ID del destinatario
   * @param {string} message - Mensaje a enviar
   */
  async sendTelegramNotification(chatId, message) {
    try {
      // Intentar usar el servicio de Telegram existente
      const instance = await prisma.telegramInstance.findFirst({
        where: {
          isActive: true,
          status: 'CONNECTED'
        }
      });

      if (instance) {
        await telegramService.sendMessage(instance.instanceId, chatId, message, {
          parseMode: 'HTML'
        });
      } else {
        // Fallback: usar bot token directo si está configurado
        const botToken = process.env.ADMIN_TELEGRAM_BOT_TOKEN;
        if (!botToken) {
          throw new Error('No hay instancia de Telegram configurada ni ADMIN_TELEGRAM_BOT_TOKEN');
        }

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
          })
        });

        const result = await response.json();
        if (!result.ok) {
          throw new Error(result.description || 'Error enviando mensaje');
        }
      }

      return true;
    } catch (error) {
      logger.error(`Error enviando notificación Telegram a ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Notificar resultado del sorteo totalizado a los administradores
   * @param {object} data - Datos del sorteo totalizado
   */
  async notifyDrawResult(data) {
    const {
      drawId,
      game,
      drawDate,
      drawTime,
      winnerItem,
      totalSales,
      totalPayout,
      profit,
      dailyStats,
      weeklyStats,
      monthlyStats,
      imagePath
    } = data;

    try {
      const message = this.formatDrawResultMessage({
        game,
        drawDate,
        drawTime,
        winnerItem,
        totalSales,
        totalPayout,
        profit,
        dailyStats,
        weeklyStats,
        monthlyStats
      });

      // Usar el nuevo servicio de bots de administración (con imagen si está disponible)
      const result = await adminTelegramBotService.notifyGameAdmins(game.id, message, imagePath);
      
      logger.info(`📱 Resultados enviados: ${result.notified}/${result.total}`);
      return result;

    } catch (error) {
      logger.error('Error en notifyDrawResult:', error);
      throw error;
    }
  }

  /**
   * Formatear mensaje de resultado del sorteo
   */
  formatDrawResultMessage(data) {
    const {
      game,
      drawDate,
      drawTime,
      winnerItem,
      totalSales,
      totalPayout,
      profit,
      dailyStats,
      weeklyStats,
      monthlyStats
    } = data;

    const dateStr = format(new Date(drawDate), "EEEE d 'de' MMMM, yyyy", { locale: es });
    // drawTime ya está en formato HH:MM:SS, convertir a 12h
    const [hours, minutes] = drawTime.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
    const displayHour = hour % 12 || 12;
    const timeStr = `${displayHour}:${minutes} ${ampm}`;

    const profitEmoji = profit >= 0 ? '📈' : '📉';
    const profitSign = profit >= 0 ? '+' : '';

    const message = `
🎰 <b>SORTEO TOTALIZADO</b>

🎯 <b>Juego:</b> ${game.name}
📅 <b>Fecha:</b> ${dateStr}
⏰ <b>Hora:</b> ${timeStr}

━━━━━━━━━━━━━━━━━━━━

🏆 <b>NÚMERO GANADOR:</b>
<code>${winnerItem.number}</code> - ${winnerItem.name}

━━━━━━━━━━━━━━━━━━━━

💰 <b>RESUMEN DEL SORTEO:</b>
• Ventas: <b>$${totalSales.toFixed(2)}</b>
• Pagos: <b>$${totalPayout.toFixed(2)}</b>
• ${profitEmoji} Ganancia: <b>${profitSign}$${profit.toFixed(2)}</b>

━━━━━━━━━━━━━━━━━━━━

📊 <b>ACUMULADOS:</b>

📅 <b>Hoy:</b>
• Ventas: $${dailyStats.sales.toFixed(2)}
• Pagos: $${dailyStats.payouts.toFixed(2)}
• Ganancia: ${dailyStats.profit >= 0 ? '+' : ''}$${dailyStats.profit.toFixed(2)}

📆 <b>Semana:</b>
• Ventas: $${weeklyStats.sales.toFixed(2)}
• Pagos: $${weeklyStats.payouts.toFixed(2)}
• Ganancia: ${weeklyStats.profit >= 0 ? '+' : ''}$${weeklyStats.profit.toFixed(2)}

📅 <b>Mes:</b>
• Ventas: $${monthlyStats.sales.toFixed(2)}
• Pagos: $${monthlyStats.payouts.toFixed(2)}
• Ganancia: ${monthlyStats.profit >= 0 ? '+' : ''}$${monthlyStats.profit.toFixed(2)}

━━━━━━━━━━━━━━━━━━━━
`.trim();

    return message;
  }

  /**
   * Enviar foto por Telegram
   * @param {string} chatId - Chat ID del destinatario
   * @param {string} photoPath - Ruta de la imagen
   * @param {string} caption - Texto de la imagen
   */
  async sendTelegramPhoto(chatId, photoPath, caption = '') {
    try {
      const botToken = process.env.ADMIN_TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        logger.warn('ADMIN_TELEGRAM_BOT_TOKEN no configurado, no se puede enviar imagen');
        return false;
      }

      const fs = await import('fs');
      const FormData = (await import('form-data')).default;
      
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', fs.createReadStream(photoPath));
      if (caption) {
        form.append('caption', caption);
      }

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        body: form
      });

      const result = await response.json();
      if (!result.ok) {
        throw new Error(result.description || 'Error enviando foto');
      }

      return true;
    } catch (error) {
      logger.error(`Error enviando foto Telegram a ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Notificar error en selección de pre-ganador
   */
  async notifyPrewinnerError(gameId, drawId, error) {
    try {
      const admins = await this.getGameAdmins(gameId);
      
      const message = `
⚠️ <b>ERROR EN SELECCIÓN DE PRE-GANADOR</b>

🎰 Sorteo: <code>${drawId}</code>
❌ Error: ${error.message}

Por favor revise el sistema.
`.trim();

      for (const admin of admins) {
        try {
          await this.sendTelegramNotification(admin.telegramChatId, message);
        } catch (err) {
          logger.error(`Error notificando error a ${admin.username}:`, err.message);
        }
      }
    } catch (err) {
      logger.error('Error en notifyPrewinnerError:', err);
    }
  }
}

export default new AdminNotificationService();
