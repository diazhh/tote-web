# Phase 5: Backend Reports Foundation - Research

**Researched:** 2026-04-01
**Domain:** Node.js/Express service extension + Next.js client-side fix
**Confidence:** HIGH

## Summary

Phase 5 has three distinct concerns. The first (FIX-01) is a pure import fix: `reportes/page.js` calls `formatDrawTime(draw)` at line 204 but never imports it. The function exists and is already exported from `frontend/lib/utils/dateUtils.js`. No logic change is needed — one import line fixes the crash.

The second concern (BACK-01, BACK-02) is extending `getDailyReport` in `monitor.service.js` to accept a date range (`dateFrom`/`dateTo`) and two filter dimensions: `source` (maps to `Ticket.source` enum: `TAQUILLA_ONLINE` / `EXTERNAL_API` / `WEBHOOK_PUSH`) and `apiSystemId` (an ID on the `ApiSystem` model, reachable via `ApiDrawMapping` → `ApiConfiguration.apiSystemId`). The current method takes a single `date` and optional `gameId`. All new params are additive; the existing single-date behavior must remain the default.

The third concern (BACK-03) is adding two aggregation blocks to the response: `byGame` (one row per game with totals across the date range) and `bySource` (one row per source/provider). Both can be computed in-memory from the draws already fetched, or via a follow-up `DrawStats` query for performance. `DrawStats` records are pre-calculated per draw and are the preferred data source because they avoid re-summing tickets. `ProviderStats` records are per-draw at BANCA/COMERCIAL/GRUPO/TAQUILLA level and are useful for provider breakdowns, but source-level aggregation (`TAQUILLA_ONLINE` vs `EXTERNAL_API` vs `WEBHOOK_PUSH`) is not in `DrawStats` — it requires summing `Ticket.source` per draw or leveraging the existing ticket query.

**Primary recommendation:** Extend `getDailyReport` into a `getReport(params)` method that handles both single-date (backwards compat) and date-range queries. Use `DrawStats` for totals. Compute game-level and source-level aggregations in-memory from the draw loop.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIX-01 | /admin/reportes loads without client-side errors (formatDrawTime not imported) | `formatDrawTime` is exported from `frontend/lib/utils/dateUtils.js`; needs one import line in `reportes/page.js` |
| BACK-01 | Backend endpoint supports dateFrom/dateTo query params (currently only single date) | `getDailyReport` uses `drawDate: drawDate` exact match; extend to `drawDate: { gte: dateFrom, lte: dateTo }` |
| BACK-02 | Backend endpoint supports source and apiSystemId filters | `Ticket.source` is a direct enum field; apiSystemId filter needs join via `ApiDrawMapping` → `ApiConfiguration` |
| BACK-03 | Backend returns game-level and provider-level aggregations in the response | `DrawStats` model has pre-calculated totals per draw; compute aggregations from draw loop in-memory |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Backend uses ES modules throughout (`import`/`export`) — no `require()`
- Prisma client is the singleton from `lib/prisma.js` — always import from there
- Timezone is Venezuela (America/Caracas, UTC-4) via `lib/dateUtils.js`
- Draw status for completed draws: filter by `DRAWN` locally, `PUBLISHED` in production — when in doubt query both
- Frontend fetch pattern: raw `fetch()` or the existing `axios` wrapper — stay consistent with existing admin pages (the monitor API module uses `axios`)
- No new models or schema changes in this phase — work only with existing models

---

## Standard Stack

### Core (all already in use — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma ORM | existing | DB queries for Draw, DrawStats, Ticket, ProviderStats | Already the project ORM, singleton at `lib/prisma.js` |
| Express Router | existing | Route definition at `monitor.routes.js` | Existing pattern |
| Winston logger | existing | `lib/logger.js` — use `logger.error` in catch blocks | Consistent with all services |

