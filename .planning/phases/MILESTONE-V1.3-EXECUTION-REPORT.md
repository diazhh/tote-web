---
milestone: v1.3
milestone_name: Capa Financiera y Contabilidad
status: COMPLETE (local mirror)
executed_on: 2026-05-15
executed_by: Claude Opus 4.7 (autonomous milestone-execution session)
base_commit: 833a3b3 (docs(phase-14): complete v1.3 milestone planning)
tip_commit: 2c67158 (docs(14-04): SUMMARY + STATE.md milestone v1.3 closeout)
total_commits: 47
---

# Milestone v1.3 — Capa Financiera y Contabilidad — Execution Report

## Verdict

**READY FOR PROD DEPLOY** against the local prod-mirror DB.
Production deploy is **OUT of scope this session** — operator runs the per-phase `*-DEPLOY.md` runbooks (`.planning/phases/12-…/12-DEPLOY.md`, `13-DEPLOY.md`, `14-DEPLOY.md`) in a future supervised `ssh 94` session.

## Scope landed

| Phase | Plans | Result |
|---|---|---|
| 12 — Provider Commission Engine | 12-01, 12-02, 12-03, 12-04 | ✅ Schema + service + workers + pipeline wiring + admin UI + backfill |
| 13 — Exchange Rate + Accounting Ledger | 13-01, 13-02, 13-03, 13-04 | ✅ Schema + services + controllers + routes + P-1 storage guard + admin UI + integration test |
| 14 — Report Refactor + Weekly P&L | 14-01, 14-02, 14-03, 14-04 | ✅ Data prep (P-D + prizesProcessed fix) + flag-gated services + weekly P&L + frontend + flag flipped |

12/12 plans executed. `.planning/STATE.md` updated: milestone v1.3 → COMPLETE, percent 100.

## Commits (per phase)

### Phase 12 — Provider Commission Engine (14 commits)

| SHA | Subject |
|---|---|
| `a8f29f6` | feat(12-01): commission schema + VE ISO-week helpers |
| `5a9e307` | feat(12-02): add commission.service.js with formula evaluators + ledger upsert |
| `e5e26be` | feat(12-02): add commission + weekly-settlement-snapshot pg-boss workers |
| `2e73f12` | chore(12-02): wire WEEKLY_SETTLEMENT_SNAPSHOT queue + bind real commission worker |
| `7d9492e` | docs(12-02): Plan 12-02 SUMMARY |
| `890df78` | feat(12-03): wire provider commission send + snapshot cron allowlist |
| `e6aadfd` | feat(12-03): commission admin controller + routes + Jest tests |
| `eb3dd59` | test(12-03): end-to-end integration test for commission pipeline |
| `f919516` | docs(12-03): Plan 12-03 SUMMARY |
| `70b6f02` | feat(12-04): admin commission UI |
| `fc86c33` | feat(12-04): backfill script + DEPLOY runbook |
| `9b99d2d` | docs(12-04): Phase 12 production deploy runbook |
| `0943356` | fix(12-04): report ledgerWritten as actual rows persisted |
| `34e190f` | docs(12-04): SUMMARY + automated checkpoint results |

### Phase 13 — Exchange Rate + Accounting Ledger (14 commits)

| SHA | Subject |
|---|---|
| `1220e91` | feat(13-01): add multer + file-type deps |
| `e1c403f` | feat(13-01): accounting schema models + enums |
| `3836d5c` | feat(13-01): apply phase13 migration |
| `36a9535` | docs(13-01): Phase 13 schema foundation summary |
| `c33ef7e` | feat(13-02): exchange-rate + category services |
| `772c30d` | feat(13-02): accounting-entry service with reversal $transaction |
| `c17558b` | feat(13-02): rate/entry/category controllers with AuditLog |
| `4e619be` | docs(13-02): services + controllers plan summary |
| `a3acde6` | feat(13-03): static-storage guard + upload middleware (**P-1 closure**) |
| `7ae85b4` | feat(13-03): attachment service + controller with byte-validated MIME |
| `68c4e91` | feat(13-03): contabilidad routes + mount |
| `5bea0d7` | test(13-03): contabilidad integration test |
| `c69814f` | docs(13-03): SUMMARY |
| `c86633f` | feat(13-04): contabilidad client lib + sidebar link |
| `1d3561e` | feat(13-04): tasas / categorias / pagos pages |
| `74f0bd3` | feat(13-04): asientos list + nueva + detail + reversal + attachments |
| `247f2f7` | docs(13-04): 13-DEPLOY.md |
| `3d74070` | docs(13-04): SUMMARY + automated checkpoint results + STATE update |

### Phase 14 — Report Refactor + Weekly P&L (12 commits)

