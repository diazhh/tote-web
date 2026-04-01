# Phase 1: Schema Foundation - Research

**Researched:** 2026-04-01
**Domain:** Prisma schema extension + PostgreSQL data migration (no migration files — db push workflow)
**Confidence:** HIGH

## Summary

Phase 1 adds three new fields to the existing `ApiSystem` model (`slug`, `webhookToken`, `mode`) and creates a new `WebhookLog` model with a four-value status enum. It also adds `WEBHOOK_PUSH` to the existing `TicketSource` enum. There is one live row in `ApiSystem` in both production and local — the SRQ provider (UUID `022b1d7b-9e2f-4eaa-ab22-669976090fc2`) — which must be backfilled with `slug = 'srq'` and `mode = 'PULL'` without breaking any existing queries.

The critical constraint is that **this project uses `prisma db push` exclusively — there is no `migrations/` directory**. This means the schema is pushed directly and the slug backfill must be done via a companion SQL script run immediately after `db push`, not embedded in a migration file. Two-step push (nullable slug first → backfill → add @unique) is necessary because `@unique` on an empty-string column would fail for the existing row.

The project research documents (SUMMARY.md, ARCHITECTURE.md) have already characterized all architecture decisions for Phase 1. The schema section of this research narrows to the precise Prisma 6.x syntax, the `db push` workflow mechanics, the exact SRQ row state, and the two-step nullable strategy.

**Primary recommendation:** Use `prisma db push --accept-data-loss` for the two-step nullable-to-unique promotion. Run a companion SQL backfill script between the two pushes. Do NOT introduce `prisma migrate` — it would require a full migration history baseline and is out of scope.

<user_constraints>
## User Constraints (from CONTEXT.md / STATE.md / project docs)

### Locked Decisions
- SRQ stays as-is (PULL); do NOT modify SRQ polling code, `api-integration.service.js`, or `sync-api-tickets.job.js`
- Schema extends `ApiSystem` (not a new model); `WebhookLog` is a new model
- Synchronous ticket creation (no queue); log-first then process
- `PUSH` tickets use `source = 'WEBHOOK_PUSH'` to avoid collision with SRQ's `deleteMany({ source: 'EXTERNAL_API' })`
- `WebhookLog.status` enum: exactly four values — DISCOVERED, PROCESSED, DUPLICATE, FAILED

### Claude's Discretion
- Token storage strategy: plain vs bcrypt hash (operator decision pending — document both, default to plain for Phase 1 since Phase 3 handles token generation UI)
- Migration strategy for SRQ slug backfill: nullable-first or default value — research recommends nullable-first (see below)

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- Webhook endpoint implementation (Phase 2)
- Admin provider management UI (Phase 3)
- Webhook log viewer (Phase 4)
- HMAC signature verification (v2+)
- Log retention policy (v2+)
- Replay feature (v2+)
- Provider health monitoring (v2+)
- Refactoring SRQ into adapter pattern (explicitly out of scope per REQUIREMENTS.md)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-01 | `ApiSystem` model has `slug` (unique), `webhookToken`, and `mode` (PULL/PUSH) fields | Prisma 6.x syntax verified; two-step push strategy defined; exact SRQ row confirmed |
| SCHEMA-02 | `WebhookLog` model stores raw payload, headers, provider reference, processing status, and timestamp | Full model definition ready; `@@index` placement confirmed; `apiSystemId` FK verified |
| SCHEMA-03 | `WebhookLog.status` enum: DISCOVERED, PROCESSED, DUPLICATE, FAILED | Enum syntax confirmed; four values match requirements (NOTE: research docs used different names — REQUIREMENTS.md is authoritative) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 6.19.2 | Schema DSL + ORM | Already installed; project standard |
| PostgreSQL | 16 | Database | Already running on port 5433 (local Docker + production VPS) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `prisma db push` | built-in | Apply schema changes without migration files | This project's established workflow — no migrations dir exists |
| psql / Docker exec | built-in | Run backfill SQL against local or production | Companion script for slug backfill between push steps |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `prisma db push` | `prisma migrate dev` | migrate dev would require creating a full migration baseline; high risk on production with existing data; incompatible with current workflow |
| Nullable-first slug | `@default("srq")` in schema | Default on schema would set all future rows to "srq" unless overridden; semantically wrong for a unique slug field |
| `@default("srq")` in migration SQL only | Separate SQL backfill | SQL backfill is explicit and reversible; preferred |

