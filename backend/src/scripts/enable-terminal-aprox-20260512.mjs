/**
 * Activar aproximación en TERMINAL PANTERA y recalcular sorteos históricos.
 *
 * Cambio de negocio: el proveedor (virtuales) tiene aproximación habilitada
 * en TERMINAL PANTERA con multiplier 5. Nuestro Game.config no la tenía y
 * por eso 14 tickets reclamados por el proveedor (±1 del ganador) figuraban
 * como LOST.
 *
 * Este script:
 *   1. Actualiza Game.config de TERMINAL PANTERA para añadir
 *      aproximacion: { enabled: true, multiplier: 5 } (idempotente).
 *   2. Detecta todos los TicketDetail LOST en TERMINAL cuyo gameItem es
 *      adyacente al ganador del sorteo (±1, incluido wrap-around 00↔99).
 *   3. Los resetea a ACTIVE para que el processor los re-evalúe.
 *   4. Re-ejecuta processPrizesForDraw sobre cada draw afectado con
 *      skipStatusCheck/skipBalanceUpdate.
 *
 * Soporta --dry-run.
 *
 * Ejecutar:
 *   cd /var/proyectos/tote-web/backend
 *   node src/scripts/enable-terminal-aprox-20260512.mjs --dry-run
 *   node src/scripts/enable-terminal-aprox-20260512.mjs
 */
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import prizeProcessorService from '../services/prize-processor.service.js';

const DRY_RUN = process.argv.includes('--dry-run');
const TERMINAL_SLUG = 'terminal-pantera';
const APROX_CONFIG = { enabled: true, multiplier: 5 };

// Optional --from=YYYY-MM-DD and --to=YYYY-MM-DD (inclusive). Limits which
// draws are reconsidered for backfill. Config update siempre se aplica.
function parseDateArg(prefix) {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) return null;
  const value = arg.slice(prefix.length);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date for ${prefix} — expected YYYY-MM-DD, got "${value}"`);
  }
  return value;
}
const DATE_FROM = parseDateArg('--from=');
const DATE_TO   = parseDateArg('--to=');

function log(msg, data) {
  const stamp = new Date().toISOString();
  if (data !== undefined) console.log(`[${stamp}] ${msg}`, JSON.stringify(data, null, 2));
  else console.log(`[${stamp}] ${msg}`);
}

async function ensureAproxConfig() {
  const game = await prisma.game.findFirst({
    where: { slug: TERMINAL_SLUG },
    select: { id: true, name: true, config: true },
  });
  if (!game) throw new Error(`Game with slug '${TERMINAL_SLUG}' not found`);

  const current = (game.config || {}).aproximacion;
  if (
    current &&
    current.enabled === APROX_CONFIG.enabled &&
    Number(current.multiplier) === APROX_CONFIG.multiplier
  ) {
    log(`Game config already has aproximacion ${JSON.stringify(APROX_CONFIG)} — no change.`);
    return game;
  }

  const newConfig = { ...(game.config || {}), aproximacion: APROX_CONFIG };
  log(`Updating ${game.name} config — adding aproximacion ${JSON.stringify(APROX_CONFIG)}`);
  if (!DRY_RUN) {
    await prisma.game.update({ where: { id: game.id }, data: { config: newConfig } });
  }
  return game;
}

async function detectAproxVictims(gameId, dateFrom, dateTo) {
  // Details LOST cuyo número es adyacente (con wrap-around) al ganador del draw.
  // Casteo a int con regex chequeo para evitar fallar si algún número tiene
  // formato no numérico. Filtros opcionales por rango de drawDate.
  const fromClause = dateFrom ? `AND d."drawDate" >= '${dateFrom}'::date` : '';
  const toClause   = dateTo   ? `AND d."drawDate" <= '${dateTo}'::date`   : '';

  // gameId interpolado vía template tag para parámetro seguro; las fechas
  // ya están validadas por parseDateArg (regex YYYY-MM-DD), por lo que la
  // inyección está acotada.
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT td.id           AS detail_id,
           td."ticketId"   AS ticket_id,
           td."drawId"     AS detail_draw_id,
           t."drawId"      AS ticket_draw_id,
           gi.number       AS apostado,
           wi.number       AS ganador,
           d."drawDate"    AS draw_date,
           td.amount,
           td.multiplier
    FROM "TicketDetail" td
    JOIN "Ticket" t   ON t.id = td."ticketId"
    JOIN "Draw" d     ON d.id = COALESCE(td."drawId", t."drawId")
    JOIN "GameItem" gi ON gi.id = td."gameItemId"
    JOIN "GameItem" wi ON wi.id = d."winnerItemId"
    WHERE d."gameId" = $1
      AND td.status = 'LOST'
      AND gi.number ~ '^[0-9]+$'
      AND wi.number ~ '^[0-9]+$'
      AND (
        ABS(gi.number::int - wi.number::int) = 1
        OR (gi.number::int = 0  AND wi.number::int = 99)
        OR (gi.number::int = 99 AND wi.number::int = 0)
      )
      ${fromClause}
      ${toClause}
    `,
    gameId,
  );
  return rows;
}

