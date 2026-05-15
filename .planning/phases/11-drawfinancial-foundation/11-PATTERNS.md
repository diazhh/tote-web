# Phase 11: DrawFinancial Foundation - Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 9 (3 NEW + 1 NEW script + 1 MODIFIED schema + 4 MODIFIED queue/config files)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/prisma/schema.prisma` (ADD models) | model (NEW) | persistence (Decimal aggregate) | `model DrawStats` (line 1104) | exact |
| `backend/src/queue/workers/calculate-draw-financials.worker.js` | worker (NEW) | event-driven, two-phase | `step-calculate-stats.worker.js` (parallel output) + `step-process-prizes.worker.js` (chain) | exact |
| `backend/src/services/draw-financial.service.js` | service (NEW) | aggregate + upsert, pure function | `draw-stats.service.js` (calculateDrawStats) | role-match (must DIFFER on agg key — TicketDetail.drawId, not Ticket.drawId) |
| `backend/src/scripts/backfill-draw-financials.mjs` | script (NEW) | batch, chunked, resumable, dry-run-gated | `backfill-prize-bugs-20260512.mjs` | role-match (extend dry-run pattern with `--confirm`) |
| `backend/src/queue/constants.js` | config (MODIFIED) | static config | self (`STEP_CALCULATE_STATS` block) | exact |
| `backend/src/queue/register.js` | bootstrap (MODIFIED) | startup registration | self (`PGBOSS_EXECUTE_DRAW` block, lines 75-91) | exact |
| `backend/src/queue/workers/close-and-ingest.worker.js` | worker (MODIFIED) | best-effort chain | self (existing best-effort `try { SRQ } catch` pattern at lines 30-34, 60, 169) | exact |
| `backend/src/queue/workers/step-process-prizes.worker.js` | worker (MODIFIED) | parallel chain | self (existing `boss.send(STEP_CALCULATE_STATS)` at lines 19-23 + 42-46) | exact |
| `backend/package.json` | manifest (MODIFIED) | dependency add | self (existing `dependencies` block) | exact |

---

## Pattern Assignments

### 1. `backend/prisma/schema.prisma` — ADD `DrawFinancial` + `DrawFinancialProvider` models

**Role:** model (NEW)
**Analog:** existing `model DrawStats` at `backend/prisma/schema.prisma:1104-1135` — closest in shape (one-row-per-draw aggregate with Decimal amounts), and it co-exists with the new `DrawFinancial` as a parallel output.

**Copy this exact Decimal precision + index + relation pattern** (from `schema.prisma:1104-1135`):
```prisma
model DrawStats {
  id     String @id @default(uuid())
  drawId String @unique

  // Ventas
  totalSales  Decimal @default(0) @db.Decimal(12, 2) // Total vendido
  ticketCount Int     @default(0) // Cantidad de tickets
  detailCount Int     @default(0) // Cantidad de jugadas

  // Premios
  totalPrize  Decimal @default(0) @db.Decimal(12, 2) // Total en premios
  winnerCount Int     @default(0) // Cantidad de ganadores

  // Balance
  grossProfit  Decimal @default(0) @db.Decimal(12, 2) // Ganancia bruta (ventas - premios)

  // Timestamps
  calculatedAt DateTime @default(now()) // Última vez que se calculó
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  draw Draw @relation(fields: [drawId], references: [id], onDelete: Cascade)

  @@index([drawId])
  @@index([calculatedAt])
}
```

**Conventions to mirror in DrawFinancial:**
- `id String @id @default(uuid())`
- `drawId String @unique` (idempotency key)
- `Decimal @default(0) @db.Decimal(12, 2)` for all amounts (totalSales, totalPrize, utility) — **F-4 reminder:** commission tables in Phase 12 will use `@db.Decimal(18, 8)`; Phase 11 sticks to `(12, 2)` to match existing DrawStats and accounting-report.
- `createdAt`/`updatedAt` (`@default(now())` + `@updatedAt`).
- Cascade relation `draw Draw @relation(fields: [drawId], references: [id], onDelete: Cascade)`.
- `@@index([drawId])` plus a time-series index (planner choice: `@@index([totalizedAt])` for D-05 weekly P&L queries).

