---
phase: 13
plan: 3
subsystem: backend/routes+middleware+attachments
tags: [accounting, contabilidad, receipts, multer, file-type, static-guard, auditlog, integration-test]
requirements:
  - FIN-LEDGER-04
  - FIN-LEDGER-05
dependency_graph:
  requires:
    - "Plan 13-01: prisma.accountingEntry / accountingEntryAttachment / exchangeRate / category accessors + 3 enums"
    - "Plan 13-02: exchange-rate.controller / accounting-entry.controller / category.controller — all class-default exports"
    - "Plan 13-02: accounting-entry.service.NoRateForDateError (F-6 backend block target for test 2)"
    - "multer@^2.1.1 + file-type@^19 (already installed)"
    - "date-fns (already a transitive dep)"
    - "jsonwebtoken (already in backend deps for the existing auth middleware)"
    - "Seeded admin user (any role=ADMIN) + at least one active EXPENSE Category in local DB"
  provides:
    - "static-storage-guard.middleware.js#staticStorageGuard (P-1 closure for F-14)"
    - "upload.middleware.js#uploadReceipt (multer memoryStorage + 5MB + files:1, NO fileFilter)"
    - "attachment.service.js#validateAndStore / getAttachmentStream / deleteAttachment"
    - "attachment.controller.js: class AttachmentController { upload, download, remove }"
    - "contabilidad.routes.js: 15-route admin-only router with router-level multer error handler"
    - "Mount: app.use('/storage', staticStorageGuard) at backend/src/index.js:139"
    - "Mount: app.use('/api/contabilidad', contabilidadRoutes) at backend/src/index.js:273"
  affects:
    - "Plan 13-04 (admin UI /admin/contabilidad) consumes /api/contabilidad/* and POST /asientos/:id/attachments"
tech_stack:
  added: []
  patterns:
    - "P-1 closure: staticStorageGuard mounted on '/storage' BEFORE express.static('/storage', ...). Express middleware order is load-bearing — guard at index.js:139, static at index.js:140."
    - "F-14 byte-level MIME validation BEFORE fs.writeFile. multer.memoryStorage + fileTypeFromBuffer rejects HTML-renamed-as-PDF with 422 and no orphan file ever lands on disk."
    - "T-13-05 path hygiene: filename on disk is crypto.randomUUID() + detected.ext. The operator-supplied originalName is preserved only in the AccountingEntryAttachment.originalName column for UI display — never on the filesystem."
    - "D-04 fiscal-month bucketing: disk path uses entry.entryDate (NOT upload date) for YYYY/MM. A receipt uploaded today for a December entry lands under storage/receipts/2025/12/ — fiscal archives stay consistent."
    - "P-3 friendly multer errors: router-level error handler at the bottom of contabilidad.routes.js catches err.code==='LIMIT_FILE_SIZE' and returns 413 { error: 'Archivo excede 5MB' }."
    - "P-4 full AuditLog diagnostic triple on every mutation: userId + ipAddress (req.ip — trust proxy at index.js:24, P-8) + userAgent (req.get('user-agent'))."
    - "FIN-RATE-02 immutability enforced via route SURFACE: NO PUT, NO DELETE on /tasas."
    - "FIN-LEDGER-06 soft-delete only on /categorias — no DELETE handler exposed."
    - "Phase 11 test-harness pattern: inline express() app on app.listen(0) instead of running the dev server. Reuses prisma singleton via dynamic import AFTER dotenv.config() so DATABASE_URL is in process.env."
key_files:
  created:
    - "backend/src/middlewares/static-storage-guard.middleware.js"
    - "backend/src/middlewares/upload.middleware.js"
    - "backend/src/services/attachment.service.js"
    - "backend/src/controllers/attachment.controller.js"
    - "backend/src/routes/contabilidad.routes.js"
    - "backend/src/__tests__/contabilidad.integration.test.js"
    - ".planning/phases/13-exchange-rate-accounting-ledger/13-03-SUMMARY.md"
  modified:
    - "backend/src/index.js (4 lines: 1 import at top, 1 import at routes block, 2 mount lines)"
