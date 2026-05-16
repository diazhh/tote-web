---
title: Performance — Aggregates, Materialized Snapshots, and Redis Cache
date: 2026-05-16
status: draft (awaiting user approval before plan)
milestone: v1.4 (proposed)
authors: diazhh + Claude
constraints:
  - HARD: do not deploy anything to VPS 94 unless the user explicitly asks.
  - HARD: do not affect ingest path (webhooks, SRQ pull, Maxplay scrape).
  - HARD: do not affect prize calculation (prize-processor.service.js).
  - SOFT: deploy is mixed with v1.3 (financial layer) — single deploy window.
---

# Performance — Aggregates, Materialized Snapshots, and Redis Cache

## 1. Problem statement

Three admin pages drive the bulk of database load and latency complaints today:

1. `/admin/reportes` (date-range historical reports): scans `Ticket` with deep
   includes; some queries fan out across 130k–260k rows in worst case.
2. `/admin/monitor` (operational dashboard): polls multiple endpoints every few
   seconds; multiple operator screens compound the load.
3. `/admin/tickets-report` (paginated ticket list): full-table scan on `Ticket`
   filtered by `drawDate` + `status` without a composite index; deep-includes
   compound the cost.

The codebase already has partial materialization (`DrawFinancial`,
`DrawFinancialProvider`, `DrawStats`, `ProviderCommissionLedger` from milestone
v1.3) but no cache layer at all (no Redis, no in-process cache). The
`REPORT_USE_MATERIALIZED` flag exists but is `false` by default in
`.env.example`, so production still goes through the legacy raw path.

## 2. Goals

- Make the three admin pages above feel instantaneous in normal operation
  (p95 < 300ms for cached reads).
- Reduce Postgres CPU and IO during the 15-minute pre-draw window where
  multiple operator screens hammer `/monitor`.
- Pre-compute aggregates so live reads never recompute over raw tickets.
- Provide a graceful-degradation path: if Redis or workers fail, the system
  must keep functioning (slower, but correct).

## 3. Non-goals

- No real-time push (<1s) to the frontend. The monitor stays poll-based.
  Adding WebSockets is a separate decision deferred to v1.5+.
- No multi-instance backend deploy. Today there is one `tote-backend` pm2
  process — design assumes that. If we ever scale to N>1, Redis cache stays
  coherent automatically; the in-memory variant would not, which is part of
  why we chose Redis.
- No changes to ingest path: `webhook.service.js`, `api-integration.service.js`,
  `maxplay.service.js`, and `prize-processor.service.js` are out of scope.

## 4. Approach (selected: Enfoque A — three-layer + proactive warming)

```
Cliente HTTP
   ↓
Express controller
   ↓
cacheOrCompute(key, ttl, fn)
   ├─→ Redis GET (hot)               ─── hit ────┐
   ├─→ Postgres materialized table   ────────────┤
   └─→ Postgres raw (fallback)       ────────────┤
                                                 ↓
                                              SETEX Redis
                                                 ↓
                                              return
       ↑
   Workers de pre-cómputo (pg-boss + cron Linux 1/min)
   ├─ refresh-live-snapshots
   ├─ refresh-daily-snapshot
   └─ Workers v1.3 existentes (DrawFinancial — unchanged)
```

### TTLs by data class

| Data class                            | TTL    | Justification |
|---------------------------------------|--------|---------------|
| Live draw snapshot (SCHEDULED/CLOSED) | 30s    | Worker refreshes ~every 60s; reads tolerate ≤30s staleness |
| Day-in-progress report                | 60s    | Polled by monitor; matches user-stated tolerance |
| Historical report (closed dates)      | 1h     | Data is immutable post-totalizedAt |
| Config lists (games, providers, etc.) | 5 min  | Changes are admin-initiated and rare |

### Resilience principles

1. Redis down → log warn, execute `fn` directly. Zero functional impact.
2. Snapshot table empty for active draw (edge case) → compute on-the-fly.
3. Workers fail → pg-boss retries 3× with backoff; DLQ monitor alerts.
4. Snapshot too old (`refreshedAt > 5 min ago`) → ignore row, recompute.

## 5. Components

### 5.1 Infrastructure (VPS 94)

