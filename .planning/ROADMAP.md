# Roadmap: Tote-Web

## Milestones

- ✅ **v1.0 Multi-Provider Webhook System** - Phases 1-4 (shipped 2026-04-01)
- ✅ **v1.1 Reports Dashboard** - Phases 5-7 (shipped 2026-04-07)
- 🚧 **v1.2 Webhook Provider Integration (Virtuales)** - Phases 8-10 (in progress)

## Phases

<details>
<summary>✅ v1.0 Multi-Provider Webhook System (Phases 1-4) - SHIPPED 2026-04-01</summary>

### Phase 1: Schema Foundation
**Goal**: The database schema supports PUSH providers — ApiSystem can describe its mode and carry a token, and WebhookLog can store raw payloads with processing status
**Depends on**: Nothing (first phase)
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03
**Success Criteria** (what must be TRUE):
  1. ApiSystem rows have slug, webhookToken, and mode fields; existing SRQ row has slug backfilled to 'srq' without breaking existing queries
  2. WebhookLog model exists and can store a raw payload, provider reference, processing status, and timestamp
  3. WebhookLog.status accepts exactly four values: DISCOVERED, PROCESSED, DUPLICATE, FAILED
  4. Prisma migration runs cleanly against both local and production schema without data loss
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Write schema (step 1: nullable slug) + backfill script + execute full 3-step local deployment
- [x] 01-02-PLAN.md — SSH production deployment + human health-check verification

### Phase 2: Webhook Backend Pipeline
**Goal**: Any provider with a valid token can send a POST to `/api/webhooks/:slug` and receive a safe, logged response — discovery mode captures unknown payloads, adapter routing creates tickets when an adapter exists, and the PULL sync cannot clobber PUSH tickets
**Depends on**: Phase 1
**Requirements**: WHOOK-01, WHOOK-02, WHOOK-03, WHOOK-04, WHOOK-05, WHOOK-06
**Success Criteria** (what must be TRUE):
  1. A POST to `/api/webhooks/:slug` with a valid `X-Webhook-Token` header returns 200 and creates a WebhookLog entry
  2. A POST with an invalid or missing token returns 401 and nothing is logged or created
  3. When no adapter file exists for the provider slug, the payload is logged with status DISCOVERED and the request returns 200
  4. When an adapter file exists, the payload is normalized and a Ticket is created in real-time; duplicate payloads (same drawId + externalTicketId) create a DUPLICATE log entry rather than a second Ticket
  5. Token comparison uses crypto.timingSafeEqual so timing attacks cannot distinguish valid from invalid tokens
  6. The sync-api-tickets job deleteMany is scoped to source='EXTERNAL_API' only, protecting PUSH-created tickets (source='WEBHOOK') from deletion
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Add @@unique([drawId, externalTicketId, source]) to Ticket + create adapters directory
- [x] 02-02-PLAN.md — Create webhook pipeline files (auth middleware, service, controller, routes)
- [x] 02-03-PLAN.md — Wire route in index.js, local smoke test, production deploy

### Phase 3: Admin Provider Management
**Goal**: Admin operators can manage providers entirely through the UI — creating PUSH providers with slugs, generating and rotating tokens, and seeing at a glance which providers are in discovery mode versus adapter-ready
**Depends on**: Phase 2
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06
**Success Criteria** (what must be TRUE):
  1. Admin can create a new provider and select PULL or PUSH mode; the provider list shows a mode badge (PULL/PUSH) for every provider
  2. Admin can set or edit a provider's slug (auto-generated from name on creation, editable before save)
  3. Admin can generate a webhook token for a PUSH provider; the token is shown once in full immediately after generation, then masked in all subsequent views
  4. Admin can regenerate a token for an existing PUSH provider; the old token is immediately invalidated
  5. Each provider in the list shows an adapter status badge: "Ready" if an adapter file exists for its slug, "Discovery" if it does not
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Backend: extend controller (createSystem/updateSystem/generateToken/getAdapterStatus) + TDD tests for ADMIN-01..06
- [x] 03-02-PLAN.md — Frontend: mode + adapter badges in system list; extended SystemModal with slug/mode/token panel
- [x] 03-03-PLAN.md — Production deploy: git pull, pm2 restart, smoke test, human verification
**UI hint**: yes

