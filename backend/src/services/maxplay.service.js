/**
 * Maxplay provider integration — calls the Python sidecar at MAXPLAY_SIDECAR_URL,
 * normalizes the aggregated jugadas into synthetic Tickets, and persists them.
 *
 * Mirrors the SRQ pattern in api-integration.service.js:
 *  - withDrawLock to coordinate with the prewinner selection
 *  - skip if draw is no longer SCHEDULED
 *  - deleteMany existing tickets with source EXTERNAL_SCRAPE before re-import
 *  - one Ticket per Maxplay row (jugada), regardless of how many real tickets
 *    Maxplay reports for that jugada (the user decision: 1 row → 1 synthetic ticket)
 */
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import withDrawLock from '../lib/drawLock.js';

const SIDECAR_URL = process.env.MAXPLAY_SIDECAR_URL || 'http://127.0.0.1:8055';
const REQUEST_TIMEOUT_MS = parseInt(process.env.MAXPLAY_TIMEOUT_MS || '30000', 10);
const RETRY_DELAY_MS = parseInt(process.env.MAXPLAY_RETRY_DELAY_MS || '3000', 10);

// External juego_id per draw hour (Caracas timezone, all under TRIPLE PANTERA dropdown
// in Maxplay but rows include both Triple and Terminal — discriminated downstream by digit count).
const HOUR_TO_JUEGO_ID = {
  8: '768', 9: '769', 10: '770', 11: '771',
  12: '772', 13: '773', 14: '774', 15: '775',
  16: '776', 17: '777', 18: '778', 19: '779',
};

const GAME_SLUG_TO_PRODUCT = {
  'triple-pantera':   'TRIPLE',
  'terminal-pantera': 'TERMINAL',
};

class MaxplayService {
  /**
   * Returns the Maxplay ApiSystem row, or null if not seeded / not active.
   */
  async getApiSystem() {
    return prisma.apiSystem.findUnique({
      where: { slug: 'maxplay' },
      select: { id: true, isActive: true, mode: true },
    });
  }

  /**
   * Extract a Date's hour in Caracas timezone, regardless of the host TZ.
   * `Draw.drawTime` ('HH:MM:SS') is the canonical wall-clock value, but `scheduledAt`
   * is a UTC timestamp; reading getHours() on it picks up the host's local TZ.
   */
  hourInCaracas(date) {
    if (!date) return null;
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    const part = fmt.formatToParts(new Date(date)).find(p => p.type === 'hour');
    return part ? parseInt(part.value, 10) : null;
  }

  /**
   * Map a Draw's scheduledAt hour to Maxplay's external juego_id.
   * Returns null if the hour is outside the 8AM–7PM window.
   */
  hourToJuegoId(date) {
    const h = this.hourInCaracas(date);
    if (h == null) return null;
    return HOUR_TO_JUEGO_ID[h] || null;
  }

  /**
   * Format a Date as DD/MM/YYYY using Caracas timezone for the form filter.
   */
  formatDateDDMMYYYY(date) {
    const fmt = new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    // es-VE returns "DD/MM/YYYY" already
    return fmt.format(new Date(date));
  }