- New container `redis:7-alpine` in `docker-compose.yml` alongside Postgres.
- Persistence: RDB snapshot every 5 min (`save 300 1`), AOF disabled.
- Binds to `127.0.0.1:6379` only — no public exposure, no password.
- Memory ceiling: `maxmemory 256mb`, `maxmemory-policy allkeys-lru`.

### 5.2 Backend — new files

| File | Responsibility |
|---|---|
| `backend/src/lib/redis.js` | `ioredis` singleton + `cacheOrCompute`, `invalidate`, `invalidatePattern` |
| `backend/src/services/live-snapshot.service.js` | Compute `DrawLiveSnapshot` rows and `DailyAggregateSnapshot` rows |
| `backend/src/queue/workers/refresh-live-snapshots.worker.js` | Cron-triggered, refreshes all active draws of today |
| `backend/src/queue/workers/refresh-daily-snapshot.worker.js` | Cron-triggered, refreshes today's daily aggregate |
| `backend/src/routes/health.routes.js` (or extend) | `/health` reports Postgres + Redis + pg-boss |

### 5.3 Backend — modified files

| File | Change |
|---|---|
| `services/monitor.service.js` | Wrap `getDailyReport`, `getTicketList`, `getItemStatsFiltered` with `cacheOrCompute`. Default `useMaterialized=true`. |
| `services/draw.service.js` | `getDrawById` reads from `DrawLiveSnapshot` for non-DRAWN draws |
| `queue/constants.js` | Add `REFRESH_LIVE_SNAPSHOTS`, `REFRESH_DAILY_SNAPSHOT` |
| `queue/register.js` | Register two new workers |
| `queue/workers/calculate-draw-financials.worker.js` | On PRIZES commit: `DELETE DrawLiveSnapshot WHERE drawId=X` + `DEL` matching Redis keys |
| `scripts/trigger-pgboss-cron.mjs` | Allowlist the two new queue names |
| `index.js` | Bootstrap Redis client at startup |
| `prisma/schema.prisma` | Add `DrawLiveSnapshot` + `DailyAggregateSnapshot` |
| `.env.example` | `REDIS_URL=redis://localhost:6379`, `REDIS_ENABLED=true`, `SNAPSHOT_WORKERS_ENABLED=true` |

### 5.4 Schema (additive migration)

```prisma
model DrawLiveSnapshot {
  drawId       String   @id
  totalSales   Decimal  @db.Decimal(15, 2)
  ticketCount  Int
  byProvider   Json     // [{ apiSystemId, name, sales, count }, ...]
  refreshedAt  DateTime @default(now())
  draw         Draw     @relation(fields: [drawId], references: [id], onDelete: Cascade)

  @@index([refreshedAt])
}

model DailyAggregateSnapshot {
  id           String        @id @default(cuid())
  date         DateTime      @db.Date
  gameId       String?
  source       TicketSource?
  apiSystemId  String?
  totalSales   Decimal       @db.Decimal(15, 2)
  ticketCount  Int
  prizeTotal   Decimal       @db.Decimal(15, 2)
  refreshedAt  DateTime      @default(now())

  @@unique([date, gameId, source, apiSystemId])
  @@index([date])
}
```

### 5.5 New Postgres indices (cheap perf wins, independent of cache)

- `Ticket(drawDate, status)` — closes the full scan in `getTicketList`.
- `Ticket(apiSystemId, drawDate)` — provider-filtered queries.

### 5.6 Cron entries (`/etc/cron.d/tote-triggers`)

```
* * * * * root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs refresh-live-snapshots
* * * * * root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs refresh-daily-snapshot
```

**Staleness window:** With cron at 1-min granularity + 30s TTL on live keys,
worst-case staleness is ~90s (one cron tick + TTL expiry combo). Within the
user-stated 30–60s tolerance for most reads.

## 6. Data flow

### 6.1 Read — active draw snapshot

```
GET /api/draws/:id  (status ∈ {SCHEDULED, CLOSED})

draw.service.getDrawById(id)
  └─ cacheOrCompute("tote:v1:draw:"+id+":snap", 30s, async () => {
       const snap = SELECT * FROM DrawLiveSnapshot WHERE drawId=id;
       if (snap && age(snap.refreshedAt) < 5min) return snap;
       if (draw.status === 'DRAWN') return DrawFinancial row;
       // edge: snapshot worker hasn't run yet → compute on-the-fly
       return aggregate Tickets WHERE drawId=id;
     });
```