**Installation:** No new packages required. Prisma 6.19.2 is already installed.

## Architecture Patterns

### Recommended Project Structure

No new files or directories are created in Phase 1. All changes are:
```
backend/prisma/
└── schema.prisma       # MODIFY: ApiSystem fields + WebhookLog model + TicketSource enum
backend/src/scripts/
└── backfill-apisystem-slug.js   # NEW: one-time backfill script
```

### Pattern 1: Two-Step db push for Nullable-to-Unique Field Promotion

**What:** When adding a `@unique` field to a model that has existing rows, `prisma db push` will reject the operation if any row would violate the unique constraint. The safe path is:

1. Push schema with `slug String?` (nullable, no `@unique`)
2. Run backfill SQL: `UPDATE "ApiSystem" SET slug = 'srq', mode = 'PULL' WHERE id = '022b1d7b-9e2f-4eaa-ab22-669976090fc2'`
3. Push schema again with `slug String @unique` (not nullable, with unique constraint)

**When to use:** Anytime a `@unique` non-nullable field is added to a model with existing rows.

**Why `--accept-data-loss` on step 3:** Prisma db push shows a warning that changing `slug` from nullable to non-nullable is a "destructive" operation. Pass `--accept-data-loss` to confirm. This is safe because we just backfilled the value.

**Example — Step 1 schema:**
```prisma
// Source: schema.prisma (Phase 1, step 1 of 2)
model ApiSystem {
  id            String   @id @default(uuid())
  name          String
  description   String?
  slug          String?            // Step 1: nullable, no @unique yet
  webhookToken  String?  @unique
  mode          ApiMode  @default(PULL)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  configurations ApiConfiguration[]
  comerciales    ProviderComercial[]
  webhookLogs    WebhookLog[]
}

enum ApiMode {
  PULL
  PUSH
}
```

**Example — Step 2 backfill script:**
```javascript
// Source: backend/src/scripts/backfill-apisystem-slug.js
import { prisma } from '../lib/prisma.js';

async function backfill() {
  const result = await prisma.apiSystem.update({
    where: { id: '022b1d7b-9e2f-4eaa-ab22-669976090fc2' },
    data: { slug: 'srq', mode: 'PULL' },
  });
  console.log('Backfilled:', result.name, '-> slug:', result.slug, 'mode:', result.mode);
  await prisma.$disconnect();
}

backfill().catch(e => { console.error(e); process.exit(1); });
```

**Example — Step 3 schema:**
```prisma
// Source: schema.prisma (Phase 1, step 3 of 3 — final)
model ApiSystem {
  id            String   @id @default(uuid())
  name          String
  description   String?
  slug          String   @unique      // Step 3: non-nullable + unique
  webhookToken  String?  @unique
  mode          ApiMode  @default(PULL)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  configurations ApiConfiguration[]
  comerciales    ProviderComercial[]
  webhookLogs    WebhookLog[]

  @@index([name])
  @@index([slug])
  @@index([mode])
}
```

### Pattern 2: WebhookLog Model with Four-Value Status Enum

**What:** A standalone model that holds one record per incoming webhook request. The `rawPayload` column stores the full request body as a `String`. The `headers` column stores request headers as `Json` (useful for Phase 2 log viewer LOGS-04 requirement). The four enum values match SCHEMA-03 exactly.

**Important naming note:** The project-level research docs (ARCHITECTURE.md, SUMMARY.md) used different enum values (`RECEIVED`, `PROCESSED`, `NO_ADAPTER`, `ERROR`). REQUIREMENTS.md is authoritative and specifies: `DISCOVERED, PROCESSED, DUPLICATE, FAILED`. Use the REQUIREMENTS.md names.

**Example:**
```prisma
// Source: REQUIREMENTS.md SCHEMA-03 + ARCHITECTURE.md pattern
model WebhookLog {
  id            String           @id @default(uuid())
  apiSystemId   String
  rawPayload    String           // Full request body as string
  headers       Json?            // Request headers (for log inspector in Phase 4)
  status        WebhookLogStatus @default(DISCOVERED)
  errorMessage  String?          // Set when FAILED
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  apiSystem     ApiSystem        @relation(fields: [apiSystemId], references: [id], onDelete: Cascade)

  @@index([apiSystemId])
  @@index([status])
  @@index([createdAt])
  @@index([apiSystemId, createdAt])
}

enum WebhookLogStatus {
  DISCOVERED   // Received; no adapter exists yet (discovery mode)
  PROCESSED    // Adapter ran and ticket was created
  DUPLICATE    // Payload matched an already-processed event
  FAILED       // Processing threw an error
}
```