### Frontend Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `frontend/lib/utils/dateUtils.js` | local | `formatDrawTime` function | Fix FIX-01 import |
| `frontend/lib/api/monitor.js` | local | Axios-based API client | Extend `getDailyReport` to pass new params |

**No new npm installs required for Phase 5.** All tools are already present.

---

## Architecture Patterns

### Pattern 1: Existing Service Method Signature to Extend

Current signature at `monitor.service.js:342`:
```javascript
// Source: backend/src/services/monitor.service.js line 342
async getDailyReport(date, gameId = null)
```

**Recommended new approach — replace with a unified params object:**

```javascript
// New signature — backwards compatible via defaults
async getReport({ dateFrom, dateTo, gameId = null, source = null, apiSystemId = null } = {})
```

The controller at `monitor.controller.js:44` currently does:
```javascript
const { date, gameId } = req.query;
let reportDate;
if (date) {
  reportDate = new Date(date + 'T00:00:00-04:00');
} else {
  reportDate = new Date();
}
const report = await monitorService.getDailyReport(reportDate, gameId || null);
```

It must be updated to also extract `dateFrom`, `dateTo`, `source`, `apiSystemId` and pass them to the service. Single `date` param should still work as a convenience (`dateFrom = dateTo = date`).

### Pattern 2: Date Range Query on Draw.drawDate

`drawDate` is `@db.Date` — stored as a pure date, no time component. Existing code builds UTC midnight:
```javascript
// Source: monitor.service.js lines 347-354
const dateStr = date.split('T')[0];
drawDate.setTime(new Date(dateStr + 'T00:00:00.000Z').getTime());
```

For date ranges:
```javascript
// dateFrom and dateTo are YYYY-MM-DD strings from query params
const from = new Date(dateFrom + 'T00:00:00.000Z');
const to   = new Date(dateTo   + 'T00:00:00.000Z');

where.drawDate = { gte: from, lte: to };
```

### Pattern 3: Source Filter on Ticket Join

`Ticket.source` is a direct field. The `Draw` include block already loads `tickets`. Filtering by source is additive:
```javascript
// Inside the prisma.draw.findMany include block
tickets: {
  where: source ? { source } : undefined,
  include: { details: { include: { gameItem: true } } }
}
```

**Caution:** If `source` filter is applied, `totalSales` and `totalPrize` computed in the draw loop will reflect only that source subset — this is the correct behavior for filtered reports.

### Pattern 4: apiSystemId Filter

`ApiSystem` connects to tickets via `ApiConfiguration` → `ApiDrawMapping` → `Draw`. There is no direct `apiSystemId` field on `Ticket`. The filter strategy:

1. Fetch `drawIds` that have mappings to the given `apiSystemId`:
```javascript
// Resolve draws belonging to the apiSystem
const mappings = await prisma.apiDrawMapping.findMany({
  where: {
    apiConfig: { apiSystemId }
  },
  select: { drawId: true }
});
const filteredDrawIds = mappings.map(m => m.drawId);
```

2. Add `id: { in: filteredDrawIds }` to the `draw.findMany` where clause.

**Note:** This resolves the draw set, not the ticket set. Tickets in those draws may come from multiple sources. Combine with `source: 'EXTERNAL_API'` if the intent is to filter to only external tickets of a given system. For Phase 5, filtering draws by `apiSystemId` (i.e., "show only draws where this provider submitted data") is the correct interpretation per BACK-02.

### Pattern 5: Game-Level Aggregation (BACK-03)

After building the `report` array in the draw loop, compute in-memory:
```javascript
const byGame = {};
for (const row of report) {
  if (!byGame[row.gameId]) {
    byGame[row.gameId] = {
      gameId: row.gameId,
      game: row.game,
      totalSales: 0, totalPrize: 0, totalBalance: 0,
      totalTickets: 0, drawCount: 0
    };
  }
  const g = byGame[row.gameId];
  g.totalSales   += row.totalSales;
  g.totalPrize   += row.totalPrize;
  g.totalBalance += row.balance;
  g.totalTickets += row.ticketCount;
  g.drawCount++;
}
```