### 6.2 Read — date-range report

```
GET /api/monitor/reporte?dateFrom=X&dateTo=Y&...filters

key  = "tote:v1:report:daily:" + sha1(JSON.stringify(filters))
ttl  = (dateTo includes today) ? 60s : 1h

cacheOrCompute(key, ttl, async () => {
  if (range is entirely in the past)        → SELECT DrawFinancial JOIN Draw;
  if (range includes today)                 → DrawFinancial (past) + DailyAggregateSnapshot (today);
  if (a draw is CLOSED-not-totalized)       → use DrawLiveSnapshot for that row;
});
```

### 6.3 Read — paginated ticket list

```
GET /api/monitor/tickets?page=N&pageSize=50&filters

cacheOrCompute("tote:v1:tickets:list:"+sha1(filters_with_page), 60s, async () => {
  — USES new Ticket(drawDate, status) index
  — slimmed include: draw { id, drawDate, drawTime, gameId, winnerNumber }
  — gameItem map loaded separately, batch-cached 5min
});
```

### 6.4 Write — proactive snapshot refresh

```
[cron 60s] → trigger-pgboss-cron.mjs refresh-live-snapshots

refresh-live-snapshots.worker.js
  1. SELECT draws WHERE drawDate=TODAY AND status IN ('SCHEDULED','CLOSED');
  2. For each: aggregate Tickets → UPSERT DrawLiveSnapshot;
  3. DEL Redis "tote:v1:draw:{id}:snap";
  4. Log duration; alarm if > 30s (approaching next tick).
```

### 6.5 Write — daily aggregate refresh

```
[cron 60s] → trigger-pgboss-cron.mjs refresh-daily-snapshot

refresh-daily-snapshot.worker.js
  1. For date=TODAY, compute per (gameId, source, apiSystemId) using:
       — DrawFinancial   (draws DRAWN today)
       — DrawLiveSnapshot (draws not-yet-DRAWN today)
  2. UPSERT DailyAggregateSnapshot rows;
  3. Invalidate Redis report keys touching today.
```

### 6.6 Write — on draw lifecycle transition (hook in v1.3 worker)

```
calculate-draw-financials.worker.js (PRIZES phase, after commit)
  └─ DELETE FROM DrawLiveSnapshot WHERE drawId=X;
  └─ DEL Redis "tote:v1:draw:"+X+":snap";
  └─ Invalidate today's report keys if X.drawDate is today.
```

### 6.7 Pattern-DEL caveat

Pattern-deletion (`KEYS pattern` + `DEL`) is O(N) over keyspace. Mitigation:
maintain a tracking Set `tote:v1:idx:report:keys` updated on each `SETEX`, and
invalidation does `SMEMBERS` + `UNLINK` (non-blocking). Acceptable because the
report keyspace is small (tens of filter combinations).

## 7. Error handling

| Failure              | Behavior                                    | Detection |
|----------------------|---------------------------------------------|-----------|
| Redis `ECONNREFUSED` | `cacheOrCompute` logs WARN; runs `fn` direct | `/health` shows `redis:down`; `cache_fallback_total` rises |
| Redis slow (>200ms)  | Promise.race timeout; falls to fn          | `cache_timeout_total` |
| Worker fails         | pg-boss retries 3× backoff; DLQ → alert    | Existing monitor-dlq queue |
| Snapshot stale (>5m) | Row ignored; on-the-fly recompute          | `snapshot_too_old_total` |
| Migration failure    | Aditive only; `migrate deploy` exits non-0; schema unchanged | Operator pauses |
| Redis container down | Backend boots; everything degrades to direct fn execution | `[redis] connection refused` in pm2 logs |

## 8. Feature flags (operational levers, all env-vars)

| Flag                          | Default prod | Purpose |
|-------------------------------|--------------|---------|
| `REDIS_ENABLED`               | `true`       | Master kill-switch — bypass all `cacheOrCompute` |
| `REPORT_USE_MATERIALIZED`     | `true`       | Use DrawFinancial instead of raw Ticket scans |
| `SNAPSHOT_WORKERS_ENABLED`    | `true`       | Disable the two new cron workers without removing them |

Flipping any flag requires only an env change + `pm2 restart tote-backend`.

## 9. Observability