decisions:
  - "Followed PATTERNS.md sections 5, 9, 10, 11, 12, 13 verbatim — no structural deviations"
  - "Test harness uses INLINE express app per planner pre-decision O5 (saved orchestration time vs running the prod dev server). The app mounts only the Phase-13 critical wiring (trust proxy, json body parser, staticStorageGuard, express.static, contabilidad router) — no sockets, pg-boss, telegram, or other prod-only init"
  - "JWT signed directly against process.env.JWT_SECRET using prisma.user.findFirst({ role: 'ADMIN', email: 'admin@tote.com' || any active admin }). Avoids depending on knowing the seeded password and works against the existing 5 admins in the local DB (admin@tote.com, Brito, Luis, Tocayo, Rafael)"
  - "Test cleanup happens in afterAll, scoped to the row ids each test stores in module-level variables (rateId / entryId / attachmentId / reversalId). TEST_PREFIX is a defensive disambiguator on description fields but the id-scoped DELETEs make it unnecessary"
metrics:
  duration_minutes: ~6
  tasks_completed: 4
  files_created: 7
  files_modified: 1
  commits:
    - hash: "a3acde6"
      message: "feat(13-03): static-storage guard + upload middleware"
    - hash: "7ae85b4"
      message: "feat(13-03): attachment service + controller with byte-validated MIME"
    - hash: "68c4e91"
      message: "feat(13-03): contabilidad routes + mount"
    - hash: "5bea0d7"
      message: "test(13-03): contabilidad integration test"
  completed: 2026-05-15T19:30:00Z
---

# Phase 13 Plan 3: Contabilidad Routes + Attachments + Static Storage Guard Summary

Final backend wiring for Phase 13. Closes the P-1 BLOCKING gap (`/storage/receipts/*` was publicly served by `express.static`) and lights up the receipt-upload pipeline end to end. Six routes (`/tasas`, `/asientos`, `/asientos/:id/reverse`, `/asientos/:id/attachments`, `/categorias`, `/categorias/:id/deactivate`+`/reactivate`) plus the auth-gated download/delete attachment endpoints — 15 routes total — compose the `/api/contabilidad` admin surface. All 6 integration assertions pass against the live local prod-mirror DB in ~0.28s.

After this plan lands, the only Phase-13 work remaining is the frontend in 13-04 (`/admin/contabilidad` UI with 4 sub-tabs). No further backend changes required.

## P-1 Mount Order (the security item)

```text
backend/src/index.js
  15  import { staticStorageGuard } from './middlewares/static-storage-guard.middleware.js';
  ...
  139 app.use('/storage', staticStorageGuard);          // ← inserted by this plan
  140 app.use('/storage', express.static(path.join(__dirname, '../storage'), {
  141   maxAge: '1d',
  142   immutable: true,
  ...
```

Express middleware runs in registration order. The guard at line 139 short-circuits `req.path` starting with `/receipts/` to `401` before the static handler at line 140 can stream the bytes. Non-receipts traffic (`/storage/games/1/foo.png`, etc.) is unaffected — the guard calls `next()`.

Verified by integration test 5 (`GET /storage/receipts/2026/05/anything.pdf` → 401) and by the local smoke `node --check src/index.js` exiting 0 after the edit.

## Mount of the Contabilidad Router

```text
backend/src/index.js
  220 import contabilidadRoutes from './routes/contabilidad.routes.js';   // ← inserted by this plan
  ...
  272 app.use('/api/commissions', commissionRoutes);
  273 app.use('/api/contabilidad', contabilidadRoutes);                    // ← inserted by this plan
```

Placed next to `/api/commissions` so Phase 12 + Phase 13 admin surfaces sit together in the route block — easier to grep, fits the existing alphabetic-ish convention.

## Files Created (Final Shape)

```text
backend/src/middlewares/static-storage-guard.middleware.js   30 lines   exports staticStorageGuard
backend/src/middlewares/upload.middleware.js                 33 lines   exports uploadReceipt
backend/src/services/attachment.service.js                  120 lines   exports validateAndStore / getAttachmentStream / deleteAttachment
backend/src/controllers/attachment.controller.js            115 lines   class AttachmentController { upload, download, remove }
backend/src/routes/contabilidad.routes.js                    87 lines   15 routes + multer error handler
backend/src/__tests__/contabilidad.integration.test.js      357 lines   6 assertions, inline-app harness
```

## Integration Test — Final Shape

**Harness:** INLINE express app (planner pre-decision O5 honored). `beforeAll` spins up an `app.listen(0)` and stashes the assigned port into `baseUrl`. `afterAll` closes the server + calls `prisma.$disconnect()`. The app mounts only: `trust proxy 1`, `express.json()`, the P-1 guard, `express.static('/storage')`, and `/api/contabilidad`. Production index.js — including pg-boss, sockets, telegram bots, etc. — is NOT booted.