Return `Object.values(byGame)` in the response as `byGame`.

### Pattern 6: Source-Level Aggregation (BACK-03)

```javascript
const bySource = {};
for (const draw of draws) {
  for (const ticket of draw.tickets) {
    const src = ticket.source;
    if (!bySource[src]) {
      bySource[src] = { source: src, totalSales: 0, ticketCount: 0 };
    }
    bySource[src].totalSales  += parseFloat(ticket.totalAmount);
    bySource[src].ticketCount += 1;
  }
}
```

**Important:** Source aggregation requires `tickets` to be loaded. The existing `getDailyReport` already includes all tickets. If source filter is applied, the loop will only see filtered tickets, so `bySource` will reflect the filtered subset (which is correct).

### Pattern 7: Using DrawStats Instead of Re-computing from Tickets (Performance)

For large date ranges, re-summing all tickets is expensive. `DrawStats` provides pre-calculated `totalSales`, `totalPrize`, `grossProfit` per draw. The response shape can be switched to use `DrawStats` for `totals` and `byGame` while still including the `draws` array:

```javascript
const draws = await prisma.draw.findMany({
  where,
  include: {
    game: true,
    winnerItem: true,
    stats: true,        // DrawStats — pre-calculated
    tickets: source ? { where: { source } } : true
  },
  ...
});
```

For Phase 5 scope (date range + filters), using `DrawStats` for the totals and in-memory aggregation for `byGame`/`bySource` is the recommended approach. This avoids loading all ticket details for financial totals.

**Caveat:** `DrawStats` may not exist for draws that were completed before the stats pipeline was enabled (status: `statsCalculated = false`). The service should fall back to ticket summation when `draw.stats` is null.

### Pattern 8: FIX-01 — Import Fix

In `frontend/app/admin/reportes/page.js`, line 12 imports from `@/lib/dateUtils`:
```javascript
import { getTodayVenezuela } from '@/lib/dateUtils';
```

`formatDrawTime` lives in `frontend/lib/utils/dateUtils.js` (note: `utils/` subdirectory). The correct import to add:
```javascript
import { formatDrawTime } from '@/lib/utils/dateUtils';
```

This is a separate module from `@/lib/dateUtils` (which is `frontend/lib/dateUtils.js`). Do NOT add `formatDrawTime` to `@/lib/dateUtils` — it doesn't belong there. Add a second import line for the `utils/` module.

### Anti-Patterns to Avoid

- **Do not re-export `formatDrawTime` from `@/lib/dateUtils`** — creates a parallel export path and coupling between two unrelated utility files.
- **Do not rename `getDailyReport`** — the method is called from the frontend via `monitorApi.getDailyReport`. Keep that name; add a new internal method or extend the existing one with optional params.
- **Do not apply `source` filter at the draw level** — draws exist regardless of ticket source. Apply `source` filter inside the `tickets` include block to scope financial calculations correctly.
- **Do not use `prisma.$queryRaw` for the date range** — the existing Prisma ORM pattern works fine for date range filters on `@db.Date` columns. Raw SQL is not needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date range boundary handling | Custom UTC midnight logic | Follow existing pattern from `getDailyReport` (`dateStr + 'T00:00:00.000Z'`) | Consistent timezone treatment across Venezuela TZ |
| Source totals aggregation | Separate DB query | In-memory loop over already-fetched tickets | Tickets are already loaded; extra DB round-trip not needed |
| Pre-calculated totals | Re-summing ticket details | `DrawStats.totalSales`, `DrawStats.totalPrize` | Already computed by the pipeline worker |
| Response envelope | Custom shape | `{ success: true, data: ... }` pattern | Every existing controller uses this shape |

---

## Common Pitfalls