**For `DrawFinancialProvider`** — composite unique with nullable FK (D-08):
- Compare with `ProviderStats` at `schema.prisma:1148-1180`, which uses `@@unique([level, entityId, drawId])`.
- `apiSystemId String?` (nullable) — points to `ApiSystem` (see `schema.prisma:426-450`).
- Standard `@@unique([drawId, apiSystemId])` — but worker MUST use explicit `findFirst` + update/create for the NULL-apiSystemId row (Postgres treats NULLs as distinct in unique indices). See worker pattern below.
- Relation: `apiSystem ApiSystem? @relation(fields: [apiSystemId], references: [id])` — mirror the optional FK pattern from `Ticket.apiSystem` at `schema.prisma:980`.
- Add reciprocal `drawFinancials DrawFinancialProvider[]` to `ApiSystem` (line 444 area) and `financialProviders DrawFinancialProvider[]` plus `financial DrawFinancial?` to `Draw` (lines 145-154 relation block).

**`Draw.prizesProcessed` boolean already exists** at `schema.prisma:135` — the new worker reads it (F-1 guard). Do NOT add new flags to Draw.

---

### 2. `backend/src/queue/workers/calculate-draw-financials.worker.js` — NEW worker (two-phase routing)

**Role:** worker (NEW, event-driven, two-phase)
**Analog (shape):** `backend/src/queue/workers/step-calculate-stats.worker.js` — exact match for "parallel-output worker that upserts a per-draw aggregate." Same imports, same `Array.isArray(jobs) ? jobs[0] : jobs` unwrap, same idempotency-check-first style, same `prisma.draw.findUnique({ select })` pattern.

**Full file to copy structurally** (`step-calculate-stats.worker.js:1-29`):
```javascript
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import drawStatsService from '../../services/draw-stats.service.js';

export async function stepCalculateStatsWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data;

  // Idempotencia
  const draw = await prisma.draw.findUnique({ where: { id: drawId }, select: { statsCalculated: true } });
  if (!draw) throw new Error(`Draw ${drawId} no encontrado`);

  if (draw.statsCalculated) {
    logger.info(`[step-calculate-stats] Draw ${drawId} stats ya calculadas, saltando`);
    return { skipped: true, reason: 'already_calculated' };
  }

  logger.info(`[step-calculate-stats] Calculando estadísticas para draw ${drawId}...`);
  await drawStatsService.calculateAllStats(drawId);

  await prisma.draw.update({
    where: { id: drawId },
    data: { statsCalculated: true, pipelineStatus: 'COMPLETED' },
  });

  logger.info(`[step-calculate-stats] Estadísticas guardadas para draw ${drawId}`);
  return { success: true, drawId };
}
```

**Adapt for Phase 11 (D-13, D-14, F-1, F-13):**
- Export `calculateDrawFinancialsWorker(jobs)` — service-function pattern, NOT a Croner-style class (F-13).
- Unwrap `jobs[0]`, destructure `{ drawId, phase }` from `job.data`.
- Load draw with the fields needed for both phases: `select: { prizesProcessed: true, closedAt: true, drawnAt: true }`. `if (!draw) throw new Error(...)`.
- Branch on `phase`:
  - `'SALES'`: call `drawFinancialService.computeAndUpsertSales(drawId, draw.closedAt)`.
  - `'PRIZES'`: **F-1 guard** — `if (!draw.prizesProcessed) throw new PrizesNotProcessedError('prizes not processed for draw ' + drawId)` (do NOT silently write zero). Then `drawFinancialService.computeAndUpsertPrizes(drawId, draw.drawnAt)`.
  - default: throw `new Error('unknown phase: ' + phase)`.
- Idempotency for SALES re-runs: the service's upsert handles it. Idempotency for PRIZES: re-run is fine because `totalizedAt` overwrite is identical (frozen-only-AFTER-totalizedAt is enforced at re-trigger boundary in close-and-ingest's best-effort guard — D-16/D-18). No `statsCalculated`-style flag needed.

