# Roadmap: Tote-Web v1.0 Multi-Provider Webhook System

## Overview

This milestone adds a PUSH-based webhook ingestion layer to the existing lottery management platform. The build follows a strict dependency order: schema migration first (everything else reads from these new fields), then the backend webhook pipeline (which validates tokens, logs payloads, and routes to adapters), then the admin UI extensions that let operators onboard providers and generate tokens, and finally the log viewer that surfaces what has arrived. Each phase delivers a complete, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Schema Foundation** - Add slug, webhookToken, mode to ApiSystem and create WebhookLog model
- [ ] **Phase 2: Webhook Backend Pipeline** - Endpoint, token auth, discovery mode, adapter routing, idempotency
- [ ] **Phase 3: Admin Provider Management** - Provider CRUD extensions, token generation UI, mode and adapter badges
- [ ] **Phase 4: Webhook Log Viewer** - Admin log table, status filtering, payload inspector modal

## Phase Details

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
- [ ] 01-02-PLAN.md — SSH production deployment + human health-check verification
**UI hint**: no

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
**Plans**: TBD

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
**Plans**: TBD
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
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema Foundation | 1/2 | In Progress|  |
| 2. Webhook Backend Pipeline | 0/? | Not started | - |
| 3. Admin Provider Management | 0/? | Not started | - |
| 4. Webhook Log Viewer | 0/? | Not started | - |