### Pitfall 1: Two Different dateUtils Modules
**What goes wrong:** Developer adds `formatDrawTime` to the wrong module (`frontend/lib/dateUtils.js` instead of `frontend/lib/utils/dateUtils.js`), or imports from the wrong path.
**Why it happens:** Two `dateUtils` files exist at different paths. `reportes/page.js` imports `getTodayVenezuela` from `@/lib/dateUtils` (the simple one), but `formatDrawTime` only exists in `@/lib/utils/dateUtils` (the full one).
**How to avoid:** Add a second import line; do not collapse both into one import.
**Warning signs:** `formatDrawTime is not a function` or `cannot destructure 'formatDrawTime'` at runtime.

### Pitfall 2: drawDate is Stored as UTC Midnight — Timezone Arithmetic Needed
**What goes wrong:** Passing `new Date('2026-03-15')` directly creates a UTC midnight Date, which when compared to Venezuela-offset records may miss draws at boundary dates.
**Why it happens:** `drawDate` is `@db.Date` but internally Prisma stores it in UTC. Venezuela is UTC-4.
**How to avoid:** Use the existing pattern: `new Date(dateStr + 'T00:00:00.000Z')` where `dateStr` is the plain `YYYY-MM-DD` string from the query param. The controller should build `dateFrom`/`dateTo` the same way the existing `date` param is built.
**Warning signs:** Reports for the "last day" of a range show zero draws when draws clearly exist.

### Pitfall 3: apiSystemId Filter Returns Empty When No Draws Match
**What goes wrong:** When `apiSystemId` filter finds no mapped draws, the `id: { in: [] }` Prisma clause returns all draws (Prisma behavior for empty `in` array is to return no results, but the conditional logic must handle the case where `filteredDrawIds` is empty).
**Why it happens:** `prisma.draw.findMany({ where: { id: { in: [] } } })` returns empty array in Prisma — this is correct behavior but must be explicitly handled.
**How to avoid:** If `filteredDrawIds.length === 0`, short-circuit and return an empty report immediately rather than passing empty array to the main query.
**Warning signs:** Unexpectedly empty reports when switching between apiSystem filters.

### Pitfall 4: DrawStats May Not Exist for All Draws
**What goes wrong:** Joining on `draw.stats` (DrawStats) and using it exclusively will silently show `null`/zero values for older draws that completed before the stats pipeline was in place.
**Why it happens:** `Draw.statsCalculated` is a Boolean guard added with the pg-boss pipeline. Older draws may have `statsCalculated: false` and no `DrawStats` record.
**How to avoid:** When using `DrawStats`, check `draw.stats !== null`. Fall back to ticket summation (`draw.tickets`) if null. Or simply use ticket summation consistently for Phase 5 to keep the code simple — DrawStats optimization is not a Phase 5 requirement.
**Warning signs:** Some draws show zero sales/prizes in reports despite having tickets.

### Pitfall 5: Decimal Fields Return Strings from Prisma
**What goes wrong:** Prisma returns `Decimal` fields as `Decimal` objects (not native JS numbers). `parseFloat()` is required before arithmetic.
**Why it happens:** Prisma uses the `Decimal.js` library for `@db.Decimal` fields.
**How to avoid:** Always wrap with `parseFloat()` when summing. The existing code already does this correctly. Maintain the pattern.
**Warning signs:** `NaN` in totals, or string concatenation instead of addition.

---

## Code Examples

### getDailyReport — Current Prisma Query Core
```javascript
// Source: backend/src/services/monitor.service.js lines 364-383
const draws = await prisma.draw.findMany({
  where,
  include: {
    game: true,
    winnerItem: true,
    tickets: {
      include: {
        details: {
          include: {
            gameItem: true
          }
        }
      }
    }
  },
  orderBy: [
    { drawDate: 'asc' },
    { drawTime: 'asc' }
  ]
});
```