### Phase 4: Webhook Log Viewer
**Goal**: Admin operators can see everything that has arrived via webhooks — browsing the full log table, filtering by provider or status, and inspecting individual payloads including raw headers
**Depends on**: Phase 3
**Requirements**: LOGS-01, LOGS-02, LOGS-03, LOGS-04
**Success Criteria** (what must be TRUE):
  1. Admin can navigate to the webhook log page and see a table of received payloads with columns: provider name, timestamp, status badge, and a truncated payload preview
  2. Admin can filter the log table by provider and by status (DISCOVERED, PROCESSED, DUPLICATE, FAILED) independently or in combination
  3. Admin can click any log entry to open an inspector modal showing the full raw JSON payload with readable formatting
  4. The inspector modal includes a headers section showing the HTTP request headers that arrived with the payload
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Backend endpoint (getWebhookLogs + route) + frontend logs page + tab link + TDD tests
- [x] 04-02-PLAN.md — Production deploy: git push, VPS pull, frontend build, pm2 restart, human verification
**UI hint**: yes

</details>

---

<details>
<summary>✅ v1.1 Reports Dashboard (Phases 5-7) - SHIPPED 2026-04-07</summary>

### Phase 5: Backend Reports Foundation
**Goal**: The backend is ready to serve comprehensive report data — the crash is fixed and the endpoint supports date range, source, and provider filters plus game-level and provider-level aggregations
**Depends on**: Phase 4
**Requirements**: FIX-01, BACK-01, BACK-02, BACK-03
**Success Criteria** (what must be TRUE):
  1. /admin/reportes loads in the browser without a client-side crash or white screen
  2. GET /api/monitor/reporte accepts dateFrom and dateTo query params and returns draws within that range
  3. GET /api/monitor/reporte accepts source and apiSystemId query params and filters ticket aggregations accordingly
  4. The endpoint response includes a gameBreakdown array (one entry per game with sales/prizes/profit) and a providerBreakdown array (one entry per source with totals)
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — FIX-01 import fix + backend getDailyReport extension (BACK-01/02/03) + unit tests (TDD)
- [x] 05-02-PLAN.md — Production deploy: git push, VPS pull, frontend build, pm2 restart, human verification
**UI hint**: no

### Phase 6: Reports Dashboard Frontend
**Goal**: Admin can explore draw financials through a rebuilt reports page — choosing date range, game, and provider, seeing summary cards, and drilling into a paginated sortable detail table
**Depends on**: Phase 5
**Requirements**: FILT-01, FILT-02, FILT-03, FILT-04, SUMM-01, SUMM-02, SUMM-03, DETL-01, DETL-02, DETL-03
**Success Criteria** (what must be TRUE):
  1. Admin can set a from/to date range and the summary cards and detail table both update to reflect only draws within that range
  2. Admin can filter by game (all or a specific game) and the entire page reflects only that game's data
  3. Admin can filter by source (Online, SRQ, Webhook) or by specific provider (ApiSystem), and totals recalculate
  4. Summary cards show correct total sales, total prizes, total profit, and ticket count for the active filters
  5. The breakdown tables show per-game and per-provider aggregated totals as separate rows
  6. The detail table lists each draw with date, time, game, winner, sales, prizes, balance, and ticket count; supports pagination and sorting by date/time
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md — Rebuild reportes/page.js (filter bar, summary cards, breakdown tables, paginated+sortable detail table) + update monitor API client
- [x] 06-02-PLAN.md — Production deploy: git push, VPS pull, frontend build, pm2 restart, human verification
**UI hint**: yes

### Phase 7: PDF Export + Production Deploy
**Goal**: Admin can download the current filtered report as a PDF and the feature is live in production
**Depends on**: Phase 6
**Requirements**: EXPO-01
**Success Criteria** (what must be TRUE):
  1. Admin clicks "Download PDF" and a PDF file downloads to their machine containing the current filter state, summary cards, and detail table
  2. The PDF reflects the active filters (date range, game, provider) at the moment of download — not a static snapshot of all data
  3. The feature works correctly in production at 144.126.150.120
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — Backend getReportePdf endpoint (PDFKit, streams PDF) + frontend Descargar PDF button (fetch+blob)
- [x] 07-02-PLAN.md — Production deploy: git push, VPS pull, frontend build, pm2 restart, human verification
**UI hint**: yes

</details>

---

### 🚧 v1.2 Webhook Provider Integration (Virtuales) (In Progress)

