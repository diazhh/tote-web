import { Cron } from 'croner';
import logger from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import maxplayService from '../services/maxplay.service.js';
import { getBoss } from '../queue/boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../queue/constants.js';

/**
 * Job para sincronizar tickets de Maxplay (proveedor SCRAPE) cada 5 minutos.
 *
 * Mirror del patrón de sync-api-tickets.job.js (SRQ) adaptado a Maxplay:
 * - Filtra sólo a juegos triple-pantera y terminal-pantera (los únicos que
 *   Maxplay reporta para esta cuenta).
 * - Por cada juego, busca el sorteo SCHEDULED próximo a cerrar (≤1h).
 * - Llama a maxplayService.importMaxplayTickets() — internamente decide si
 *   correr según flag isActive del ApiSystem y maneja retry interno (1x).
 *
 * Beneficios vs solo close-draw inline:
 * - Mantiene cf_clearance fresco (cookie expira ~30 min).
 * - Pre-cachea los tickets en DB para que el close-draw inline sea instantáneo.
 * - Si Maxplay está caído un periodo, hay 12 reintentos antes del cierre.
 *
 * IMPORTANTE: este job NO selecciona pre-ganador. Eso lo hace close-draw.worker.js
 * exactamente al cerrar el sorteo.
 */

const MAXPLAY_GAME_SLUGS = ['triple-pantera', 'terminal-pantera'];

class SyncScrapeTicketsJob {
  constructor() {
    this.cronExpression = '*/5 * * * *'; // Cada 5 minutos
    this.task = null;
  }