### Extended where clause for date range
```javascript
// Extended version for BACK-01
const where = {};
if (dateFrom && dateTo) {
  where.drawDate = {
    gte: new Date(dateFrom + 'T00:00:00.000Z'),
    lte: new Date(dateTo   + 'T00:00:00.000Z')
  };
} else if (date) {
  // backwards-compat single date
  where.drawDate = new Date(date.split('T')[0] + 'T00:00:00.000Z');
}
if (gameId) where.gameId = gameId;
```

### Source filter on tickets include
```javascript
// For BACK-02 source filter
tickets: {
  where: source ? { source } : undefined,
  include: {
    details: { include: { gameItem: true } }
  }
}
```

### apiSystemId resolution (BACK-02)
```javascript
// Only run if apiSystemId was provided
if (apiSystemId) {
  const mappings = await prisma.apiDrawMapping.findMany({
    where: { apiConfig: { apiSystemId } },
    select: { drawId: true }
  });
  const drawIds = mappings.map(m => m.drawId);
  if (drawIds.length === 0) {
    return { dateFrom, dateTo, draws: [], totals: {}, byGame: [], bySource: [] };
  }
  where.id = { in: drawIds };
}
```

### Response shape for BACK-03 aggregations
```javascript
// New response shape
return {
  dateFrom,
  dateTo,
  gameId: gameId || null,
  source: source || null,
  apiSystemId: apiSystemId || null,
  draws: report,
  totals: {
    totalSales, totalPrize, totalBalance, totalTickets, drawCount
  },
  byGame: Object.values(byGame),    // Array of per-game totals
  bySource: Object.values(bySource) // Array of per-source totals
};
```

### FIX-01 — Correct import addition in reportes/page.js
```javascript
// Existing import (line 12):
import { getTodayVenezuela } from '@/lib/dateUtils';

// Add this as a new import line:
import { formatDrawTime } from '@/lib/utils/dateUtils';
```