Winston log lines prefixed `[cache]`:
- `cache_hit{key_prefix=...}`
- `cache_miss{key_prefix=...}`
- `cache_fallback_total` (Redis down)
- `cache_timeout_total` (Redis slow)
- `live_snapshot_refresh_duration_ms`
- `live_snapshot_stale_skipped`

New admin endpoint `GET /api/admin/cache/stats` (auth admin) for manual inspection: hit ratios per prefix, key counts, last refresh times.

## 10. Testing strategy

- **Unit:** `lib/redis.js` (mock client): hit / miss / down / timeout; SETEX
  with correct TTL.
- **Unit:** `live-snapshot.service.js`: same output as `_getDailyReportLegacy`
  for identical inputs (mirror pattern of `pnl-shadow-comparison.test.js`).
- **Unit:** new workers: idempotent (run twice → same result); correctly
  filter inactive draws.
- **Integration:** Spin up Redis via Docker or `ioredis-mock`; end-to-end:
  insert ticket → run worker → assert `DrawLiveSnapshot` row + Redis key
  invalidated.
- **Shadow comparison (production, gated):** Log async diff between cache
  path and legacy path for 7 days before declaring cutover. Acceptance: ≥
  99.9% matches.

## 11. Deploy (documentation only — DO NOT EXECUTE)

> **Reminder:** per the hard constraint at the top of this spec, none of the
> below runs unless the user explicitly asks. This is the runbook the operator
> will follow in a future session.

Merged into the existing v1.3 deploy window:

```
0. ssh 94, verify disk space (Redis container ~50MB)
1. docker-compose up -d redis              (NEW — before git pull)
2. git push origin main; ssh 94 'cd /var/proyectos/tote-web && git pull'
3. cd backend && npm install               (adds ioredis)
4. npx prisma migrate deploy               (v1.3 migrations + new snapshot tables)
5. npx prisma generate
6. append REDIS_URL=redis://localhost:6379 to backend/.env   (or via env file)
7. pm2 restart tote-backend
8. tail logs → confirm "[redis] connected"
9. add cron lines (refresh-live-snapshots, refresh-daily-snapshot) to /etc/cron.d/tote-triggers
10. cd frontend && npm run build && pm2 restart tote-frontend (only if build returns 0 + BUILD_ID exists)
11. smoke: open /admin/monitor twice; second load < 50ms
12. enable shadow-compare mode for 7 days, then flip cache to enforced
```

**Rollback levers (in order of severity):**

1. `REDIS_ENABLED=false` + `pm2 restart tote-backend` — cache off, code unchanged.
2. `SNAPSHOT_WORKERS_ENABLED=false` + restart — workers off; tables stay.
3. Revert commit on `main` and pull; tables remain (aditive, no harm).

## 12. Risks and open questions

| Risk | Mitigation |
|------|------------|
| Cron 1-min granularity gives ~90s worst-case staleness (above stated 30–60s for some reads) | Accept; if intolerable in practice, add a pm2 process running `setInterval(30s)` for the live worker — pattern break acknowledged. |
| Pattern-DEL on Redis grows costly | Maintain tracking Set; use UNLINK. Reassess if key count > 10k. |
| Single backend instance assumption | Re-evaluate when scaling pm2 instances; Redis cache is already coherent, but worker scheduling needs leader election. |
| Mixed deploy with v1.3 = larger blast radius | Three independent feature flags (`REDIS_ENABLED`, `REPORT_USE_MATERIALIZED`, `SNAPSHOT_WORKERS_ENABLED`) let operator disable the new layer without rolling back v1.3. |
| `DrawLiveSnapshot.byProvider` as JSON loses index-based filtering on provider | Acceptable: this column is read whole, never filtered. Provider-filtered queries go through `DrawFinancialProvider` for finalized draws. |

## 13. Success criteria

- `/admin/reportes` for a 30-day historical range: p95 < 300ms (currently
  unmeasured but anecdotally seconds).
- `/admin/monitor` cached read: p95 < 80ms.
- `/admin/tickets-report` page-1 with date filter: p95 < 250ms.
- Redis hit ratio > 80% on `tote:v1:*` after warm-up.
- Zero functional regressions: ingest path and prize calculation unchanged.
- Shadow comparison: ≥ 99.9% match between cache path and legacy path
  before cutover.
