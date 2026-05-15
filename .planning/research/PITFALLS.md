# Domain Pitfalls — v1.3 Financial Layer

**Milestone:** v1.3 Capa Financiera y Contabilidad
**Researched:** 2026-05-15
**Confidence:** HIGH (codebase verified, production memory verified, live pipeline examined)

---

## Critical Pitfalls

These mistakes cause incorrect money figures, require a backfill rerun, or corrupt audit trails.

---

### Pitfall F-1: Aggregate Written Before Prize Processing Completes

**What goes wrong:**
`calculate-draw-financials` runs as a step in the execute-draw pipeline. If it is placed immediately after `step-calculate-stats` (the current final step), it will produce a valid aggregate. But if it is ever triggered independently — from the backfill script, from an admin "recalculate" action, or from a cron sweep that finds draws with `statsCalculated=true` but no `DrawFinancial` row — there is a window where `prizesProcessed=false` on the draw but the aggregate query still runs. The resulting row will have `totalPrize=0` and report 100% margin on a draw that had real prizes.

**Warning sign:** `DrawFinancial.totalPrize = 0` for a draw with `Draw.prizesProcessed = false`. This is detectable with a single SQL check after any backfill run.

**Prevention:**
- The worker must guard: `if (!draw.prizesProcessed) throw new Error('prizes not processed yet')`. This causes pg-boss to retry or fail loudly — never silently produce a zero-prize aggregate.
- The backfill script must `WHERE prizesProcessed = true AND statsCalculated = true` — never aggregate a draw that has not finished the full pipeline.
- Add a DB constraint or application check: `DrawFinancial` rows may only be created/updated when the parent `Draw.prizesProcessed = true`.

**Phase:** Phase 1 (DrawFinancial schema + worker). Guard must be in the initial worker implementation before any backfill is run.

---

### Pitfall F-2: Race Between Live Worker and Backfill Script

**What goes wrong:**
The backfill script runs in a loop over ~2600 historical draws. For any draw whose close happened within the last few seconds (a freshly-completed draw), both the backfill loop AND the live `calculate-draw-financials` worker can be writing to the same `DrawFinancial` row simultaneously. PostgreSQL's upsert semantics (`ON CONFLICT DO UPDATE`) handle this safely if and only if the upsert is in a single atomic statement. If the worker does a `findUnique` + conditional `create`/`update` (two round-trips), a race produces a duplicate-key error or last-write-wins with stale data.

**Warning sign:** Duplicate-key violations on `DrawFinancial.drawId` in logs during backfill. Or backfill completes but some draws have `DrawFinancial.totalSales` that disagrees with the live sum by a fixed amount that matches the last few minutes of bets.

**Prevention:**
- Use Prisma's `upsert` (maps to `INSERT ... ON CONFLICT DO UPDATE`) for all DrawFinancial writes — both the live worker and the backfill script. Never a read-then-write pattern.
- The backfill script must skip draws where `drawDate >= (NOW() - interval '1 hour')` to avoid racing with draws still in pipeline.
- Add a comment in the backfill script: "do not run while a draw is actively being executed (between xx:00 and xx:05 draw window)."

**Phase:** Phase 1 (DrawFinancial schema + worker) and Phase 2 (backfill script). Both must use the same upsert helper function.

---

### Pitfall F-3: Multi-Draw Ticket Attribution Bug Persists in Financial Aggregate

**What goes wrong:**
The existing `accounting-report.service.js` aggregates `Ticket.totalAmount` across all tickets in a draw. For tickets created by PUSH providers (webhook) with multi-play (one Ticket covering multiple draws via `TicketDetail` rows), `Ticket.drawId` points to the first draw but the ticket's amount spans multiple draws. Aggregating by `Ticket.drawId` overcounts sales for that draw and undercounts for the others.

This is a known bug in `getDailyReport` and `getAccountingReport`. The `DrawFinancial` worker will replicate this bug if it queries `Ticket.drawId` instead of `TicketDetail.drawId`.

**Warning sign:** `DrawFinancial.totalSales` for a draw differs from the manual sum of `SELECT SUM(td.amount) FROM TicketDetail td WHERE td.drawId = :drawId`. If these disagree, the aggregate was computed via `Ticket.drawId`.