**Why no `ticketId` FK in Phase 1:** Phase 1 is schema-only. The `Ticket` relation is needed only when Phase 2 creates actual tickets. Adding it in Phase 1 would require adding the back-relation to `Ticket` now. This is optional — it can be deferred to Phase 2 when it is actually used. Include it only if the planner decides to future-proof the schema in one shot.

### Pattern 3: TicketSource Enum Extension

**What:** Add `WEBHOOK_PUSH` to the existing `TicketSource` enum in schema.prisma.

**Why this is safe:** Prisma enum additions are additive. `db push` will `ALTER TYPE` to add the new value. Existing rows with `EXTERNAL_API` or `TAQUILLA_ONLINE` are unaffected.

**Example:**
```prisma
enum TicketSource {
  TAQUILLA_ONLINE   // Jugado por usuario en la plataforma
  EXTERNAL_API      // Importado de proveedor externo (SRQ, etc)
  WEBHOOK_PUSH      // NEW: received via webhook from PUSH provider
}
```

### Anti-Patterns to Avoid

- **Introducing `prisma migrate`:** No migrations directory exists; initializing it now would require a baseline migration of the entire existing schema. Risk to production is high. Stick with `db push`.
- **Non-nullable `slug` without backfill:** Running `db push` with `slug String @unique` directly will fail — the existing SRQ row has no slug value and the constraint cannot be satisfied.
- **Changing the WebhookLogStatus enum names from REQUIREMENTS.md:** The architecture research used different names. REQUIREMENTS.md is the source of truth. Use DISCOVERED/PROCESSED/DUPLICATE/FAILED.
- **Adding `@default("srq")` to the schema:** This would make 'srq' the default for all future `ApiSystem` rows. The backfill script is cleaner and explicit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unique constraint enforcement | Application-level uniqueness checks | Prisma `@unique` + `@@unique` | DB constraints enforce at the storage layer regardless of which process inserts |
| Backfill logic | Complex migration scripts | Direct `prisma.apiSystem.update()` with known UUID | One row, known ID — simple is better |
| Enum type management | SQL `ALTER TYPE` commands | Prisma schema DSL + `db push` | Prisma generates correct SQL for enum additions |

**Key insight:** In a `db push` workflow, all schema mutations go through Prisma's schema DSL. Never write raw DDL unless debugging a push conflict.

## Common Pitfalls

### Pitfall 1: Non-Nullable Unique Field on Table With Data
**What goes wrong:** Running `prisma db push` with `slug String @unique` fails with: `ERROR: column "slug" contains null values` (PostgreSQL constraint violation).
**Why it happens:** The existing SRQ row has `slug = NULL`. Adding `NOT NULL UNIQUE` in a single push step violates the constraint immediately.
**How to avoid:** Two-step push — add as nullable first, backfill, then promote to non-nullable unique (step 3 above).
**Warning signs:** Error message from `db push` mentioning null values or constraint violations.

### Pitfall 2: Running db push Without `--accept-data-loss` on Step 3
**What goes wrong:** Prisma db push interactively asks for confirmation and blocks in CI or non-TTY environments.
**Why it happens:** Prisma treats nullable-to-non-nullable as a potential data-loss operation and requires explicit confirmation.
**How to avoid:** Pass `--accept-data-loss` flag on step 3 only (after backfill confirms no nulls exist).
**Warning signs:** Prisma prompts: "Warning: The following schema changes may cause data loss."

### Pitfall 3: Enum Name Mismatch Between Research Docs and Requirements
**What goes wrong:** Phase 2 code references `WebhookLogStatus.RECEIVED` or `NO_ADAPTER` (names from ARCHITECTURE.md), but the schema has `DISCOVERED` and `FAILED` (names from REQUIREMENTS.md).
**Why it happens:** Two documents used different names; ARCHITECTURE.md was written before REQUIREMENTS.md finalized.
**How to avoid:** Use REQUIREMENTS.md names: `DISCOVERED, PROCESSED, DUPLICATE, FAILED`. Document this explicitly in schema comments.
**Warning signs:** TypeScript/JavaScript runtime errors when referencing enum values.