**Milestone Goal:** Build the complete webhook adapter for provider "virtuales" to process real-time bets — slot-based draw resolution, animal/number GameItem mapping, ticket creation with multi-play support, draw status validation, and acceptance/rejection response contract.

#### Phase 8: Adapter Implementation
**Goal**: The virtuales adapter fully processes incoming webhook payloads — resolving draw slots to daily Draw UUIDs, mapping numbers to GameItems, creating multi-play tickets, and rejecting invalid bets with clear reasons
**Depends on**: Phase 7
**Requirements**: ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04, VALID-01, VALID-02, VALID-03, VALID-04
**Success Criteria** (what must be TRUE):
  1. A webhook payload with a valid `drawSlotId` (1-48) resolves to the correct daily Draw UUID for the correct game and draw time
  2. A webhook payload with `number: "05"` creates a Ticket linked to the GameItem whose `number` field equals "05" in the resolved game; the `animal` field is used as optional cross-validation
  3. A payload with `plays: [{...}, {...}]` creates one Ticket with one TicketDetail per play entry
  4. A payload with `drawSlotId` sent as a string (e.g., `"12"`) is parsed correctly and resolves the same as the integer `12`
  5. Payloads targeting a Draw with status `DRAWN`, `CANCELLED`, or `CLOSED` are rejected with a descriptive reason string rather than creating a ticket
  6. Payloads with a `drawSlotId` outside 1-48 or not present in the slots config are rejected with a clear reason
  7. Payloads with a `number` that matches no GameItem in the resolved game are rejected with a clear reason
**Plans**: TBD

Plans:
- [ ] 08-01-PLAN.md — Implement virtuales adapter (slots resolution + GameItem lookup + multi-play ticket creation + all validations) + unit tests

#### Phase 9: Response Contract
**Goal**: The webhook endpoint returns structured acceptance/rejection data so providers know whether each bet was processed or why it was refused
**Depends on**: Phase 8
**Requirements**: RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. A successful ticket creation returns `{ received: true, logId, ticket: { id, status: "ACCEPTED" } }` in the response body
  2. A rejected bet (any validation failure) returns `{ received: true, logId, ticket: { status: "REJECTED", reason: "..." } }` where reason describes the specific failure
  3. A payload arriving with no adapter (discovery mode) continues to return `{ received: true, logId }` without a ticket field — existing behavior is unchanged
**Plans**: TBD

Plans:
- [ ] 09-01-PLAN.md — Update webhook.service.js + webhook.controller.js to thread ticket result through the response; verify discovery mode unchanged

#### Phase 10: Production Deployment
**Goal**: The virtuales adapter is live in production, end-to-end tested with the provider sending real payloads, and webhook tickets appear in reports
**Depends on**: Phase 9
**Requirements**: DEPL-01, DEPL-02
**Success Criteria** (what must be TRUE):
  1. The adapter file is renamed from `virtuales.adapter.draft.js` to `virtuales.adapter.js` on the VPS and the provider list shows the "Ready" badge for virtuales
  2. The provider sends a real test payload and the system returns `{ received: true, logId, ticket: { id, status: "ACCEPTED" } }` with the ticket visible in the database
  3. The provider sends a payload for a closed draw and receives `{ received: true, logId, ticket: { status: "REJECTED", reason: "..." } }` — no spurious ticket created
**Plans**: TBD

Plans:
- [ ] 10-01-PLAN.md — Production deploy (rename adapter, git pull, pm2 restart) + E2E test with provider + verify tickets appear in reports

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundation | v1.0 | 2/2 | Complete | 2026-04-01 |
| 2. Webhook Backend Pipeline | v1.0 | 3/3 | Complete | 2026-04-01 |
| 3. Admin Provider Management | v1.0 | 3/3 | Complete | 2026-04-01 |
| 4. Webhook Log Viewer | v1.0 | 2/2 | Complete | 2026-04-01 |
| 5. Backend Reports Foundation | v1.1 | 2/2 | Complete | 2026-04-07 |
| 6. Reports Dashboard Frontend | v1.1 | 2/2 | Complete | 2026-04-07 |
| 7. PDF Export + Production Deploy | v1.1 | 2/2 | Complete | 2026-04-07 |
| 8. Adapter Implementation | v1.2 | 0/1 | Not started | - |
| 9. Response Contract | v1.2 | 0/1 | Not started | - |
| 10. Production Deployment | v1.2 | 0/1 | Not started | - |