  start() {
    this.task = new Cron(this.cronExpression, {
      timezone: 'America/Caracas',
      catch: (error) => {
        logger.error('Error en SyncScrapeTickets job:', error);
      }
    }, async () => {
      await this.execute();
    });

    logger.info('✅ Job SyncScrapeTickets (Maxplay) iniciado (cada 5 min, TZ: America/Caracas)');
  }

  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job SyncScrapeTickets detenido');
    }
  }

  async execute() {
    try {
      // Si pg-boss está activo, enqueue (worker corre el barrido); si no, ejecutar inline.
      if (process.env.PGBOSS_SYNC_SCRAPE_TICKETS === 'true') {
        const boss = getBoss();
        const tickKey = new Date().toISOString().slice(0, 16);
        await boss.send(QUEUES.SYNC_SCRAPE_TICKETS, {}, {
          singletonKey: `sync-scrape-tickets-${tickKey}`,
          ...QUEUE_CONFIGS[QUEUES.SYNC_SCRAPE_TICKETS],
        });
        logger.info('[sync-scrape-tickets] Job encolado en pg-boss');
        return;
      }

      await this._runSweep();
    } catch (error) {
      logger.error('❌ Error en SyncScrapeTicketsJob:', error);
    }
  }

  /**
   * Barrido real: busca draws Triple/Terminal próximos y dispara maxplayService.
   * Llamado tanto por el cron (modo inline) como por el worker pg-boss.
   */
  async _runSweep() {
    // Verificación temprana: si Maxplay está desactivado, no hacer nada.
    const apiSystem = await prisma.apiSystem.findUnique({
      where: { slug: 'maxplay' },
      select: { isActive: true },
    });
    if (!apiSystem || !apiSystem.isActive) {
      logger.debug('[sync-scrape-tickets] Maxplay desactivado, skip');
      return;
    }

    const games = await prisma.game.findMany({
      where: { slug: { in: MAXPLAY_GAME_SLUGS }, isActive: true },
      select: { id: true, name: true, slug: true },
    });

    if (games.length === 0) {
      logger.debug('[sync-scrape-tickets] No hay juegos Triple/Terminal activos');
      return;
    }

    logger.info('🎫 [sync-scrape-tickets] Sincronizando Maxplay...');

    const { getVenezuelaDateAsUTC, getVenezuelaTimeString, addMinutesToTime } = await import('../lib/dateUtils.js');
    const todayVenezuela = getVenezuelaDateAsUTC();
    const currentTime = getVenezuelaTimeString();

    // Solo último ciclo antes del cierre — antes era ventana de 1 hora (12 calls
    // por draw). Ahora ventana de 6 min: el cron corre cada 5 min, así que cada
    // draw cae en la ventana exactamente UNA vez (T-5..T-0). Justificación:
    // cada login fresh consume saldo 2captcha y aumenta probabilidad de que
    // CF endurezca aún más la detección. El close-and-ingest cierra el draw
    // T-5min así que esta única corrida es justo el último ciclo antes del
    // cierre. Si falla → alerta Telegram a admins.
    const windowEnd = addMinutesToTime(currentTime, 6);

    for (const game of games) {
      let draw = null;
      try {
        draw = await prisma.draw.findFirst({
          where: {
            gameId: game.id,
            status: 'SCHEDULED',
            drawDate: todayVenezuela,
            drawTime: { gte: currentTime, lte: windowEnd },
          },
          orderBy: { drawTime: 'asc' },
        });

        if (!draw) {
          continue;
        }

        const [drawHours, drawMinutes] = draw.drawTime.split(':');
        const [hours, minutes] = currentTime.split(':');
        const minutesUntilDraw =
          (parseInt(drawHours) * 60 + parseInt(drawMinutes)) -
          (parseInt(hours) * 60 + parseInt(minutes));
        const minutesUntilClose = minutesUntilDraw - 5;
        const hour = parseInt(drawHours);
        const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
        const displayHour = hour % 12 || 12;
        const hora = `${displayHour}:${drawMinutes} ${ampm}`;

        logger.info(`  📊 ${game.name} ${hora} (cierra en ${minutesUntilClose} min)`);

        const result = await maxplayService.importMaxplayTickets(draw.id);
        if (result.ok) {
          logger.info(`     ✓ Maxplay: ${result.imported} tickets (${result.product || ''}, ${result.durationMs}ms)`);
        } else {
          logger.warn(`     ✗ Maxplay falló: ${result.reason}`);
          await this._notifyMaxplayFailure(game, draw, result.reason).catch((e) => {
            logger.warn(`[sync-scrape-tickets] alerta fallida: ${e.message}`);
          });
        }
      } catch (error) {
        logger.error(`  ✗ Error en ${game.name}: ${error.message}`);
        await this._notifyMaxplayFailure(game, draw, `unexpected: ${error.message}`).catch(() => {
          /* best-effort */
        });
      }
    }
  }

  /**
   * Alerta a admins (Telegram) cuando el scrape de Maxplay falla.
   *
   * Con la ventana de 6 min, cada draw se intenta UNA sola vez antes del cierre,
   * por eso cualquier fallo es operacionalmente crítico (ese sorteo se va a
   * cerrar sin las ventas de Maxplay si no se resuelve en los próximos minutos).
   *
   * Notifica a todos los admins del juego con telegramChatId y notify=true.
   * Best-effort: errores al enviar se logean y se siguen procesando otros admins.
   */
  async _notifyMaxplayFailure(game, draw, reason) {
    const adminTelegramBotService = (await import('../services/admin-telegram-bot.service.js')).default;

    const admins = await prisma.userGame.findMany({
      where: {
        gameId: game.id,
        notify: true,
        user: { isActive: true, telegramChatId: { not: null } },
      },
      include: { user: { select: { username: true, telegramChatId: true } } },
    });
    if (admins.length === 0) return;

    let drawInfo = '';
    if (draw) {
      const [h, m] = draw.drawTime.split(':');
      const hour = parseInt(h);
      const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
      const displayHour = hour % 12 || 12;
      drawInfo = `\n⏰ <b>Sorteo:</b> ${displayHour}:${m} ${ampm}`;
    }

    const message = [
      '🚨 <b>MAXPLAY — SCRAPE FALLÓ</b>',
      '',
      `🎰 <b>Juego:</b> ${game.name}${drawInfo}`,
      '',
      `❌ <b>Razón:</b> <code>${String(reason).slice(0, 250)}</code>`,
      '',
      '⚠️ El sorteo va a cerrar sin las ventas de Maxplay si no se resuelve.',
      '',
      'Revisar en VPS:',
      '• Saldo 2captcha',
      '• <code>pm2 logs tote-scrape</code>',
      '• <code>/tmp/maxplay-debug-*</code>',
    ].join('\n');

    let sent = 0;
    for (const admin of admins) {
      try {
        const ok = await adminTelegramBotService.sendMessageDirect(admin.user.telegramChatId, message);
        if (ok) sent++;
      } catch (e) {
        logger.warn(`[sync-scrape-tickets] alerta a ${admin.user.username} falló: ${e.message}`);
      }
    }
    logger.warn(`[sync-scrape-tickets] 📢 alerta Maxplay enviada a ${sent}/${admins.length} admin(s) [${game.name}]`);
  }
}

export default new SyncScrapeTicketsJob();