### Pitfall 4: Forgetting the `updatedAt @updatedAt` on WebhookLog
**What goes wrong:** Prisma auto-update on `updatedAt` only works when the field has `@updatedAt` directive. Without it, `updatedAt` must be manually set on every update call — easy to forget in Phase 2.
**Why it happens:** Copy-paste from a model without `@updatedAt`.
**How to avoid:** Include `updatedAt DateTime @updatedAt` in WebhookLog. Every time `webhookLog.update({ data: { status: '...' } })` runs in Phase 2, `updatedAt` updates automatically.

### Pitfall 5: Applying db push to Production Without Testing Locally First
**What goes wrong:** Production push fails or corrupts data because the two-step sequence was not validated locally.
**Why it happens:** The local and production schemas are identical (both use `db push`), but edge cases in the push command differ between environments.
**How to avoid:** Full local dry-run (local Docker DB) before production. Production push uses SSH: `ssh 144 "cd /var/proyectos/tote-web/backend && npx prisma db push"`.

### Pitfall 6: Forgetting to Regenerate Prisma Client After Push
**What goes wrong:** Backend code can't access new fields (`slug`, `mode`, `webhookToken`, `WebhookLog`) because the generated client is stale.
**Why it happens:** `prisma db push` pushes to the DB but does not auto-regenerate the client in all environments.
**How to avoid:** Run `npx prisma generate` (or `npm run db:generate`) after each push step. On production, restart the pm2 process after push + generate.

## Code Examples

Verified patterns from schema inspection and official Prisma behavior:

### Current ApiSystem (as-is, before Phase 1)
```prisma
// Source: backend/prisma/schema.prisma (current state)
model ApiSystem {
  id            String            @id @default(uuid())
  name          String            // "SRQ", "OtroSistema"
  description   String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  
  configurations ApiConfiguration[]
  comerciales   ProviderComercial[]
  
  @@index([name])
}
```

### Current TicketSource (as-is, before Phase 1)
```prisma
// Source: backend/prisma/schema.prisma (current state)
enum TicketSource {
  TAQUILLA_ONLINE   // Jugado por usuario en la plataforma
  EXTERNAL_API      // Importado de proveedor externo (SRQ, etc)
}
```

### Current SRQ Row in DB (both production and local — identical)
```
id:          022b1d7b-9e2f-4eaa-ab22-669976090fc2
name:        SRQ
description: Sistema RQ - Proveedor de ventas externas
createdAt:   2025-12-22 18:14:51.369
updatedAt:   2025-12-22 18:14:51.369
slug:        (column does not exist yet)
```

