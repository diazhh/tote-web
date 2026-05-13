/**
 * Backfill — 2026-05-12
 *
 * Recalcula sorteos afectados por dos bugs del prize-processor:
 *
 * BUG #1 (vivo hasta el fix de hoy): el processor filtraba TicketDetail por
 *   `ticket: { drawId }` cuando debía filtrar por `TicketDetail.drawId`.
 *   Consecuencia: tickets multi-play (un mismo ticket con jugadas en
 *   distintos sorteos) tenían sus details "extraños" comparados contra el
 *   ganador del sorteo equivocado y marcados LOST. Cuando el sorteo correcto
 *   cerraba luego, el processor ya no los veía (filtro status='ACTIVE').
 *
 * BUG #2 (histórico, pre-deploy 2026-05-11): 21 draws entre 2026-04-26 y
 *   2026-05-10 pasaron a status DRAWN pero el prize-processor nunca corrió
 *   (won=0, lost=0, todos los tickets quedaron ACTIVE). El deploy del 2026-05-11
 *   resolvió la causa de nuevos casos. Falta limpiar los stranded.
 *
 * Estrategia:
 *   1. BUG #1: detectar details LOST que en realidad coinciden con el ganador
 *      de su propio sorteo (td.gameItemId == td.draw.winnerItemId) y donde
 *      el ticket está atado a OTRO sorteo (ticket.drawId != td.drawId).
 *      Resetearlos a status=ACTIVE.
 *   2. BUG #2: identificar draws en DRAWN con tickets ACTIVE (excluyendo
 *      tripletas externas SRQ que tienen lógica separada).
 *   3. Para cada draw afectado (union de #1 y #2), invocar
 *      processPrizesForDraw con skipStatusCheck=true. Como ahora todos los
 *      tickets afectados son WEBHOOK_PUSH sin userId, pasamos también
 *      skipBalanceUpdate=true por defensa.
 *
 * Idempotente: una segunda ejecución encuentra 0 details ACTIVE y 0 reset
 * targets, no cambia nada.
 *
 * Soporta --dry-run para imprimir el plan sin escribir nada.
 *
 * Ejecutar:
 *   cd /var/proyectos/tote-web/backend
 *   node src/scripts/backfill-prize-bugs-20260512.mjs --dry-run   # plan
 *   node src/scripts/backfill-prize-bugs-20260512.mjs             # ejecutar
 */
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import prizeProcessorService from '../services/prize-processor.service.js';

const DRY_RUN = process.argv.includes('--dry-run');

function log(msg, data) {
  const stamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${stamp}] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${stamp}] ${msg}`);
  }
}

async function detectBug1Victims() {
  // Details LOST cuyo gameItem coincide con el ganador del draw del propio
  // detail, pero el ticket está atado a OTRO draw (la pista del bug #1).
  const rows = await prisma.$queryRaw`
    SELECT td.id           AS detail_id,
           td."ticketId"   AS ticket_id,
           td."drawId"     AS detail_draw_id,
           t."drawId"      AS ticket_draw_id,
           td.amount,
           td.multiplier
    FROM "TicketDetail" td
    JOIN "Ticket" t ON t.id = td."ticketId"
    JOIN "Draw" d   ON d.id = td."drawId"
    WHERE td.status = 'LOST'
      AND td."gameItemId" = d."winnerItemId"
      AND t."drawId" != td."drawId"
  `;
  return rows;
}

async function detectBug2Draws() {
  // Draws cuyos TicketDetail ACTIVE apuntan a ellos (directamente via td.drawId
  // o indirectamente via ticket.drawId cuando td.drawId es NULL). Esto cubre
  // tanto stranded por bug#2 puro como tickets multi-play con un detail
  // huérfano en un draw distinto al ticket.drawId.
  // Excluye tripletas externas (lógica de premio distinta).
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT d.id, d."drawDate", d."drawTime"
    FROM "TicketDetail" td
    JOIN "Ticket" t ON t.id = td."ticketId"
    JOIN "Draw" d ON d.id = COALESCE(td."drawId", t."drawId")
    WHERE td.status = 'ACTIVE'
      AND d.status = 'DRAWN'
      AND NOT (
        t.source = 'EXTERNAL_API'
        AND t."providerData" IS NOT NULL
        AND (t."providerData"->>'type') = 'TRIPLETA'
      )
    ORDER BY d."drawDate", d."drawTime"
  `;
  return rows;
}

async function main() {
  log(`Starting backfill ${DRY_RUN ? '(DRY-RUN)' : '(EXECUTING)'}`);

  // --- Discovery ---
  const bug1Victims = await detectBug1Victims();
  log(`BUG#1 victims (LOST details that should be ACTIVE+WON): ${bug1Victims.length}`);

  const bug1DrawIds = new Set(bug1Victims.map((v) => v.detail_draw_id));
  log(`BUG#1 distinct draws to reprocess: ${bug1DrawIds.size}`);

  const bug2Draws = await detectBug2Draws();
  log(`BUG#2 draws with stranded ACTIVE tickets: ${bug2Draws.length}`);

  const bug2DrawIds = new Set(bug2Draws.map((d) => d.id));

  const allDrawIds = new Set([...bug1DrawIds, ...bug2DrawIds]);
  log(`Total distinct draws to reprocess: ${allDrawIds.size}`);

  if (DRY_RUN) {
    log('DRY-RUN — printing draw breakdown:');
    for (const d of bug2Draws) {
      console.log(
        `  bug#2: ${d.id}  ${new Date(d.drawDate).toISOString().slice(0, 10)} ${d.drawTime}`,
      );
    }
    const onlyBug1 = [...bug1DrawIds].filter((id) => !bug2DrawIds.has(id));
    log(`Draws only affected by bug #1 (need pre-reset): ${onlyBug1.length}`);
    for (const id of onlyBug1) {
      console.log(`  bug#1-only: ${id}`);
    }
    log('DRY-RUN complete — no changes written. Re-run without --dry-run.');
    return;
  }

  // --- Phase 1: reset bug#1 victims to ACTIVE in one transaction ---
  if (bug1Victims.length > 0) {
    log(`Resetting ${bug1Victims.length} bug#1 LOST details back to ACTIVE...`);
    const victimIds = bug1Victims.map((v) => v.detail_id);
    const resetResult = await prisma.ticketDetail.updateMany({
      where: { id: { in: victimIds } },
      data: { status: 'ACTIVE', prize: 0 },
    });
    log(`Reset ${resetResult.count} details.`);
  } else {
    log('No bug#1 victims to reset.');
  }

  // --- Phase 2: reprocess each affected draw ---
  log(`Reprocessing ${allDrawIds.size} draws...`);
  let okCount = 0;
  const errors = [];

  for (const drawId of allDrawIds) {
    try {
      const summary = await prizeProcessorService.processPrizesForDraw(drawId, {
        skipStatusCheck: true,
        skipBalanceUpdate: true,
      });
      okCount++;
      log(
        `  OK ${drawId}  game=${summary.gameName}  winner=${summary.winnerNumber}  ` +
          `tickets=${summary.totalTickets}  won=${summary.winnersCount}  lost=${summary.losersCount}  ` +
          `prizes=${summary.totalPrizesAwarded}`,
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
    logger.error('backfill-prize-bugs-20260512 crashed:', err);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