### Frontend API client extension (monitorApi)
```javascript
// Extended getDailyReport in frontend/lib/api/monitor.js
getDailyReport: async (date, gameId = null, extraFilters = {}) => {
  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (gameId) params.append('gameId', gameId);
  // Phase 6 will use these; Phase 5 just ensures backend supports them
  if (extraFilters.dateFrom) params.append('dateFrom', extraFilters.dateFrom);
  if (extraFilters.dateTo)   params.append('dateTo',   extraFilters.dateTo);
  if (extraFilters.source)   params.append('source',   extraFilters.source);
  if (extraFilters.apiSystemId) params.append('apiSystemId', extraFilters.apiSystemId);
  const response = await axios.get(`/monitor/reporte?${params.toString()}`);
  return response.data;
},
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `date` single param (current) | `dateFrom` / `dateTo` range params | Enables multi-day reports |
| In-memory ticket summation only | `DrawStats` pre-calculated totals available | Optional performance optimization |
| No aggregations in response | `byGame` + `bySource` arrays | Enables summary cards in Phase 6 |

---

## Open Questions

1. **Should `getDailyReport` be renamed or kept?**
   - What we know: The frontend calls `monitorApi.getDailyReport(date, gameId)`. The method name is used in the monitor API client.
   - What's unclear: Whether the planner wants to rename to `getReport` for clarity or keep for backwards compatibility.
   - Recommendation: Keep the service method name as `getDailyReport` but accept both old and new params via a single object destructure pattern. The controller can pass both single-date and range modes.

2. **ProviderStats vs in-memory ticket aggregation for `bySource`**
   - What we know: `ProviderStats` is at BANCA/COMERCIAL/GRUPO/TAQUILLA level and does not track `TAQUILLA_ONLINE` or `WEBHOOK_PUSH` sources. Source-level aggregation must come from ticket summation.
   - Recommendation: Use in-memory ticket summation for `bySource`. `ProviderStats` is useful for future BACK-04+ provider hierarchy but out of Phase 5 scope.

3. **What does `apiSystemId` filter mean semantically?**
   - What we know: `ApiSystem` is a provider system (e.g., SRQ). `ApiDrawMapping` links draws to api configs. Filtering by `apiSystemId` means "show only draws that received tickets from this specific provider system."
   - Recommendation: Implement as draw-ID restriction via `ApiDrawMapping` join (described above). Document this in controller JSDoc.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 5 is backend service code changes and a frontend import fix. No external dependencies beyond the existing database connection which is already validated by the running system.

---

## Validation Architecture

`workflow.nyquist_validation` is not set in `.planning/config.json` (key absent) — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (backend) |
| Config file | `backend/package.json` (jest key) |
| Quick run command | `cd backend && npm test -- --testPathPattern monitor` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIX-01 | Page renders without crash after import fix | manual smoke | Load /admin/reportes in browser, confirm no console errors | N/A — browser test |
| BACK-01 | `getDailyReport` with dateFrom/dateTo returns draws in range | unit | `npm test -- --testPathPattern monitor` | ❌ Wave 0 |
| BACK-02 | `getDailyReport` with source filter returns only matching source | unit | `npm test -- --testPathPattern monitor` | ❌ Wave 0 |
| BACK-02 | `getDailyReport` with apiSystemId returns only draws in that system | unit | `npm test -- --testPathPattern monitor` | ❌ Wave 0 |
| BACK-03 | Response includes `byGame` array with correct per-game totals | unit | `npm test -- --testPathPattern monitor` | ❌ Wave 0 |
| BACK-03 | Response includes `bySource` array with correct source totals | unit | `npm test -- --testPathPattern monitor` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npm test -- --testPathPattern monitor --passWithNoTests`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/services/__tests__/monitor.service.test.js` — unit tests for new params (REQ BACK-01, BACK-02, BACK-03)
- [ ] Mock `prisma.draw.findMany` and `prisma.apiDrawMapping.findMany` for isolation

*(FIX-01 is a browser smoke test only — no automated test file needed. The import fix either compiles or it doesn't.)*

---

## Sources

### Primary (HIGH confidence)
- Direct code read: `backend/src/services/monitor.service.js` — full 940-line file, `getDailyReport` at lines 342-440
- Direct code read: `backend/src/controllers/monitor.controller.js` — `getDailyReport` controller at lines 44-62
- Direct code read: `backend/src/routes/monitor.routes.js` — route at line 22
- Direct code read: `frontend/app/admin/reportes/page.js` — `formatDrawTime` called at line 204, not imported
- Direct code read: `frontend/lib/utils/dateUtils.js` — `formatDrawTime` exported at line 243
- Direct code read: `frontend/lib/dateUtils.js` — `getTodayVenezuela` exported, no `formatDrawTime`
- Direct code read: `backend/prisma/schema.prisma` — `DrawStats` (lines 1078-1109), `ProviderStats` (lines 1122-1154), `Ticket` with `source` enum (lines 938-970)
- Direct code read: `backend/src/services/draw-stats.service.js` — confirms `DrawStats` and `ProviderStats` calculation patterns
- Direct read: `.planning/REQUIREMENTS.md` — Phase 5 requirement IDs
- Direct read: `.planning/STATE.md` — decisions: fetch pattern, PDF approach, data models available

### Secondary (MEDIUM confidence)
- Training knowledge: Prisma `@db.Date` UTC storage behavior — verified consistent with existing code patterns in the service

---

## Metadata

**Confidence breakdown:**
- FIX-01 fix: HIGH — `formatDrawTime` clearly exists in `utils/dateUtils.js`, clearly missing from imports in `reportes/page.js`
- Standard stack: HIGH — all code read directly, no inference
- Architecture patterns: HIGH — based on existing service code, direct extension
- Pitfalls: HIGH — derived from actual code behavior observed in the service
- apiSystemId join path: MEDIUM — join path is structurally correct per schema, but no existing code exercises this exact join in a report context

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable codebase — schema and services don't change often)