| SHA | Subject |
|---|---|
| `72513a4` | feat(14-01): backfill-td-drawid.mjs (P-D mitigation script) |
| `a5e3831` | feat(14-01): fix-prizes-processed.mjs (D-05 step 1 script) |
| `088f785` | fix(14-01): use TicketDetail.prize predicate (schema reality) |
| `029595a` | docs(14-01): SUMMARY + Option A deviation |
| `1aee5a5` | feat(14-02): branch monitor.service.js#getDailyReport on useMaterialized flag |
| `678a7e0` | feat(14-02): branch accounting-report.service + extend getDrawById + controller env wiring |
| `a410ba7` | test(14-02): D-06 shadow comparison + REPORT_USE_MATERIALIZED flag enabled |
| `5281309` | docs(14-02): SUMMARY |
| `8d1b94f` | feat(14-03): pnl-report service core aggregator + ISO-week helpers + tests |
| `10b3cfe` | test(14-03): P-B PAYMENT double-count guard + FIN-REPORT-07 Excel/PDF buffers |
| `11681d0` | feat(14-03): pnl-report controller + routes + mount under /api/reportes |
| `552dacc` | docs(14-03): SUMMARY |
| `f680b81` | feat(14-04): pnl client lib + page + sidebar + .env.example |
| `a722bcb` | feat(14-04): drawDetailModal financial section + 14-DEPLOY.md |
| `2c67158` | docs(14-04): SUMMARY + STATE.md milestone v1.3 closeout |

## Test results

Per-phase backend test counts (Jest, `NODE_OPTIONS=--experimental-vm-modules`, `--runInBand`):

| Phase | Test count | Files |
|---|---|---|
| Phase 12 — dateUtils boundary tests | 6 | `dateUtils.test.js` |
| Phase 12 — commission service | 13 | `commission.service.test.js` |
| Phase 12 — commission workers (2 files) | 9 | `calculate-provider-commission.worker.test.js`, `weekly-settlement-snapshot.worker.test.js` |
| Phase 12 — commission controller | 15 | `commission.controller.test.js` |
| Phase 12 — pipeline integration | 4 | `commission-pipeline.integration.test.js` |
| Phase 13 — contabilidad integration | 6 | `contabilidad.integration.test.js` |
| Phase 14 — daily report legacy snapshot | 1 | `daily-report-legacy-snapshot.test.js` (P-A regression net) |
| Phase 14 — daily report materialized | 2 | `daily-report-materialized.test.js` |
| Phase 14 — P&L shadow comparison | 2 | `pnl-shadow-comparison.test.js` (D-06 bug demonstration) |
| Phase 14 — draws-getById financial | 2 | `draws-getById-financial.test.js` |
| Phase 14 — pnl-report service | 7 | `pnl-report-service.test.js`, `pnl-empty-data.test.js`, `pnl-double-count-guard.test.js`, `pnl-excel-pdf.test.js` |
| **Phase 14-04 full gate** | **56 / 56 across 13 suites** | (`pnl-`, `daily-report`, `draws-getById`, `commission`, `exchange`, `accounting`, `contabilidad`) |

Frontend build (`cd frontend && rm -rf .next && npx next build`) — **PASS** at end of Plan 14-04. All 7 new Phase 13 routes + new Phase 12 + Phase 14 pages compile cleanly as static pages.

## End-to-end API smoke (REPORT_USE_MATERIALIZED=true)

Backend `npm run dev` + frontend `npm run dev` started locally; curl against `http://localhost:3001` with a forged admin JWT (no live login, password not in repo). All routes verified:

| Endpoint | Method | Result |
|---|---|---|
| `/api/commissions/settlements` | GET (no auth) | 401 ✅ |
| `/api/commissions/settlements` | GET (admin JWT) | 200 OK, empty array (no settlements yet — expected) |
| `/api/contabilidad/categorias` | GET (admin JWT) | 200 OK, 9 seeded categories (5 EXPENSE + 2 INCOME + 2 PAYMENT) |
| `/api/contabilidad/tasas` | POST (BCV 36.50) | 201 OK, lock row created with createdById captured |
| `/api/contabilidad/asientos` (USD 100) | POST (admin JWT) | 201 OK, **amountBsF=3650 auto-computed**, exchangeRateId locked (F-7) |
| `/api/reportes/pnl/semanal?isoYear=2026&isoWeek=20` | GET (admin JWT) | 200 OK — weekIncome=2,127,252.67 BsF, weekGrossUtility=494,338.02 BsF, weekExpenses re-aggregated to 3650.00 after the test entry ✅ |
| `/api/reportes/pnl/semanal?isoYear=2026&isoWeek=20&apiSystemId=<maxplay>` | GET (admin JWT) | 200 OK — provider-scoped: weekIncome=112,336.00, weekExpenses=null (D-04 correct) ✅ |
| `/api/reportes/pnl/semanal/excel` | GET (admin JWT) | 200 OK — valid `Microsoft Excel 2007+` file, 7090 bytes ✅ |
| `/api/monitor/reporte?date=2026-05-14` | GET (admin JWT) | 200 OK — materialized branch returns draw data |
| `/storage/receipts/anything.pdf` | GET (no auth) | **401 ✅ P-1 guard active** |
| `/admin/comisiones` (frontend) | GET | 200 ✅ |
| `/admin/contabilidad` (frontend) | GET | 200 ✅ |
| `/admin/reportes/pnl-semanal` (frontend) | GET | 200 ✅ |

