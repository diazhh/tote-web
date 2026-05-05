import logger from '../../lib/logger.js';
import syncScrapeTicketsJob from '../../jobs/sync-scrape-tickets.job.js';
import maxplayService from '../../services/maxplay.service.js';

/**
 * Worker pg-boss para sincronizar Maxplay.
 *
 * Dos modos según el payload del job:
 *  - Sin drawId → barrido completo (Triple + Terminal próximos a cerrar)
 *    Disparado por el cron Croner cada 5 minutos vía syncScrapeTicketsJob.
 *  - Con drawId → sincroniza un sorteo específico (e.g. close-draw que enqueue manual).
 *
 * No tira excepciones — devuelve resultado para que pg-boss no reintente sobre
 * fallas controladas (Maxplay caído, etc.). El close-draw inline tiene su propio
 * retry y decide si continuar sin Maxplay.
 */
export async function syncScrapeTicketsWorker(job) {
  const drawId = job?.data?.drawId;

  try {
    if (drawId) {
      const result = await maxplayService.importMaxplayTickets(drawId);
      if (!result.ok) {
        logger.warn(`[sync-scrape-tickets] draw ${drawId} fallo controlado: ${result.reason}`);
      }
      return result;
    }

    // Sin drawId: barrido completo
    await syncScrapeTicketsJob._runSweep();
    return { ok: true, mode: 'sweep' };
  } catch (err) {
    logger.error(`[sync-scrape-tickets] error inesperado: ${err.message}`);
    return { ok: false, reason: `unexpected: ${err.message}` };
  }
}