**Prevention:**
- The `calculate-draw-financials` worker must aggregate via:
  ```sql
  SELECT SUM(td.amount) AS totalSales, COUNT(DISTINCT td.ticketId) AS ticketCount
  FROM TicketDetail td
  JOIN Ticket t ON t.id = td.ticketId
  WHERE td.drawId = :drawId AND t.status != 'CANCELLED'
  ```
  Never `SUM(ticket.totalAmount) WHERE ticket.drawId = :drawId`.
- Write a test: create one Ticket with TicketDetails spanning two drawIds. Verify each DrawFinancial row gets only its portion of the amount, not the full ticket amount.
- The backfill script must use the same TicketDetail-based query.

**Phase:** Phase 1 (DrawFinancial schema + worker). This is the "transparent fix" mentioned in PROJECT.md — it must be the primary aggregation method from day one.

---

### Pitfall F-4: Decimal Rounding Accumulation in Commission Calculations

**What goes wrong:**
A provider sells 5,000 tickets per week at Bs 1.00 each. Commission rate is 3.7%. Per-ticket commission = Bs 0.037. If this is stored as `NUMERIC(12,2)` it rounds to Bs 0.04. Over 5,000 tickets that is Bs 200. Correct amount at 3.7% is Bs 185. You overpay the provider Bs 15 per week — Bs 780/year. In hyperinflation context this gap widens because you are computing against BsF amounts that are themselves larger.

Conversely, FLOOR rounding (always round down): Bs 0.037 → Bs 0.03. You underpay by Bs 35/week — Bs 1,820/year. Provider will eventually notice and dispute.

**Warning sign:** The sum of individual `ProviderCommissionLedger.amount` rows does not equal the direct formula applied to weekly totals. Any non-zero difference that grows proportionally with ticket count indicates per-ticket rounding accumulation.

**Prevention:**
- Store commission amounts as `NUMERIC(18, 8)` — preserve 8 decimal places in the ledger. Round only at display time (2 decimal places for BsF, 6 for USD).
- Apply commission formula once to the weekly aggregate (not per-ticket). Store the single computed commission per week in `ProviderWeeklySettlement`. The per-draw `ProviderCommissionLedger` rows are for audit trail and should also use full precision.
- For `TIERED` formula: the tier threshold comparison must use the same precision as the stored aggregate. Never compare `totalSales > 10000` when `totalSales` is a JavaScript float — always use `Decimal.js` or Prisma's `Decimal` type.
- Document which rounding rule applies (HALF_UP is standard for financial calculations; FLOOR favors the payer; CEIL favors the recipient). Choose once, encode it as a constant, not inline `Math.round()`.

**Phase:** Phase 3 (commission calculations). The schema must use `NUMERIC(18,8)` from the start — changing precision later requires a migration and a retroactive recalculation.

---

### Pitfall F-5: Commission Config Changes Mid-Week Without Recalculation

**What goes wrong:**
Admin changes a provider's commission rate on Wednesday. The weekly settlement worker runs on Sunday and applies the new rate to the entire week's draws, including Monday and Tuesday when the old rate applied. Retroactive application misrepresents what was agreed.

**Warning sign:** Provider receives a settlement for Week 21 that does not match the rate they had agreed to on Monday of that week. No audit record exists showing the rate change happened mid-week.

**Prevention:**
- `ProviderCommissionConfig` must be append-only with `effectiveFrom` date. Never update the current row — insert a new row with the new rate and an `effectiveFrom` timestamp.
- The commission calculation query must look up the config that was effective at the time of the draw's `drawnAt` timestamp, not the current config.
- The weekly settlement worker must aggregate draws using their per-draw commission from `ProviderCommissionLedger`, not by applying the current config to the week's total. This means `ProviderCommissionLedger` rows must be written at draw-close time with the effective rate at that moment.
- If commission config does not exist yet for a given provider+draw, write a `NULL` commission to the ledger (not 0 — these are not the same). `NULL` means "not configured yet." 0 means "configured, but commission is zero."

**Phase:** Phase 3 (commission calculations). The config schema must be versioned (effectiveFrom) from the start.

---

### Pitfall F-6: Exchange Rate Missing — Accounting Entry Blocked vs Silent Default

**What goes wrong:**
Admin forgets to enter the exchange rate for today. An accounting entry is created for a USD payment. The system must choose: (a) block the entry until a rate exists, (b) silently use yesterday's rate, (c) store `exchangeRateId = NULL` and compute USD equivalent as NULL.