E2E test data (rate + USD entry) cleaned from DB after smoke.

## DB state after milestone

| Metric | Before | After |
|---|---|---|
| `DrawFinancial` row count | 133 | 2,468 |
| `DrawFinancialProvider` row count | 185 | ~6,400 (5 providers × 2,468 windowed) |
| `TicketDetail` rows with `drawId IS NULL` | 621,689 | 0 |
| `Draw` with `prizesProcessed=true` | 133 | 2,468 |
| `Draw` with `prizesProcessed=false` AND has winning detail | 2,335 | 0 |
| Reconciliation CSV mismatches | n/a | **0 / 2,468** ✅ |
| P-D regression (DrawFinancial rows with `ticketCount > 0 AND totalSales = 0`) | n/a | **0** ✅ |
| `ProviderCommissionLedger` rows | 0 | 0 (185 candidates skipped — no `ProviderCommissionConfig` exists yet; operator creates configs via the UI) |
| `Category` seed rows | 0 | 9 (idempotent ON CONFLICT) |

## Bugs found and fixed during execution (separate from plans)

1. **Plan 14-01 schema mismatch (CRITICAL — checkpoint resolved)**
   - The plan / 14-CONTEXT.md / 14-RESEARCH.md all referenced a `Prize` table that does **not** exist in this codebase. Prizes are denormalized onto `TicketDetail.prize`.
   - The executor agent halted at a checkpoint rather than guess. Operator (this orchestrator) approved **Option A**: predicate `EXISTS (SELECT 1 FROM TicketDetail td JOIN Ticket t ON t.id = td.ticketId WHERE (td.drawId = Draw.id OR (td.drawId IS NULL AND t.drawId = Draw.id)) AND td.prize > 0)`.
   - Bounded false-negative: ~3,469 all-loser DRAWN draws are intentionally NOT flipped. Their `DrawFinancial.totalPrize=0` either way, so the 14-02 shadow comparison remains valid for them.
   - Commit `088f785`.
2. **133 stale Phase 11 DrawFinancial rows (Plan 14-01 follow-up)**
   - First Phase 11 backfill rerun after the P-D fix reported 133 mismatches: the original 133 rows totalized **before** the P-D fix had stale `totalSales`. The Phase 11 script's resume gate (`totalizedAt IS NULL`) skipped them.
   - Fix: one-off `UPDATE` to reset `totalizedAt=NULL` for those 133 drawIds (extracted from the recon CSV), then re-ran `backfill-draw-financials.mjs --confirm`. Second pass: **0 mismatches**. No source change.
3. **AdminTelegramBot polling conflict with prod (operational)**
   - Local backend boot started a Telegram bot from the DB (an `AdminTelegramBot` row was seeded from the prod mirror), which polled Telegram with the same token as the live prod bot → `409 Conflict: terminated by other getUpdates request`.
   - Risk: if the local bot wins a getUpdates round, prod misses that message window.
   - Fix: `UPDATE "AdminTelegramBot" SET "isActive" = false` against the local DB only. Production unaffected.
   - **Recommendation:** add a check at boot or a session-config env var `DISABLE_ADMIN_TELEGRAM_BOTS=true` to mirror `DISABLE_SOCIAL_CHANNELS=true` — non-blocking for this milestone, noted for backlog.
4. **Plan 12-01 worktree base regression (procedural)**
   - The first `gsd-executor` worktree was created from a base older than current `main` (commit `715d2bc` instead of `833a3b3`), causing the rebase to conflict on `schema.prisma`. Resolved by copying the agent's output files onto `main` directly and re-committing. All subsequent plans dispatched without worktree isolation (working directly on `main` with per-task commits — same atomicity, no merge complexity).
   - **Recommendation:** investigate why `EnterWorktree` picked an older base. Backlog.