### deleteMany in api-integration.service.js (safe — already source-scoped)
```javascript
// Source: backend/src/services/api-integration.service.js ~line 322
// This deleteMany is already scoped to source: 'EXTERNAL_API'
// WEBHOOK_PUSH tickets will NOT be affected by this call
const deleteResult = await prisma.ticket.deleteMany({
  where: { 
    drawId,
    source: 'EXTERNAL_API'  // Only SRQ tickets — WEBHOOK_PUSH is safe
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `prisma migrate dev` | `prisma db push` | Project start | No migration history; simpler for solo dev; requires two-step process for non-nullable unique fields on existing data |
| Prisma 4.x enum syntax | Prisma 6.x (same DSL) | Prisma 5/6 | No breaking changes to schema DSL for this use case; `db push` behavior is identical |

**Deprecated/outdated:**
- None for this phase. Prisma 6.x schema DSL for enums and models is stable and unchanged from Prisma 4.x/5.x.

## Open Questions

1. **Should `ticketId` FK be added to WebhookLog in Phase 1 or deferred to Phase 2?**
   - What we know: The FK is needed in Phase 2 when tickets are created from webhooks. Adding it in Phase 1 is forward-compatible but requires adding a back-relation on the `Ticket` model now.
   - What's unclear: Whether the planner wants to minimize schema changes now or do a complete schema in one shot.
   - Recommendation: Add it in Phase 1 to avoid a second push/backfill round. The back-relation on `Ticket` is a single line and no backfill is needed (all existing tickets have no webhook log).

2. **Should `isActive` be added to `ApiSystem` in Phase 1?**
   - What we know: ARCHITECTURE.md specifies `isActive Boolean @default(true)` on `ApiSystem`. It's needed for the Phase 2 webhook auth middleware (`mode: 'PUSH' AND isActive: true`).
   - What's unclear: REQUIREMENTS.md does not explicitly list it as SCHEMA-01 content.
   - Recommendation: Add it in Phase 1. It has `@default(true)`, so the existing SRQ row gets `isActive = true` automatically — no backfill needed. It's a hard dependency for Phase 2 middleware.

3. **Should `headers Json?` be added to WebhookLog in Phase 1?**
   - What we know: LOGS-04 requirement (Phase 4) requires displaying request headers in the inspector. Storing headers from Phase 2 onward requires this field to exist in the schema.
   - What's unclear: Whether to add it now or in Phase 4.
   - Recommendation: Add it now as nullable (`Json?`). No data loss, no backfill needed. Avoids a schema change mid-stream when Phase 4 is built.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (local Docker) | Schema push testing | Yes | 16 (port 5433) | — |
| PostgreSQL (production VPS) | Production push | Yes | 16 (port 5433, VPS 144) | — |
| Prisma CLI | `db push` + `generate` | Yes | 6.19.2 | — |
| Node.js | Backfill script | Yes | Available (pm2 runs it in prod) | — |
| SSH to VPS 144 | Production push | Yes | `ssh 144` alias configured | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

Config does not have `workflow.nyquist_validation` set — treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 |
| Config file | `backend/package.json` (jest config inline via `NODE_OPTIONS='--experimental-vm-modules'`) |
| Quick run command | `cd backend && npm test` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-01 | `ApiSystem` table has `slug`, `webhookToken`, `mode` columns after push | smoke (DB query) | manual — psql verify | N/A (schema push, not code) |
| SCHEMA-02 | `WebhookLog` table exists with correct columns | smoke (DB query) | manual — psql verify | N/A |
| SCHEMA-03 | `WebhookLog.status` accepts DISCOVERED, PROCESSED, DUPLICATE, FAILED and rejects others | smoke (DB insert test) | manual — psql verify | N/A |

**Note on test strategy for Phase 1:** Phase 1 is purely a schema mutation phase — no application code is written. Jest tests are inappropriate here because there is no business logic to unit test. Verification is via:
1. `prisma db push` succeeding without errors
2. `psql` queries confirming columns and enum values exist
3. `npx prisma generate` completing without TypeScript errors
4. Backfill script running and returning the expected SRQ row data

### Wave 0 Gaps
None — no test files needed for a schema-only phase.

## Sources

### Primary (HIGH confidence)
- `backend/prisma/schema.prisma` — direct inspection of current ApiSystem, Ticket, TicketSource models
- `backend/src/services/api-integration.service.js` — confirmed `deleteMany` is already scoped to `source: 'EXTERNAL_API'`; WEBHOOK_PUSH tickets are safe
- `backend/src/jobs/sync-api-tickets.job.js` — confirmed job delegates to apiIntegrationService; no additional deleteMany calls
- Production DB query: `SELECT * FROM "ApiSystem"` — confirmed single SRQ row with UUID `022b1d7b-9e2f-4eaa-ab22-669976090fc2`
- Local Docker DB query: same result — production and local schemas/data are in sync for ApiSystem
- `backend/package.json` — Prisma 6.19.2 confirmed; no migration scripts; `db:push` is the standard workflow
- `.planning/REQUIREMENTS.md` — authoritative source for SCHEMA-03 enum values (DISCOVERED/PROCESSED/DUPLICATE/FAILED)

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — schema design patterns; NOTE: enum names in this doc differ from REQUIREMENTS.md; REQUIREMENTS.md takes precedence
- `.planning/research/SUMMARY.md` — pitfall analysis and phase ordering rationale

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Schema changes: HIGH — exact current schema inspected, SRQ row confirmed, Prisma version verified
- Migration strategy: HIGH — `db push` workflow confirmed by absence of migrations dir; two-step process is a documented Prisma pattern
- Enum values: HIGH — REQUIREMENTS.md is authoritative; discrepancy with ARCHITECTURE.md identified and resolved
- Production safety: HIGH — `deleteMany` in api-integration.service.js is already scoped to EXTERNAL_API; no risk to WEBHOOK_PUSH tickets

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (Prisma schema DSL is stable; production DB state will not change independently)