Option (b) is the most dangerous: it silently encodes a wrong rate with no audit trail. In a month of 30% BsF inflation, using yesterday's rate for a USD-denominated payment could misrepresent the BsF equivalent by hundreds of thousands of bolivares.

Option (a) creates friction: admin must enter the rate before posting expenses. This is acceptable — the system explicitly requires discipline.

Option (c) is safe but incomplete: the BsF-denominated entry is still valid (all primary amounts are in BsF), and the USD equivalent can be computed retroactively when the rate is entered. This is the least disruptive.

**Warning sign:** `AccountingEntry` rows with `originalCurrency = 'USD'` but `exchangeRateId = NULL` appearing in reports with 0 USD equivalent, misleading the P&L.

**Prevention:**
- For USD-denominated entries: require `exchangeRateId` at create time. If no rate exists for today, the UI shows "No hay tasa de cambio para hoy — ingrese la tasa primero" and disables the submit button.
- For BsF-denominated entries: `exchangeRateId` is optional (BsF is the functional currency; the USD equivalent column in reports shows NULL or "—" for entries with no rate).
- Never default to the previous day's rate silently. If a default is used, log a WARNING and display a visual indicator in the UI ("tasa del día anterior usada — fecha X").
- Exchange rate entries must have `createdBy` (admin user ID) and `createdAt` timestamps. They must not be editable — only superseded by a new row. Add `supersededById` FK for the audit chain.

**Phase:** Phase 4 (accounting module schema). The rate-required constraint must be in the schema definition, not enforced only in the UI.

---

### Pitfall F-7: Re-Converting Historical USD Payments at Today's Rate

**What goes wrong:**
A payment of $100 USD was made 6 months ago when the rate was Bs 40/USD. The payment was correctly recorded as `originalAmount=100, originalCurrency=USD, amountBsF=4000, exchangeRateId=<rate from 6 months ago>`. A report is generated that shows all USD payments "in USD equivalent today." The report fetches `originalAmount / currentRate` → at today's rate of Bs 70/USD, the $100 payment appears as $57. The business believes it spent $57 when it actually spent $100.

This mistake is easy to make when building summary reports that want to show a single "USD equivalent" column.

**Warning sign:** The sum of USD-equivalent entries in a P&L report changes week-over-week for historical periods (the denominator changes as the rate changes).

**Prevention:**
- The `amountBsF` field is the functional currency record. It is immutable once written. Reports must sum `amountBsF` as the source of truth.
- To show "USD equivalent," use `amountBsF / exchangeRate.rate` where `exchangeRate` is the rate linked to the entry, not today's rate.
- Never compute `originalAmount / currentRate` for historical entries. Document this explicitly in the report service: "USD equivalent = amountBsF / historicalRate (immutable at entry time)."
- The UI should display both `amountBsF` and `usdEquivalentAtTime` as two separate read-only fields once the entry is saved. Neither changes retroactively.

**Phase:** Phase 4 (accounting module) and Phase 5 (reports). The report service must be explicitly tested with an entry from 6 months ago to verify it does not re-convert.

---

### Pitfall F-8: Tasa Paralela vs BCV Mixing in Reports

**What goes wrong:**
Admin enters the tasa paralela (e.g., Bs 70/USD) when recording payments. The weekly P&L report is shown to a stakeholder who asks "what is our total expense in USD?" The stakeholder computes the answer using the BCV official rate (e.g., Bs 36/USD) and gets a different number. Neither party is wrong — they are using different rate systems. But the report has no indication of which rate was used, making it misleading.

**Warning sign:** Any time the word "USD" appears in a report without a footnote specifying which rate was used.

**Prevention:**
- `ExchangeRate` must have a `rateType` field: `PARALELA | BCV | OFFICIAL`. Admin selects at entry time.
- Reports must display the rate type used. The P&L header must say "montos USD calculados a tasa PARALELA" (or whichever type applies).
- If a date range spans entries that used different rate types, the report must flag this: "advertencia: este período contiene entradas con tipos de tasa mixtos (PARALELA y BCV)."
- For this milestone, only PARALELA is expected (as per operational context). But the schema must have the field from day one — adding it later requires migrating all existing entries.

**Phase:** Phase 4 (accounting module schema). The `rateType` field must be in the initial migration.

---