5. **Phase 12-04 frontend lint not runnable (pre-existing)**
   - `cd frontend && npm run lint -- --quiet` fails because ESLint is not initialized at project level. The 12-04 plan had this as a verification gate — substituted with grep-based acceptance gates per the agent's Rule 4 escalation. Issue is pre-existing, not introduced by v1.3.

## Deviations from plans (noted, all approved)

- **Plan 12-04**: backfill `--confirm` produced 0 ledger rows because the local mirror has zero `ProviderCommissionConfig` rows. All 185 (provider, draw) candidates went through the D-01 silent-skip path — by design. No configs were manufactured to make the test "succeed".
- **Plan 13-01**: `package-lock.json` not committed (repo policy: `backend/.gitignore` excludes it — Phase 11 precedent).
- **Plan 13-02**: Controller `update` uses an allow-list (`description / categoryId / settlementId`) on top of the service-level deny-list. Both layers enforce FIN-LEDGER-09; allow-list is safer against future schema growth. Reversal guard errors map to HTTP 400 (business errors), not 500.
- **Plan 14-02**: Shadow test 2 sub-test pins `totalPrize` match instead of `totalSales` because 2026-05-14 has real multi-draw tickets producing a legitimate `totalSales` divergence — that **is** the bug demonstration. `REPORT_USE_MATERIALIZED=true` lives in `backend/.env` (gitignored) — `.env.example` documents it instead.

## Out-of-scope items remaining (operator follow-up)

Manual steps the operator owns BEFORE prod deploy:

1. **Review the 12-DEPLOY.md, 13-DEPLOY.md, 14-DEPLOY.md runbooks** — they document the prod rollout sequence: git push, ssh 94, `prisma migrate deploy`, `prisma generate`, `pm2 restart tote-backend`, `pm2 restart tote-frontend` (after `npm run build` succeeds), cron line addition to `/etc/cron.d/tote-triggers` (`0 10 * * 1 root /usr/bin/node …trigger-pgboss-cron.mjs weekly-settlement-snapshot`), Phase 11 backfill rerun against prod data (which still uses `status='PUBLISHED'` instead of `status='DRAWN'` — the runbooks flag this for adjustment), and the 2-week-live-data gate before flipping `REPORT_USE_MATERIALIZED=true` on prod.
2. **Create ProviderCommissionConfig rows in the admin UI** (or via a seed) so the commission engine begins producing ledger rows on new draws. Until configs exist, the engine silently skips per D-01 by design.
3. **Investigate the AdminTelegramBot DB record** — decide whether the prod mirror should include active bot tokens or if the dev DB should always disable them at boot. Currently mitigated by manual UPDATE; consider an env-driven boot guard.
4. **The 3,469 all-loser DRAWN draws** (DRAWN + `prizesProcessed=false` + no winning detail) — Phase 14 intentionally left these untouched (Option A predicate from Plan 14-01). `DrawFinancial.totalPrize=0` for these matches the legacy path. If the operator wants those materialized too, a follow-up one-shot can flip the flag with the predicate `EXISTS (SELECT 1 FROM Ticket t WHERE t.drawId = Draw.id)` (any betting activity) — but only after confirming it does not retrigger any worker side-effects.

## Constraints honored

- ✅ LOCAL ONLY — no `ssh 94`, no `git push`, no `pm2 restart` executed in any phase
- ✅ `DISABLE_SOCIAL_CHANNELS=true` confirmed in `backend/.env` throughout
- ✅ `ADMIN_TELEGRAM_BOT_TOKEN` absent from `.env`; AdminTelegramBot DB record deactivated to prevent prod conflict
- ✅ `PGBOSS_EXECUTE_DRAW=false`, `PGBOSS_CLOSE_DRAW=false`, `PGBOSS_GENERATE_DAILY_DRAWS=false` throughout
- ✅ 47 atomic commits — one per Task in each plan, with `feat()`/`fix()`/`test()`/`chore()`/`docs()` prefixes consistent with Phase 11 style
- ✅ No unrelated dirty files auto-staged (the pre-existing `.planning/phases/01..10` deletions and other untracked docs remain exactly as they were at session start)
- ✅ Atomic test suites per phase; full Phase 14 suite of 56 tests passing across 13 suites at session end
- ✅ Plan checkpoints (12-04, 13-04, 14-04) auto-handled per orchestrator mandate

## Final status

```
Milestone v1.3 — Capa Financiera y Contabilidad
Status: COMPLETE (local mirror)
Tip:    2c67158
Total commits: 47
Total tests passing: 56 (final Phase 14 gate); ~80+ total across all phases
Frontend build: PASS
E2E API smoke: PASS (all routes return 200/201 with admin JWT; 401 without auth; P-1 guard active)

READY FOR PROD DEPLOY — operator runs *-DEPLOY.md runbooks in a future supervised ssh 94 session.
```