**JWT setup:** Sign a fresh token directly against `process.env.JWT_SECRET` using `jsonwebtoken.sign` with the seeded admin's id+role+email+username. Mirrors the payload shape `authService.generateToken` produces, so the route-level `authenticate` middleware accepts it without a real login round-trip.

**Cleanup:** `afterAll` deletes by id (rateId / entryId / attachmentId / reversalId) plus AuditLog rows touching those entities. Verified by post-test SQL: `SELECT count(*) FROM "ExchangeRate" WHERE date='2026-05-15'` returns 0, `SELECT count(*) FROM "AccountingEntry" WHERE description LIKE 'TEST-13-%'` returns 0.

**Runtime:** 0.281s. No flakes across the two consecutive runs performed during execution. The inline-app pattern is fast because there's no socket/pg-boss/telegram boot.

**6 Assertions — all pass:**

| # | Behavior                                  | Status |
| - | ----------------------------------------- | ------ |
| 1 | Happy: rate → USD entry → amountBsF=2000 locked (F-7) | ✓ pass |
| 2 | F-6 block: USD entry without rate → 400   | ✓ pass |
| 3 | F-14 MIME spoof: HTML→.pdf → 422 + no orphan file | ✓ pass |
| 4 | F-14 happy: valid PDF → 201 + file at YYYY/MM bucket | ✓ pass |
| 5 | P-1 guard: GET /storage/receipts/* → 401   | ✓ pass |
| 6 | D-06 reversal + AuditLog count = 4 with full diagnostic triple | ✓ pass |

## Deviations from Plan

### 1. [Rule 1 — Bug] amountBsF precision assertion changed from raw-string equality to numeric + DB readback

**Found during:** Task 4 first test run.

**Issue:** Plan said `assert response.data.amountBsF === '2000.00000000'`. But the JSON wire format from `prisma.accountingEntry.create({...})` returns the Decimal as `"2000"` (Prisma → JSON strips trailing zeros from Decimal values — the canonical decimal form, not the `@db.Decimal(18,8)` zero-padded shape). The plan's exact-string assertion would always fail for round-magnitude values like 2000.

**Fix:** The test now asserts numeric closeness on the wire (`Number(amountBsF)` ≈ 2000 with 8-decimal tolerance via `toBeCloseTo`) AND re-fetches the row via `prisma.accountingEntry.findUnique` to assert `row.amountBsF.toFixed(8) === '2000.00000000'`. This preserves the plan's intent (verify 8-decimal precision is end-to-end correct) while accommodating the JSON round-trip behavior. Same fix applied to test 6's `-2000.00000000` assertion.

**Files modified:** `backend/src/__tests__/contabilidad.integration.test.js`.

**Commit:** `5bea0d7`.

### 2. [Note, not a deviation] Comments in attachment.service.js originally tripped the `! grep -E "req\.file\.mimetype"` verify check

**Found during:** Task 2 verify step.

**Issue:** The Task 2 plan-defined verify command uses `! grep -E "req\.file\.mimetype" backend/src/services/attachment.service.js` to assert the service never reads the untrusted client header. Initial JSDoc comments referenced the literal token `req.file.mimetype` while explaining WHY it must not be trusted — which made the grep match.

**Fix:** Reworded both comments to describe the concept ("the multer-provided client mimetype is untrusted", "byte-detected, never the client-supplied header") without using the literal token. Functional behavior is unchanged — the service never reads `req.file.mimetype` (only `req.file.buffer` and `req.file.originalname`).

**Files modified:** `backend/src/services/attachment.service.js` (comments only).

**Commit:** `7ae85b4`.

### 3. [Rule 2 — Auto-add hardening] download() stream-error handler added

**Found during:** Task 2 implementation.

**Issue:** PATTERNS.md section 9's `download()` pipes the createReadStream to `res` but does not attach an error handler. If the file is missing on disk (drift between DB and filesystem — possible if `deleteAttachment` was interrupted mid-flight), the stream emits `error` with no listener, and depending on Node version that surfaces as an unhandled `uncaughtException`.

**Fix:** Added `stream.on('error', ...)` that logs the error and returns 500 if headers haven't been sent (else calls `res.end()`). This is defensive — the happy-path test doesn't exercise it, but it closes a known foot-gun.

**Files modified:** `backend/src/controllers/attachment.controller.js`.

**Commit:** `7ae85b4`.

## Authentication Gates

None encountered.

## Verification Checklist

- [x] `staticStorageGuard` mounted at backend/src/index.js:139 immediately BEFORE `express.static('/storage', ...)` at line 140
- [x] `uploadReceipt` config: `multer.memoryStorage()` + `fileSize: 5MB` + `files: 1`, NO fileFilter option set
- [x] `attachment.service.js` byte-validates with `fileTypeFromBuffer` BEFORE `fs.writeFile`
- [x] Filename on disk is `crypto.randomUUID() + '.' + detected.ext` — operator's `originalName` is in the DB column only
- [x] Disk path uses entry.entryDate for YYYY/MM (D-04 + P-5)
- [x] `attachment.controller.js` writes AuditLog with `ipAddress: req.ip` + `userAgent: req.get('user-agent')` on UPLOAD and DELETE
- [x] `contabilidad.routes.js` mounts `authenticate + authorize('ADMIN')` at the top
- [x] `uploadReceipt.single('file')` precedes `attachmentController.upload`
- [x] Router-level error handler maps `LIMIT_FILE_SIZE` → 413 with friendly Spanish message
- [x] NO PUT, NO DELETE on `/tasas` (FIN-RATE-02)
- [x] Router mounted at `/api/contabilidad` in backend/src/index.js:273
- [x] `node --check src/index.js` exits 0
- [x] Integration test runs 6/6 pass in ~0.28s, idempotent across consecutive runs
- [x] Local DB cleanup verified post-test (0 leftover rate/entry rows)
- [x] LOCAL ONLY — no `ssh 94`, no `git push`, no `pm2 restart` invoked

## Self-Check: PASSED

Files verified to exist:

- `backend/src/middlewares/static-storage-guard.middleware.js` FOUND
- `backend/src/middlewares/upload.middleware.js` FOUND
- `backend/src/services/attachment.service.js` FOUND
- `backend/src/controllers/attachment.controller.js` FOUND
- `backend/src/routes/contabilidad.routes.js` FOUND
- `backend/src/__tests__/contabilidad.integration.test.js` FOUND
- `backend/src/index.js` MODIFIED (4 lines added)

Commits verified in `git log`:

- `a3acde6 feat(13-03): static-storage guard + upload middleware` FOUND
- `7ae85b4 feat(13-03): attachment service + controller with byte-validated MIME` FOUND
- `68c4e91 feat(13-03): contabilidad routes + mount` FOUND
- `5bea0d7 test(13-03): contabilidad integration test` FOUND

Test run (final, all 6 pass):

```
PASS src/__tests__/contabilidad.integration.test.js
  Phase 13 — contabilidad integration
    ✓ 1. happy path: rate + USD entry locks amountBsF=2000 and exchangeRateId (F-7) (37 ms)
    ✓ 2. F-6 backend block: USD entry without rate for entryDate → 400 (2 ms)
    ✓ 3. F-14 MIME spoof: HTML renamed evil.pdf → 422 and NO file lands on disk (6 ms)
    ✓ 4. F-14 happy upload: valid PDF → 201 and file exists at YYYY/MM bucket (7 ms)
    ✓ 5. P-1 guard: GET /storage/receipts/* without auth → 401
    ✓ 6. D-06 reversal + D-07 AuditLog count = 4 with non-null ipAddress + userAgent (14 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Time:        0.281 s
```

## Pointer for Plan 13-04 (Frontend)

The admin UI `/admin/contabilidad` (D-05) consumes the route surface this plan landed:

| UI Tab          | Endpoints                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Asientos        | `POST /api/contabilidad/asientos` + `GET /api/contabilidad/asientos` + `GET /:id` + `PATCH /:id` + `POST /:id/reverse` |
| Tasas de cambio | `POST /api/contabilidad/tasas` + `GET /api/contabilidad/tasas`                                     |
| Categorías      | `POST /api/contabilidad/categorias` + `GET` + `PATCH /:id` + `PATCH /:id/deactivate` + `PATCH /:id/reactivate` |
| Pagos           | Filtered `GET /api/contabilidad/asientos?type=PAYMENT&settlementId=...`                            |
| Adjuntos        | `POST /api/contabilidad/asientos/:id/attachments` (multipart, field name `file`) + `GET /:attId` + `DELETE /:attId` |

Frontend MUST NOT link receipts via `/storage/receipts/*` URLs — those are 401'd by the P-1 guard. Use the auth-gated `GET /api/contabilidad/asientos/:id/attachments/:attId` endpoint instead.
