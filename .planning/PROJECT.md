# Tote-Web

## What This Is

A lottery management system with real-time draw execution, multi-channel result publication (Telegram, WhatsApp, Facebook, Instagram, TikTok), player betting, and prize processing. The codebase is split into a Node.js/Express backend and a Next.js frontend with PostgreSQL via Prisma ORM.

## Core Value

Reliable draw lifecycle management — draws execute on schedule, results publish to all channels, and prizes are processed correctly. Everything else builds on this.

## Current Milestone: v1.2 Webhook Provider Integration (Virtuales)

**Goal:** Build the complete webhook adapter for provider "virtuales" to process real-time bets — from slot-based draw resolution to ticket creation with validation and acceptance/rejection responses.

**Target features:**
- Slot-based draw resolution (48 fixed IDs mapping to gameId + drawTime → daily Draw UUID)
- Animal/number → GameItem mapping from provider payload
- Ticket creation from webhook payloads with multi-play support
- Draw status validation (reject bets for closed/drawn/cancelled draws)
- Acceptance/rejection response contract for the provider
- Adapter activation and end-to-end testing

## Requirements

### Validated

- Draw lifecycle (SCHEDULED -> CLOSED -> DRAWN) with automated execution
- Multi-channel publication (Telegram, WhatsApp, Facebook, Instagram, TikTok) with retry
- Player betting interface with balance management
- Prize processing pipeline (pg-boss queue)
- SRQ provider integration (PULL-based: planning sync + ticket import)
- Admin dashboard with draw management, monitoring, and reports
- Image generation for draw results (Sharp-based)
- Admin Telegram bot for notifications
- Multi-provider webhook system (PUSH-based) — v1.0
- Admin provider management UI — v1.0
- Webhook log viewer — v1.0
- Token generation for webhook auth — v1.0
- Reports dashboard with date range, game, and provider filters — v1.1
- PDF export of filtered reports — v1.1

### Active

- [ ] Slot-based draw resolution for webhook providers (48 fixed IDs → daily Draw UUID)
- [ ] Animal/number → GameItem mapping from provider payloads
- [ ] Ticket creation from webhook payloads with multi-play support
- [ ] Draw status validation (reject bets for closed/drawn/cancelled draws)
- [ ] Acceptance/rejection response contract for providers

### Out of Scope

- Refactoring SRQ into adapter pattern — stays as-is (PULL), adapters are for new PUSH providers
- Queue-based webhook processing — tickets created real-time when adapter exists
- Commercial network hierarchy (comercializadora/banca/grupo) for webhook providers — not needed, userId stays null, providerData stores original payload

## Context

- Existing `ApiSystem` and `ApiConfiguration` models handle SRQ integration
- SRQ is PULL-based: jobs fetch planning (6 AM) and tickets (every 5 min)
- New providers will PUSH bets via webhooks — different model entirely
- Each new provider has its own payload format (unknown until they start sending)
- `ApiSystem` needs new fields: `slug`, `webhookToken`, `mode` (PULL/PUSH)
- New `WebhookLog` model for raw payload storage
- Adapter pattern: `webhooks/adapters/{slug}.adapter.js` normalizes to internal format
- Admin dashboard already has 27+ sub-routes under `/app/admin/`

## Constraints

- **Tech stack**: Node.js/Express backend, Next.js 14 frontend, PostgreSQL/Prisma, TailwindCSS v4
- **Compatibility**: Must coexist with existing SRQ PULL system without breaking it
- **Auth**: Webhook auth via token in header (simple, per-provider)
- **Real-time**: When adapter exists, tickets created synchronously on webhook receipt

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single endpoint per provider slug | Scales better than one endpoint per provider; adapter pattern handles format differences | -- Pending |
| Log-first approach (discovery mode) | Can't know provider payloads upfront; logging lets us inspect before building adapters | -- Pending |
| Real-time processing (no queue) | Webhook volume expected to be low enough; simpler than adding queue layer | -- Pending |
| Extend ApiSystem (not new model) | Reuses existing provider infrastructure; just adds PUSH capability | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-07 after milestone v1.2 initialization*