---

### 3. `backend/src/services/draw-financial.service.js` — NEW service (pure functions, aggregation)

**Role:** service (NEW, CRUD/aggregate)
**Analog:** `backend/src/services/accounting-report.service.js` — same aggregation domain. **Phase 11 must DIFFER from it on the aggregation key.**

**❌ ANTI-PATTERN to AVOID — the multi-draw attribution bug (F-3) lives here** (`accounting-report.service.js:100-157`):
```javascript
// THIS IS THE BUG — DO NOT REPLICATE
const draws = await prisma.draw.findMany({
  where: drawWhere,
  include: {
    game: { select: { id: true, name: true } },
    tickets: ticketsInclude,  // ← aggregates via Ticket.drawId (wrong for multi-draw webhook tickets)
  },
  ...
});

for (const draw of draws) {
  const tickets = draw.tickets || [];
  const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);  // ← overcounts
  ...
  row.totalSales += totalSales;
  row.totalPrize += totalPrize;
  row.utility += totalSales - totalPrize;
  row.ticketCount += tickets.length;
}
```

**✅ Correct pattern for the new service (F-3 fix, FIN-AGG-03):** aggregate via `TicketDetail.drawId`, joined to Ticket only for `status != 'CANCELLED'` and `apiSystemId` grouping.

Reference SQL (from PITFALLS.md F-3, line 56-64):
```sql
SELECT SUM(td.amount) AS totalSales,
       COUNT(DISTINCT td.ticketId) AS ticketCount
FROM "TicketDetail" td
JOIN "Ticket" t ON t.id = td."ticketId"
WHERE td."drawId" = :drawId
  AND t.status != 'CANCELLED'
```

**Recommended Prisma equivalent:**
```javascript
// Total + count
const salesAgg = await prisma.ticketDetail.aggregate({
  where: {
    drawId,
    ticket: { status: { not: 'CANCELLED' } },
  },
  _sum: { amount: true, prize: true },
});
const ticketCount = await prisma.ticketDetail.findMany({
  where: { drawId, ticket: { status: { not: 'CANCELLED' } } },
  distinct: ['ticketId'],
  select: { ticketId: true },
}).then(r => r.length);

// Per-provider breakdown via groupBy
const byProvider = await prisma.$queryRaw`
  SELECT t."apiSystemId" AS "apiSystemId",
         SUM(td.amount)::numeric(12,2) AS "totalSales",
         SUM(td.prize)::numeric(12,2)  AS "totalPrize",
         COUNT(DISTINCT td."ticketId")::int AS "ticketCount"
  FROM "TicketDetail" td
  JOIN "Ticket" t ON t.id = td."ticketId"
  WHERE td."drawId" = ${drawId}
    AND t.status != 'CANCELLED'
  GROUP BY t."apiSystemId"
`;
// Rows where apiSystemId IS NULL = TAQUILLA_ONLINE bucket (D-06, D-07 "Taquilla / Online")
```

**Imports + module shape** (mirror `accounting-report.service.js:1-7` and `draw-stats.service.js:1-4`):
```javascript
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
```
Export `default new DrawFinancialService();` (mirrors accounting-report) OR plain named exports — planner discretion, but mirror existing service style.

**Idempotent upsert pattern for `DrawFinancial`:**
```javascript
await prisma.drawFinancial.upsert({
  where: { drawId },
  update: { totalSales, ticketCount, closedAt },     // phase SALES fields
  create: { drawId, totalSales, ticketCount, closedAt },
});
```

**Idempotent upsert pattern for `DrawFinancialProvider` with nullable apiSystemId (D-08, CRITICAL):**
```javascript
// Cannot use prisma.upsert with @@unique([drawId, apiSystemId]) when apiSystemId IS NULL —
// Postgres treats NULLs as distinct, so upsert would always insert. Explicit pattern:
for (const row of byProvider) {
  const existing = await prisma.drawFinancialProvider.findFirst({
    where: { drawId, apiSystemId: row.apiSystemId ?? null },
  });
  if (existing) {
    await prisma.drawFinancialProvider.update({
      where: { id: existing.id },
      data: { totalSales: row.totalSales, ticketCount: row.ticketCount },
    });
  } else {
    await prisma.drawFinancialProvider.create({
      data: { drawId, apiSystemId: row.apiSystemId ?? null, totalSales: row.totalSales, ticketCount: row.ticketCount },
    });
  }
}
```