async function main() {
  log(`Starting TERMINAL aproximación rollout ${DRY_RUN ? '(DRY-RUN)' : '(EXECUTING)'}`);

  // Paso 1: asegurar config
  const game = await ensureAproxConfig();

  // Paso 2: detectar víctimas
  const rangeMsg = (DATE_FROM || DATE_TO)
    ? ` (range: ${DATE_FROM || '∅'} → ${DATE_TO || '∅'})`
    : ' (all history)';
  log(`Scanning for aprox victims${rangeMsg}...`);
  const victims = await detectAproxVictims(game.id, DATE_FROM, DATE_TO);
  log(`Aprox victims (LOST details ±1 from winner): ${victims.length}`);

  const drawIds = new Set(victims.map((v) => v.detail_draw_id || v.ticket_draw_id));
  log(`Distinct draws to reprocess: ${drawIds.size}`);

  if (DRY_RUN) {
    log('Sample victims (first 10):');
    for (const v of victims.slice(0, 10)) {
      const aproxPrize = (Number(v.amount) * APROX_CONFIG.multiplier).toFixed(2);
      console.log(
        `  detail=${v.detail_id.slice(0, 8)} apostado=${v.apostado} ganador=${v.ganador} ` +
          `amount=${v.amount} → prize=${aproxPrize}`,
      );
    }
    log('DRY-RUN complete — no changes written.');
    return;
  }

  // Paso 3: reset a ACTIVE en bulk
  if (victims.length > 0) {
    log(`Resetting ${victims.length} LOST details to ACTIVE...`);
    const resetResult = await prisma.ticketDetail.updateMany({
      where: { id: { in: victims.map((v) => v.detail_id) } },
      data: { status: 'ACTIVE', prize: 0 },
    });
    log(`Reset ${resetResult.count} details.`);
  } else {
    log('No victims to reset — nothing to do.');
    return;
  }

  // Paso 4: reprocess
  log(`Reprocessing ${drawIds.size} draws with new aproximación config...`);
  let okCount = 0;
  const errors = [];

  for (const drawId of drawIds) {
    try {
      const summary = await prizeProcessorService.processPrizesForDraw(drawId, {
        skipStatusCheck: true,
        skipBalanceUpdate: true,
      });
      okCount++;
      log(
        `  OK ${drawId}  winner=${summary.winnerNumber}  tickets=${summary.totalTickets}  ` +
          `won=${summary.winnersCount}  prizes=${summary.totalPrizesAwarded}`,
      );
    } catch (err) {
      const msg = err?.message ?? String(err);
      errors.push({ drawId, error: msg });
      log(`  FAIL ${drawId} — ${msg}`);
    }
  }

  log(`Reprocess complete: ${okCount} OK, ${errors.length} errors`);
  if (errors.length > 0) {
    log('Errors:', errors);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    logger.error('enable-terminal-aprox-20260512 crashed:', err);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