  /**
   * Calls the Python sidecar with timeout. Returns the parsed JSON body
   * (whether ok or not — caller decides whether to retry).
   */
  async _callSidecar(date, juegoId, currency = 'BS') {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(`${SIDECAR_URL}/scrape/maxplay/jugadas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, juego_id: juegoId, currency }),
        signal: controller.signal,
      });
      const body = await resp.json().catch(() => ({ ok: false, error: `non-json status ${resp.status}` }));
      if (!resp.ok) {
        return { ok: false, error: `sidecar returned ${resp.status}`, body };
      }
      return body;
    } catch (err) {
      const reason = err.name === 'AbortError' ? `timeout after ${REQUEST_TIMEOUT_MS}ms` : (err.message || String(err));
      return { ok: false, error: reason };
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * One scrape attempt + 1 retry on failure. Returns the sidecar payload of the
   * successful attempt, or { ok: false, error } if both attempts fail.
   */
  async _fetchWithRetry(date, juegoId, currency = 'BS') {
    const first = await this._callSidecar(date, juegoId, currency);
    if (first.ok) return first;
    logger.warn(`[maxplay] primer intento falló (${first.error}), reintentando en ${RETRY_DELAY_MS}ms`);
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    const second = await this._callSidecar(date, juegoId, currency);
    if (second.ok) {
      logger.info('[maxplay] reintento exitoso');
      return second;
    }
    return { ok: false, error: second.error || first.error };
  }

  /**
   * Resolve a jugada string (e.g. "004", "21") to a GameItem.id within the given gameId.
   * Maxplay rows are already padded — '004' means "004", '21' means "21". Look them up directly.
   */
  async _resolveGameItem(gameId, number) {
    return prisma.gameItem.findFirst({
      where: { gameId, number: number },
      select: { id: true, multiplier: true },
    });
  }

  /**
   * Public entry point — used by the sync-scrape-tickets worker AND by close-draw before
   * prewinner selection. Idempotent: re-running clears EXTERNAL_SCRAPE tickets and re-imports.
   *
   * Returns: { ok, imported, deleted, reason, durationMs, totales }
   */
  async importMaxplayTickets(drawId) {
    const startedAt = Date.now();

    const apiSystem = await this.getApiSystem();
    if (!apiSystem) {
      return { ok: false, reason: 'apiSystem_not_seeded', imported: 0, deleted: 0, durationMs: Date.now() - startedAt };
    }
    if (!apiSystem.isActive) {
      // Not an error — Maxplay disabled by feature flag.
      return { ok: true, imported: 0, deleted: 0, reason: 'maxplay_disabled', durationMs: Date.now() - startedAt };
    }

    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: { game: true },
    });
    if (!draw) {
      return { ok: false, reason: 'draw_not_found', imported: 0, deleted: 0, durationMs: Date.now() - startedAt };
    }
    if (draw.status !== 'SCHEDULED') {
      return { ok: true, imported: 0, deleted: 0, reason: 'draw_frozen', durationMs: Date.now() - startedAt };
    }

    const product = GAME_SLUG_TO_PRODUCT[draw.game.slug];
    if (!product) {
      // Maxplay only covers Triple/Terminal Pantera — other games are silently skipped.
      return { ok: true, imported: 0, deleted: 0, reason: 'game_not_supported', durationMs: Date.now() - startedAt };
    }

    const scheduledAt = draw.scheduledAt || draw.drawDate;
    const juegoId = this.hourToJuegoId(scheduledAt);
    if (!juegoId) {
      return { ok: false, reason: 'hour_not_mapped', imported: 0, deleted: 0, durationMs: Date.now() - startedAt };
    }
    const dateDDMMYYYY = this.formatDateDDMMYYYY(scheduledAt);

    logger.info(`[maxplay] scraping draw ${drawId} (${draw.game.slug} @ juego_id=${juegoId}, fecha=${dateDDMMYYYY})`);

    const payload = await this._fetchWithRetry(dateDDMMYYYY, juegoId, 'BS');
    if (!payload.ok) {
      return { ok: false, reason: `scrape_failed: ${payload.error}`, imported: 0, deleted: 0, durationMs: Date.now() - startedAt };
    }

    const productRows = (payload.rows || []).filter(r => r.product === product);
    logger.info(`[maxplay] juego_id=${juegoId} sidecar=${payload.duration_ms}ms total_rows=${(payload.rows || []).length} ${product}=${productRows.length}`);

    return withDrawLock(drawId, async () => {
      // Re-check status under lock (could have changed between getDraw and lock acquire)
      const fresh = await prisma.draw.findUnique({ where: { id: drawId }, select: { status: true } });
      if (!fresh || fresh.status !== 'SCHEDULED') {
        return { ok: true, imported: 0, deleted: 0, reason: 'draw_frozen_under_lock', durationMs: Date.now() - startedAt, totales: payload.totales };
      }

      // Wipe previous EXTERNAL_SCRAPE tickets for this draw (full re-sync semantics)
      const del = await prisma.ticket.deleteMany({
        where: { drawId, source: 'EXTERNAL_SCRAPE', apiSystemId: apiSystem.id },
      });

      let imported = 0;
      let skipped = 0;
      for (const row of productRows) {
        const gameItem = await this._resolveGameItem(draw.gameId, row.jugada);
        if (!gameItem) {
          logger.warn(`[maxplay] no GameItem para number='${row.jugada}' en game=${draw.game.slug}; skip`);
          skipped += 1;
          continue;
        }
        try {
          await prisma.ticket.create({
            data: {
              drawId,
              source: 'EXTERNAL_SCRAPE',
              apiSystemId: apiSystem.id,
              externalTicketId: `maxplay-${drawId}-${row.jugada}`,
              totalAmount: row.venta,
              totalPrize: 0,
              status: 'ACTIVE',
              providerData: {
                source: 'maxplay',
                juego_id: juegoId,
                jugada: row.jugada,
                tickets_reportados: row.tickets,
                taquillas: row.taquillas,
                product: row.product,
                fetched_at: payload.fetched_at,
              },
              details: {
                create: [{
                  gameItemId: gameItem.id,
                  amount: row.venta,
                  multiplier: gameItem.multiplier,
                  prize: 0,
                  status: 'ACTIVE',
                }],
              },
            },
          });
          imported += 1;
        } catch (err) {
          logger.error(`[maxplay] error creando ticket jugada=${row.jugada}: ${err.message}`);
          skipped += 1;
        }
      }

      const durationMs = Date.now() - startedAt;
      logger.info(`[maxplay] draw ${drawId} OK — deleted=${del.count} imported=${imported} skipped=${skipped} durationMs=${durationMs}`);
      return {
        ok: true,
        imported,
        deleted: del.count,
        skipped,
        product,
        juegoId,
        totales: payload.totales,
        durationMs,
      };
    });
  }
}

export const maxplayService = new MaxplayService();
export default maxplayService;