**Error class for F-1 surfacing** — define at top of file:
```javascript
export class PrizesNotProcessedError extends Error {
  constructor(drawId) {
    super(`Draw ${drawId} prizes not processed — cannot compute totalPrize/utility`);
    this.name = 'PrizesNotProcessedError';
  }
}
```

---

### 4. `backend/src/scripts/backfill-draw-financials.mjs` — NEW chunked + resumable backfill

**Role:** script (NEW, batch + dry-run-gated)
**Analog:** `backend/src/scripts/backfill-prize-bugs-20260512.mjs` — exact shape match (dry-run flag, header comment, log helper, prisma disconnect in finally).

**Imports + dry-run flag + log helper** (copy from `backfill-prize-bugs-20260512.mjs:40-53`):
```javascript
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

const DRY_RUN = process.argv.includes('--dry-run');

function log(msg, data) {
  const stamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${stamp}] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${stamp}] ${msg}`);
  }
}
```

**Main + finally cleanup** (copy from `backfill-prize-bugs-20260512.mjs:176-184`):
```javascript
main()
  .catch((err) => {
    logger.error('backfill-draw-financials crashed:', err);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Dry-run early-exit pattern** (lines 116-130):
```javascript
if (DRY_RUN) {
  log('DRY-RUN — printing draw breakdown:');
  // ... print samples + totals ...
  log('DRY-RUN complete — no changes written. Re-run without --dry-run.');
  return;
}
```

**Phase 11 EXTENSIONS the analog doesn't have (D-01, D-02, D-04, F-10):**

1. **Required dry-run gate + `--confirm` flag (D-02):**
```javascript
const CONFIRM = process.argv.includes('--confirm');
if (!DRY_RUN && !CONFIRM) {
  console.error('Refusing to write without --confirm. Run with --dry-run first, inspect output, then re-run with --confirm.');
  process.exit(2);
}
```

2. **Enum verification FIRST line (F-10 — must run before any other DB query):**
```javascript
const enumValues = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"DrawStatus")) AS v`;
const hasPublished = enumValues.some(r => r.v === 'PUBLISHED');
if (hasPublished) {
  throw new Error('Unexpected PUBLISHED enum value — DB not migrated. Aborting.');
}
log(`DrawStatus enum verified: ${enumValues.map(r => r.v).join(', ')}`);
```

3. **Chunked + resumable loop (D-01) — chunk size 100, checkpoint via DB query "what's already populated":**
```javascript
const CHUNK_SIZE = 100;
// Resumable: skip draws that already have a DrawFinancial row with totalizedAt set
const remaining = await prisma.$queryRaw`
  SELECT d.id, d."drawnAt"
  FROM "Draw" d
  LEFT JOIN "DrawFinancial" df ON df."drawId" = d.id
  WHERE d.status = 'DRAWN'              -- F-10: no PUBLISHED
    AND d."prizesProcessed" = true
    AND (df."totalizedAt" IS NULL)
  ORDER BY d."drawDate" ASC, d."drawTime" ASC
`;
log(`Draws remaining to backfill: ${remaining.length}`);

let processed = 0;
for (let i = 0; i < remaining.length; i += CHUNK_SIZE) {
  const batch = remaining.slice(i, i + CHUNK_SIZE);
  for (const draw of batch) {
    // D-05: pass drawnAt as totalizedAt for historical rows
    await drawFinancialService.computeAndUpsertSales(draw.id, /* closedAt fallback */);
    await drawFinancialService.computeAndUpsertPrizes(draw.id, draw.drawnAt);
    processed++;
  }
  log(`Chunk ${i / CHUNK_SIZE + 1}: processed ${processed}/${remaining.length}`);
}
```

4. **Full reconciliation CSV (D-04) — write to `backend/storage/backfill-reports/draw-financial-recon-{timestamp}.csv`:**
```javascript
import fs from 'fs/promises';
import path from 'path';

const reportDir = path.join(process.cwd(), 'storage', 'backfill-reports');
await fs.mkdir(reportDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = path.join(reportDir, `draw-financial-recon-${ts}.csv`);

const reconRows = await prisma.$queryRaw`
  SELECT df."drawId",
         df."totalSales"::text AS materialized_sales,
         (SELECT COALESCE(SUM(td.amount), 0)::numeric(12,2)
          FROM "TicketDetail" td
          JOIN "Ticket" t ON t.id = td."ticketId"
          WHERE td."drawId" = df."drawId"
            AND t.status != 'CANCELLED')::text AS live_sales
  FROM "DrawFinancial" df
`;
const csvLines = ['drawId,materialized_sales,live_sales,diff'];
let mismatches = 0;
for (const r of reconRows) {
  const diff = Number(r.materialized_sales) - Number(r.live_sales);
  if (diff !== 0) mismatches++;
  csvLines.push(`${r.drawId},${r.materialized_sales},${r.live_sales},${diff}`);
}
await fs.writeFile(reportPath, csvLines.join('\n'));
log(`Reconciliation CSV: ${reportPath} — mismatches=${mismatches}`);
if (mismatches > 0) process.exitCode = 1;
```

---

### 5. `backend/src/queue/constants.js` — MODIFIED: add 2 queue names + configs

**Role:** config (MODIFIED, additive)
**Analog:** self — copy the exact shape of `STEP_CALCULATE_STATS` entries.

**QUEUES block** (existing pattern at `constants.js:1-28`) — add two lines:
```javascript
export const QUEUES = {
  ...
  STEP_CALCULATE_STATS: 'step-calculate-stats',
  CALCULATE_DRAW_FINANCIALS: 'calculate-draw-financials',           // NEW (D-13)
  CALCULATE_PROVIDER_COMMISSION: 'calculate-provider-commission',   // NEW placeholder for Phase 12 (D-15)
  ...
};
```

**QUEUE_CONFIGS block** (D-12: same shape as `STEP_CALCULATE_STATS` at lines 97-102):
```javascript
[QUEUES.STEP_CALCULATE_STATS]: {
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  expireInMinutes: 2,
},
// ADD:
[QUEUES.CALCULATE_DRAW_FINANCIALS]: {
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  expireInMinutes: 3,        // slightly larger window — two-phase + per-provider upserts
},
[QUEUES.CALCULATE_PROVIDER_COMMISSION]: {
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  expireInMinutes: 2,
},
```

---

### 6. `backend/src/queue/register.js` — MODIFIED: register both workers (F-11 mandatory)

**Role:** bootstrap (MODIFIED, additive)
**Analog:** self — copy the `PGBOSS_EXECUTE_DRAW` block at `register.js:66-92` (exact `createQueue` → `work` ordering F-11 demands).

**Reference pattern to mirror** (F-11 — createQueue BEFORE work):
```javascript
// register.js:75-90 — the gold-standard pattern
await boss.createQueue(QUEUES.EXECUTE_DRAW_SWEEP);
await boss.createQueue(QUEUES.EXECUTE_DRAW);
await boss.createQueue(QUEUES.STEP_GENERATE_IMAGE);
await boss.createQueue(QUEUES.STEP_NOTIFY_ADMINS);
await boss.createQueue(QUEUES.STEP_PUBLISH_DRAW);
await boss.createQueue(QUEUES.STEP_PROCESS_PRIZES);
await boss.createQueue(QUEUES.STEP_CALCULATE_STATS);

const parallel = { teamSize: 3, teamConcurrency: 3 };
await boss.work(QUEUES.EXECUTE_DRAW_SWEEP, QUEUE_CONFIGS[QUEUES.EXECUTE_DRAW_SWEEP], executeDrawSweepWorker);
...
await boss.work(QUEUES.STEP_CALCULATE_STATS, { ...QUEUE_CONFIGS[QUEUES.STEP_CALCULATE_STATS], ...parallel }, stepCalculateStatsWorker);
```

**Important context** — there's already a self-warning in this file (`register.js:127-141`) about pg-boss v10 not auto-creating queues:
```javascript
// pg-boss v10 NO crea la cola con boss.work() — FIX del bug latente
// (los boss.send() del cron Croner sync-scrape-tickets.job.js fallaban silente).
await boss.createQueue(QUEUES.SYNC_SCRAPE_TICKETS);
await boss.work(QUEUES.SYNC_SCRAPE_TICKETS, QUEUE_CONFIGS[QUEUES.SYNC_SCRAPE_TICKETS], syncScrapeTicketsWorker);
```

**Phase 11 additions** — place inside an existing or new env-flag block (since Phase 11 may run without a dedicated `PGBOSS_DRAW_FINANCIALS` flag per CLAUDE.md note "PGBOSS_* env flags are no longer load-bearing"). Recommend NO flag (always-on) and add a dedicated logger.info line:
```javascript
// Phase 11: DrawFinancial materialization + Phase 12 placeholder
const { calculateDrawFinancialsWorker } = await import('./workers/calculate-draw-financials.worker.js');

await boss.createQueue(QUEUES.CALCULATE_DRAW_FINANCIALS);
await boss.createQueue(QUEUES.CALCULATE_PROVIDER_COMMISSION); // D-15 placeholder

await boss.work(
  QUEUES.CALCULATE_DRAW_FINANCIALS,
  QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS],
  calculateDrawFinancialsWorker,
);

// Phase 12 placeholder — no-op worker, logs only, NEVER throws (D-15)
await boss.work(
  QUEUES.CALCULATE_PROVIDER_COMMISSION,
  QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION],
  async (jobs) => {
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    logger.info(`[calculate-provider-commission] phase-12 placeholder, drawId=${job.data?.drawId}`);
    return { placeholder: true };
  },
);
logger.info('[pg-boss] Workers calculate-draw-financials + commission-placeholder registrados');
```

**Smoke test after deploy** (from PITFALLS.md F-11):
```sql
SELECT name FROM pgboss.queue WHERE name LIKE 'calculate-%';
-- Must return: calculate-draw-financials, calculate-provider-commission
```

---

### 7. `backend/src/queue/workers/close-and-ingest.worker.js` — MODIFIED: phase-SALES trigger (D-10)

**Role:** worker (MODIFIED — surgical addition)
**Analog:** self — the file already uses best-effort try/catch for downstream side effects.

**Existing best-effort pattern to mirror** (`close-and-ingest.worker.js:29-35`):
```javascript
let imported = 0;
try {
  const r = await apiIntegrationService.importSRQTickets(draw.id, { allowClosed: true });
  imported = r.imported || 0;
} catch (e) {
  logger.warn(`[close-and-ingest:terminal] SRQ falló: ${e.message}`);
}
```

And from `close-and-ingest.worker.js:155-170`:
```javascript
try {
  await adminNotificationService.notifyPrewinnerSelected({ ... });
} catch (e) {
  logger.warn(`[close-and-ingest] notify admin_preselect falló: ${e.message}`);
}
```

**Phase 11 addition** — after the atomic `updateMany` succeeds and `auditLog.create` runs, but BEFORE returning. Two insertion points (CLI-09 → `closeTerminalDraw` at line 73 just before `return`, and the main normal-path return at line 205):

```javascript
import { getBoss } from '../boss.js';                          // ADD import at top
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';       // ADD import at top

// ... after atomic close + auditLog (BEFORE the final return) ...

// Phase 11: fire-and-forget phase-SALES trigger. Never blocks the close.
try {
  const boss = getBoss();
  await boss.send(
    QUEUES.CALCULATE_DRAW_FINANCIALS,
    { drawId, phase: 'SALES' },
    {
      singletonKey: `df-sales-${drawId}`,
      ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS],
    },
  );
} catch (e) {
  logger.warn(`[close-and-ingest] df-sales trigger falló (best-effort): ${e.message}`);
}
```

**Apply to BOTH return paths:**
- Line ~72 (inside `closeTerminalDraw`, before `return { closed: true, method: 'terminal', ... }`)
- Line ~204 (main normal path, before `return { closed: true, method: 'awaiting_preselect', ... }`)
- Line ~173 (admin_preselect path, before `return { closed: true, method: 'admin_preselect' }`)

---

### 8. `backend/src/queue/workers/step-process-prizes.worker.js` — MODIFIED: phase-PRIZES parallel trigger (D-11)

**Role:** worker (MODIFIED — surgical addition next to existing send)
**Analog:** self — file already has `boss.send(QUEUES.STEP_CALCULATE_STATS, ...)` and the imports are already in place.

**Existing pattern to mirror EXACTLY** (`step-process-prizes.worker.js:42-46`):
```javascript
// Encolar último paso
const boss = getBoss();
await boss.send(QUEUES.STEP_CALCULATE_STATS, { drawId }, {
  singletonKey: `stats-${drawId}`,
  ...QUEUE_CONFIGS[QUEUES.STEP_CALCULATE_STATS],
});
```

**Phase 11 addition** — add a parallel `boss.send` right after the STEP_CALCULATE_STATS one (both at line ~46 in the main success path AND at line ~23 in the already-processed re-entry path):
```javascript
const boss = getBoss();
await boss.send(QUEUES.STEP_CALCULATE_STATS, { drawId }, {
  singletonKey: `stats-${drawId}`,
  ...QUEUE_CONFIGS[QUEUES.STEP_CALCULATE_STATS],
});