## Moderate Pitfalls

---

### Pitfall F-9: Ticket Cancellation After Commission Accrued

**What goes wrong:**
A provider's ticket is cancelled (via a webhook cancellation event, an admin correction, or the existing `deleteMany` pattern in PULL sync). The `ProviderCommissionLedger` row for the draw-that-included-that-ticket was already written. The ledger row is now stale — it includes commission on sales that were reversed.

**Warning sign:** `ProviderCommissionLedger.amount` for a draw exceeds the result of applying the commission formula to the current (post-cancellation) `DrawFinancial.totalSales` for that draw.

**Prevention:**
- The commission ledger row must be immutable once written. Cancellations are handled via a compensating ledger row: a new `ProviderCommissionLedger` row with a negative `amount` referencing the original draw and a `reason: 'CANCELLATION_ADJUSTMENT'`.
- Do not delete or update the original positive ledger row — this destroys the audit trail.
- `ProviderWeeklySettlement` is computed as `SUM(ledger.amount)` for the period — both positive and compensating rows net out correctly.
- If a full draw is cancelled (status `CANCELLED`), write a compensating row for the entire draw's commission.

**Phase:** Phase 3 (commission calculations). The compensating-row pattern must be designed before the first settlement is generated.

---

### Pitfall F-10: Backfill Script Uses PUBLISHED Status That Causes Enum Error

**What goes wrong:**
According to project memory (`project_draw_status_enum.md`, verified 2026-05-11): production VPS 94 **no longer has `PUBLISHED` in the DrawStatus enum**. The enum is `{SCHEDULED, CLOSED, DRAWN, CANCELLED}`. Any query that uses `status = 'PUBLISHED'` or `status IN ('DRAWN', 'PUBLISHED')` will throw a PostgreSQL enum cast error — not return 0 rows, but throw an error that crashes the query.

The backfill script is likely to include `status IN ('DRAWN', 'PUBLISHED')` based on the outdated CLAUDE.md comment ("production still uses PUBLISHED"). Using this in the backfill causes the entire backfill to fail on production.

**Warning sign:** Backfill script exits with `ERROR: invalid input value for enum "DrawStatus": "PUBLISHED"` immediately on the first query against production.

