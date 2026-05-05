import logger from '../../lib/logger.js';
import maxplayService from '../../services/maxplay.service.js';

/**
 * Pulls Maxplay jugadas for a specific drawId via the Python sidecar.
 * Job payload: { drawId: string }
 *
 * This worker does NOT throw on Maxplay scrape failure — it logs the result and
 * returns it. The orchestrator (close-draw worker) decides whether to proceed
 * with prewinner selection regardless of Maxplay availability.
 */
export async function syncScrapeTicketsWorker(job) {
  const drawId = job?.data?.drawId;
  if (!drawId) {
    logger.warn('[sync-scrape-tickets] job sin drawId, ignorando');
    return { ok: false, reason: 'missing_draw_id' };
  }

  try {
    const result = await maxplayService.importMaxplayTickets(drawId);
    if (!result.ok) {
      logger.warn(`[sync-scrape-tickets] draw ${drawId} fallo controlado: ${result.reason}`);
    }
    return result;
  } catch (err) {
    // Catch-all so pg-boss doesn't keep retrying on programming errors that bypass our service guards.
    logger.error(`[sync-scrape-tickets] error inesperado en draw ${drawId}: ${err.message}`);
    return { ok: false, reason: `unexpected: ${err.message}`, imported: 0, deleted: 0 };
  }
}