// Phase 11: parallel-trigger DrawFinancial phase PRIZES (D-11)
await boss.send(QUEUES.CALCULATE_DRAW_FINANCIALS, { drawId, phase: 'PRIZES' }, {
  singletonKey: `df-prizes-${drawId}`,
  ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS],
});
```

No try/catch wrapping needed here — `STEP_CALCULATE_STATS` is already not wrapped (failures in the send propagate, pg-boss retries the whole worker). DrawFinancial trigger follows the same convention since it runs after `prizesProcessed = true` is already committed (the upstream draw state is final).

**Imports already present** in this file — `import { getBoss } from '../boss.js'` and `import { QUEUES, QUEUE_CONFIGS } from '../constants.js'` (lines 4-5). No new imports needed.

---

### 9. `backend/package.json` — MODIFIED: add `decimal.js`

**Role:** manifest (MODIFIED, additive)
**Analog:** self — the existing `dependencies` block at `package.json:49-81`.

**Existing dependencies pattern (alphabetical by convention):**
```json
"dependencies": {
  "@hapi/boom": "^10.0.1",
  "@prisma/client": "^6.16.3",
  ...
  "date-fns": "^4.1.0",
  ...
}
```

**Add** (inserted alphabetically between `date-fns-tz` and `dotenv`):
```json
"decimal.js": "^10.6.0",
```

**Note:** Phase 11's amounts use Prisma's `Decimal` type (Decimal.js under the hood via `@prisma/client`), so `decimal.js` is mainly needed for backfill arithmetic operations (rounding, addition without float drift) and worker-side computations. CLAUDE.md says no multer for Phase 11 (that's Phase 13).

---

## Shared Patterns

### Prisma Singleton Import
**Source:** `backend/src/lib/prisma.js`
**Apply to:** worker, service, script
```javascript
import { prisma } from '../../lib/prisma.js';   // workers (2 levels deep)
import { prisma } from '../lib/prisma.js';      // services + scripts (1 level deep)
```

### Winston Logger
**Source:** `backend/src/lib/logger.js`
**Apply to:** worker, service, script
```javascript
import logger from '../../lib/logger.js';  // workers
import logger from '../lib/logger.js';     // services, scripts
// Usage:
logger.info(`[calculate-draw-financials] Phase ${phase} for draw ${drawId}...`);
logger.warn(`[close-and-ingest] df-sales trigger falló: ${e.message}`);
logger.error(`[backfill] crashed:`, err);
```

### pg-boss v10 Handler Signature (mandatory unwrap)
**Source:** Every worker file (`step-calculate-stats.worker.js:6-7`, `step-process-prizes.worker.js:7-9`)
**Apply to:** new `calculate-draw-financials.worker.js`
```javascript
export async function calculateDrawFinancialsWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId, phase } = job.data;
  ...
}
```

### `boss.send()` with singletonKey + QUEUE_CONFIGS spread
**Source:** `step-process-prizes.worker.js:42-46`, `:19-23`
**Apply to:** modifications in `close-and-ingest.worker.js` and `step-process-prizes.worker.js`
```javascript
await boss.send(
  QUEUES.CALCULATE_DRAW_FINANCIALS,
  { drawId, phase: 'SALES' },
  {
    singletonKey: `df-sales-${drawId}`,   // dedup: same drawId+phase only enqueued once at a time
    ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS],
  },
);
```

### Idempotency: `prisma.draw.findUnique({ where, select })` then early return
**Source:** `step-calculate-stats.worker.js:11-17`, `step-process-prizes.worker.js:13-25`
**Apply to:** new worker
```javascript
const draw = await prisma.draw.findUnique({
  where: { id: drawId },
  select: { prizesProcessed: true, closedAt: true, drawnAt: true },
});
if (!draw) throw new Error(`Draw ${drawId} no encontrado`);
```

### F-11 — `boss.createQueue()` BEFORE `boss.work()`
**Source:** `register.js:75-90` (EXECUTE_DRAW block), `:127-132` (SYNC_SCRAPE_TICKETS with explicit warning comment)
**Apply to:** any new queue registration. MANDATORY. Smoke-test post-deploy with `SELECT name FROM pgboss.queue`.

### Dry-run gating in scripts
**Source:** `backfill-prize-bugs-20260512.mjs:44`, `:116-130`
**Apply to:** new backfill script (extended with `--confirm` per D-02)
```javascript
const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = process.argv.includes('--confirm');
if (!DRY_RUN && !CONFIRM) {
  console.error('Refusing to write without --confirm.');
  process.exit(2);
}
// ... compute everything ...
if (DRY_RUN) {
  log('DRY-RUN complete — no changes written.');
  return;
}
```

### Script entry/exit boilerplate
**Source:** `backfill-prize-bugs-20260512.mjs:176-184`
**Apply to:** new backfill script
```javascript
main()
  .catch((err) => {
    logger.error('backfill-draw-financials crashed:', err);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## No Analog Found

All Phase 11 files have strong analogs. **One conceptual gap** that the planner should note (not a missing analog but a "DIFFER FROM" requirement):

| File | Role | Concern | Note |
|------|------|---------|------|
| `backend/src/services/draw-financial.service.js` | service | Aggregation key | Must aggregate via `TicketDetail.drawId` (NOT `Ticket.drawId`). The closest analog `accounting-report.service.js:100-157` aggregates the WRONG way (this is the F-3 bug). The new service is intentionally the inverse of the analog. Planner should not say "follow accounting-report"; planner should say "follow Prisma + Winston imports of accounting-report but invert its aggregation to use TicketDetail." |

---

## Metadata

**Analog search scope:**
- `backend/src/queue/workers/*.js` (all 17 workers scanned)
- `backend/src/queue/register.js`, `constants.js`, `boss.js`
- `backend/src/services/accounting-report.service.js`, `draw-stats.service.js`
- `backend/src/scripts/*.mjs` (backfill-prize-bugs, enable-terminal-aprox)
- `backend/prisma/schema.prisma` (DrawStats, ProviderStats, Draw, Ticket, TicketDetail, ApiSystem models)
- `backend/src/lib/prisma.js`, `logger.js`
- `backend/src/scripts/trigger-pgboss-cron.mjs` (ALLOWED_QUEUES — Phase 11 does NOT modify this since both new queues are event-chained, not cron-driven)

**Files scanned:** ~25
**Pattern extraction date:** 2026-05-15