**Prevention:**
- The backfill script must filter by `status = 'DRAWN'` only. No `PUBLISHED` reference.
- Before running any script against production, verify the enum: `SELECT unnest(enum_range(NULL::"DrawStatus"))`.
- Add a startup check to the backfill script:
  ```javascript
  const enumValues = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"DrawStatus")) AS v`;
  const hasPublished = enumValues.some(r => r.v === 'PUBLISHED');
  if (hasPublished) throw new Error('Unexpected PUBLISHED enum — check which env this is running against');
  ```
- Update CLAUDE.md root file to reflect that production no longer uses PUBLISHED (note: the memory `project_draw_status_enum.md` already says CLAUDE.md is outdated).

**Phase:** Phase 2 (backfill script). This check must be the first line of the script, before any draw queries.

---

### Pitfall F-11: New pg-boss Queues Missing createQueue — Silent Job Loss

**What goes wrong:**
This is the documented pg-boss v10 bug from `project_pgboss_createqueue_bug.md`. `boss.work(queueName, handler)` does not create the queue row in `pgboss.queue`. `boss.send(queueName, data)` silently returns `null` if the row does not exist. The financial worker `calculate-draw-financials` will be a new queue. If `register.js` registers it with `boss.work()` but without a preceding `await boss.createQueue(QUEUES.CALCULATE_DRAW_FINANCIALS)`, every single financial aggregate write from the cron trigger will be silently lost.

This has already burned the project once (Maxplay `sync-scrape-tickets`) and is documented as a latent bug in several existing queues.

**Warning sign:** Cron Linux triggers the queue, `trigger-pgboss-cron.mjs` logs `enqueued job=null` instead of a UUID. `pgboss.job` has no rows for the queue name. `DrawFinancial` table stays empty.

**Prevention:**
- The pattern is mandatory: `await boss.createQueue(QUEUES.X)` immediately before `await boss.work(QUEUES.X, ...)`. Mirror the `retry-failed-publications` or `EXECUTE_DRAW_SWEEP` blocks in `register.js` — not the `simulate-bets` block (which is missing `createQueue`).
- After deploying the new workers to production, run: `SELECT name FROM pgboss.queue;` and verify all new queue names are present. This is the smoke test before trusting any scheduled job.
- Add the new queue names to the `ALLOWED_QUEUES` set in `trigger-pgboss-cron.mjs`. A queue not in this set cannot be triggered by cron, which means the financial calculations will never run.

**Phase:** Phase 1 (DrawFinancial schema + worker). Must be verified before production deploy.

---

### Pitfall F-12: New Cron Trigger Not Added to /etc/cron.d/tote-triggers

**What goes wrong:**
The `calculate-draw-financials` worker is triggered post-totalization (chained from `step-calculate-stats`) — not by cron Linux directly. But the `calculate-provider-commission` worker and the weekly settlement snapshot likely need cron Linux triggers. If the deploy checklist does not include "update `/etc/cron.d/tote-triggers` on VPS 94," the trigger never fires. Workers can be registered in `register.js` perfectly, but without a cron entry sending jobs to the queue, nothing runs.

The cron file path is absolute and VPS-specific. It cannot be deployed via `git pull` — it requires an explicit `ssh 94 "sudo cp ..."` step or manual edit.

**Warning sign:** Commission calculations never appear in the ledger after go-live. `pgboss.job` shows no completed jobs for the commission queue. The worker registration log appears but no jobs are being consumed.

**Prevention:**
- Each new queue that requires periodic triggering must have a corresponding entry in `trigger-pgboss-cron.mjs`'s `ALLOWED_QUEUES` set AND a cron entry in `/etc/cron.d/tote-triggers`.
- The deploy runbook for this milestone must include: "3. Update `/etc/cron.d/tote-triggers` with new weekly settlement trigger. Verify with `ssh 94 'cat /etc/cron.d/tote-triggers'`."
- Weekly settlement cron timing: Sunday 00:05 Venezuela time (= Sunday 04:05 UTC, since Venezuela is UTC-4). The existing triggers use UTC-aware times.

**Phase:** Phase 3 (commission calculations) deploy step. Include the cron file update as a required checklist item, not an afterthought.

---

### Pitfall F-13: Worker Recursion via Legacy .execute() Pattern

**What goes wrong:**
This is the documented pattern from `feedback_worker_recursion_pattern.md`. If the `calculate-draw-financials` logic is initially written as a function on a Croner-style job class (e.g., because the developer copies the structure of `draw-stats.service.js`), and then a pg-boss worker calls `.execute()` on that class, and `.execute()` contains a `if (process.env.PGBOSS_X) { boss.send(...); return; }` guard, the worker will re-enqueue itself into its own queue → loop. This caused 74 jobs/5min explosion previously.

**Warning sign:** `pgboss.job` accumulates a growing number of `calculate-draw-financials` jobs within seconds of the first trigger. Backend CPU spikes. Emergency stop: `pm2 stop tote-backend`.

**Prevention:**
- New workers for this milestone must NOT follow the hybrid `.execute()` pattern. Instead: implement the logic directly as a service function (`drawFinancialsService.calculateForDraw(drawId)`). The pg-boss worker imports and calls the service. There is no Croner job class.
- This is the "better refactor" mentioned in the feedback memory: "move the work inline to a service and have worker AND Croner-tick call the service directly."
- If for any reason a Croner-legacy wrapper is used, the `viaWorker: true` parameter is mandatory when calling `.execute()` from a worker.

**Phase:** Phase 1 (DrawFinancial schema + worker). The service-first pattern must be established before any worker is wired.

---

### Pitfall F-14: File Receipt Upload Security

**What goes wrong:**
The accounting module stores receipts/comprobantes as uploaded files. Common mistakes:

1. **No MIME type validation:** An attacker (or a misconfigured client) uploads a `.php` or `.html` file as "receipt.pdf." If stored under the Express static path, it becomes executable or renderable.
2. **Path traversal:** `filename` from the multipart body contains `../../etc/passwd`. If not sanitized, files land outside the intended upload directory.
3. **Receipts stored in `/var/proyectos/tote-web/backend/uploads/`:** Not included in backups. VPS migration (as happened 144→94) destroys all receipts.
4. **Unbounded file size:** No `maxSize` limit on the multer configuration allows OOM or disk exhaustion.

**Warning sign for #3:** After the next VPS migration, all `AccountingEntry.attachmentUrl` fields point to files that no longer exist.

**Prevention:**
- Accept only `application/pdf`, `image/jpeg`, `image/png` MIME types. Validate on the server (not just the client's `Content-Type` header) using `file-type` npm package or magic byte inspection.
- Generate a UUID-based filename on the server side. Never use the client-supplied filename.
- Store files outside the web root. Use `/var/proyectos/tote-web/backend/storage/receipts/` (already excluded from static serving) — NOT `/public/` or any path served by Express static.
- Set multer `limits: { fileSize: 5 * 1024 * 1024 }` (5MB max).
- Document the backup requirement: the `storage/receipts/` directory must be included in whatever backup procedure exists for the VPS. If no backup procedure exists, this is the time to create one.

**Phase:** Phase 4 (accounting module). File upload config must be part of the initial implementation.

---

## Minor Pitfalls

---

### Pitfall F-15: ISO Week vs Sunday-Start Week for Settlement Boundaries

**What goes wrong:**
The commission settlement is described as "weekly." ISO 8601 weeks start on Monday. JavaScript's `getDay()` returns 0 for Sunday. If the settlement query uses `EXTRACT(WEEK FROM drawDate)` in PostgreSQL (which uses ISO weeks, Monday-start) but the admin UI displays weeks calculated via `new Date().getDay()` (which may treat Sunday as day 0 of the next week), the boundary draws are attributed to different weeks in backend vs frontend. A draw at Sunday 11:00 PM is week N in ISO but might display as week N+1 in a JS-native week formatter.

**Warning sign:** One or two draws per week appear in the wrong week's settlement total. The discrepancy is always a Sunday draw.

**Prevention:**
- Define the settlement week boundary explicitly in `dateUtils.js` and use it everywhere: both the backend settlement query and the frontend display.
- Use ISO weeks (`date-fns/getISOWeek`, or PostgreSQL `EXTRACT(ISOYEAR FROM drawnAt), EXTRACT(WEEK FROM drawnAt)`) consistently throughout.
- Document the boundary in the `ProviderWeeklySettlement` schema: "week boundaries are ISO 8601 (Monday 00:00 VE to Sunday 23:59 VE)."

**Phase:** Phase 3 (commission calculations). Pin the week definition before the first settlement query is written.

---

### Pitfall F-16: Scope Creep Into Double-Entry Bookkeeping

**What goes wrong:**
PROJECT.md explicitly excludes "double-entry bookkeeping / chart of accounts." But the accounting module will have `INCOME`, `EXPENSE`, and `PAYMENT` categories. A developer or stakeholder may propose adding "accounts" to categorize these — and then "journals" to track debits/credits — and then "trial balance" — and suddenly the project is building a half-implemented ERP. A half-implemented ERP is worse than no ERP: it has the operational burden of both systems with the correctness guarantees of neither.

**Warning sign:** A PR introduces an `Account` model or a `JournalEntry` model. Or a UI spec asks for a "chart of accounts" screen.

**Prevention:**
- Enforce the boundary at the schema level: there is no `Account` model in this milestone. `AccountingEntry` has a `category` string field (configurable categories), which is operationally sufficient.
- Any feature request for accounts, journals, trial balance, or AP/AR should be deferred to a future milestone with explicit scope definition.
- The weekly P&L (income net of commissions vs expenses → BsF balance) is the reporting endpoint. Anything beyond that is out of scope.

**Phase:** Phase 4 (accounting module design). The decision to not implement double-entry must be a named decision in PROJECT.md Key Decisions section before any schema is written.

---

### Pitfall F-17: Historical Commission Backfill Without Historical Config

**What goes wrong:**
The project does not have historical commission configuration records for the period before this milestone (since the commission system does not exist yet). If the backfill script attempts to calculate commissions for the ~2600 historical draws, there is no `ProviderCommissionConfig` to apply — the system will either write zeros, throw errors, or silently skip rows depending on how the null case is handled.

**Warning sign:** A backfill script that calls the commission calculation service for historical draws produces `ProviderCommissionLedger` rows with `amount = 0` for all historical draws. These rows are technically incorrect (they represent "no commission agreed") not "commission calculated as zero."

**Prevention:**
- Historical commission backfill is explicitly out of scope (PROJECT.md already implies this: "start fresh from a specific date"). Do not write `ProviderCommissionLedger` rows for draws before the go-live date of this milestone.
- The `DrawFinancial` backfill (Phase 2) and the commission calculation (Phase 3) are separate scripts. The commission script should only process draws where `drawnAt >= commissionsGoLiveDate`.
- The commissionsGoLiveDate should be a constant in the migration/script, not a magic number.

**Phase:** Phase 2 (backfill script). Explicitly document which tables the backfill populates and which it does not touch.

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|------------|
| Phase 1 | DrawFinancial worker | F-1: aggregate before prizes done | Guard on `prizesProcessed=true` |
| Phase 1 | DrawFinancial worker | F-3: multi-draw ticket attribution | Aggregate via TicketDetail.drawId, not Ticket.drawId |
| Phase 1 | pg-boss registration | F-11: missing createQueue → silent loss | createQueue before work(); verify pgboss.queue table |
| Phase 1 | Service pattern | F-13: worker recursion via .execute() | Implement as service function, not Croner-style class |
| Phase 2 | Backfill script | F-2: race with live worker during backfill | Upsert pattern; skip draws within last 1 hour |
| Phase 2 | Backfill script | F-10: PUBLISHED enum error on production | Filter by `status = 'DRAWN'` only; startup enum check |
| Phase 2 | Backfill script | F-17: historical commission data missing | Only populate DrawFinancial, not ProviderCommissionLedger |
| Phase 3 | Commission schema | F-5: mid-week config change retroactive | ProviderCommissionConfig with effectiveFrom, append-only |
| Phase 3 | Commission amounts | F-4: rounding accumulation | NUMERIC(18,8) in DB; formula applied to weekly aggregate |
| Phase 3 | Commission cancellations | F-9: ticket cancelled after commission accrued | Compensating negative ledger rows, not row deletion |
| Phase 3 | Cron deploy | F-12: cron trigger not added to VPS | Deploy runbook must include /etc/cron.d update step |
| Phase 3 | Week boundaries | F-15: ISO week vs Sunday-start | Pin ISO week boundary in dateUtils.js |
| Phase 4 | Accounting schema | F-6: missing exchange rate default | Require exchangeRateId for USD entries; block UI if no today's rate |
| Phase 4 | Accounting records | F-7: re-conversion using today's rate | Immutable amountBsF; USD equivalent = amountBsF / historicalRate |
| Phase 4 | Accounting schema | F-8: tasa paralela vs BCV unlabeled | rateType field in ExchangeRate from day one |
| Phase 4 | Scope | F-16: double-entry creep | Named decision in PROJECT.md before any schema is written |
| Phase 4 | File upload | F-14: receipt storage security | MIME validation, UUID filename, 5MB limit, no-web-root path |
| Phase 5 | Reports | F-7: historical re-conversion | Test report with entries from 6+ months ago |

---

## "Looks Done But Isn't" Checklist

- [ ] `DrawFinancial` worker checks `draw.prizesProcessed = true` before writing — not just `draw.statsCalculated`
- [ ] Aggregation is via `TicketDetail.drawId`, not `Ticket.drawId` — verified with a multi-draw ticket test
- [ ] `register.js` has `await boss.createQueue(QUEUES.CALCULATE_DRAW_FINANCIALS)` before `await boss.work(...)`
- [ ] New queue names are in the `ALLOWED_QUEUES` set in `trigger-pgboss-cron.mjs`
- [ ] Backfill script has startup enum check and filters `status = 'DRAWN'` only
- [ ] `ProviderCommissionConfig` has `effectiveFrom` column; existing rows are never updated, only superseded
- [ ] Commission amounts stored as `NUMERIC(18,8)` not `NUMERIC(12,2)`
- [ ] `ExchangeRate` has `rateType` field; entries are immutable (no UPDATE, only INSERT)
- [ ] USD entries require `exchangeRateId` — enforced in schema, not only in UI
- [ ] Reports use `amountBsF / historicalRate` (not `originalAmount / currentRate`) for USD equivalent
- [ ] Receipt uploads: MIME check + UUID filename + 5MB limit + storage outside web root
- [ ] Deploy runbook includes: (1) `pgboss.queue` verification, (2) `/etc/cron.d/tote-triggers` update, (3) backfill smoke test

---

*Pitfalls research for: financial layer (aggregates, commissions, multi-currency accounting) added to live lottery system*
*Researched: 2026-05-15*
