# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tote-web is a lottery management system with real-time draw execution, multi-channel result publication (Telegram, WhatsApp, Facebook, Instagram, TikTok), player betting, and prize processing. The codebase is split into a Node.js/Express backend and a Next.js frontend.

## Development Commands

### Prerequisites
```bash
docker-compose up -d          # Start PostgreSQL 16 on port 5433
```

### Backend (port 3001)
```bash
cd backend
npm install
npm run db:push               # Push Prisma schema to DB
npm run db:migrate             # Run Prisma migrations
npm run db:studio              # Open Prisma Studio GUI
npm run dev                    # Start with nodemon (hot reload)
npm test                       # Jest tests
npm run lint                   # ESLint
npm run format                 # Prettier
```

### Frontend (port 10000)
```bash
cd frontend
npm install
npm run dev                    # Next.js dev server
npm run build                  # Production build
npm run lint                   # ESLint
```

## Architecture

### Backend (`backend/src/`)

**Runtime:** Node.js with ES modules (`import/export`). Express server with Socket.io for real-time updates.

**Layer structure:**
- `routes/` (41 files) - Express route definitions, thin layer
- `controllers/` (40 files) - Request handling, validation, delegates to services
- `services/` (55+ files) - Core business logic
- `lib/` - Shared utilities: `prisma.js` (singleton), `socket.js`, `imageGenerator.js` (Sharp-based), `logger.js` (Winston), `dateUtils.js`
- `jobs/` - Legacy Croner-based scheduled jobs (8 jobs)
- `queue/` - pg-boss PostgreSQL job queue (replacement for Croner)

**Draw lifecycle:** `SCHEDULED` -> `CLOSED` -> `DRAWN` -> `CANCELLED`

The `PUBLISHED` status has been removed. Draws are considered complete at `DRAWN`. All queries for completed draws should filter by `status: 'DRAWN'` only.

**Execute-draw pipeline (pg-boss):** Image generation -> Admin notification -> Social channel publish -> Prize processing -> Stats calculation. Each step is a separate queue worker in `queue/workers/`. Prize processing is the critical step that stops the pipeline on failure.

**Job queue migration (Croner -> pg-boss):** Controlled by `PGBOSS_*` env flags in 6 phases. When a flag is `false`/absent, the legacy Croner job runs. See `.env.example` for phase ordering. Queue names and retry configs are in `queue/constants.js`, worker registration in `queue/register.js`.

### Frontend (`frontend/`)

**Framework:** Next.js 14 (App Router), React 18, TailwindCSS v4, Zustand for state management.

**Key directories:**
- `app/admin/` - Admin dashboard with 27+ sub-routes (draws, reports, monitoring)
- `app/jugar/` - Player betting interface
- `components/` - Organized by domain: `admin/`, `draws/`, `games/`, `shared/`
- `lib/socket/socket.js` - Singleton SocketService for real-time draw updates

**Real-time events:** `draw:closed`, `draw:winner-selected`, `draw:published`, `draw:created`, `draw:updated`, `publication:success`, `publication:failed`.

### Database

PostgreSQL 16 via Prisma ORM. Schema at `backend/prisma/schema.prisma` (~1200 lines, 50+ models).

**Core model groups:**
- Games & config: `Game`, `GameItem`, `DrawTemplate`, `GameChannel`
- Draw lifecycle: `Draw` (with pipeline tracking fields), `DrawPublication`, `DrawStats`
- Betting: `Ticket`, `TicketDetail`, `Prize`
- Users: `User`, `UserGame`
- External: `ApiConfiguration`, `ApiDrawMapping` (SRQ provider integration)

### Image Generation

Sharp-based image composition in `lib/imageGenerator.js`. Game-specific assets organized in `backend/storage/bases/{gameId}/` with animal PNGs, background variants, seasonal overlays (carnival, Christmas, Halloween, Easter), and pyramid templates. Special image workers generate daily pyramids and summaries.

## Key Environment Variables

- `DISABLE_SOCIAL_CHANNELS=true` - Blocks all social channel publishing (use in local dev)
- `ENABLE_JOBS=true` - Master toggle for job processing
- `PGBOSS_*` flags - Per-phase queue migration toggles (see `.env.example`)
- `DATABASE_URL` - PostgreSQL connection string (port 5433 locally)
- `ADMIN_TELEGRAM_BOT_TOKEN` - Admin notification bot

## Conventions

- Backend uses ES modules throughout (`import`/`export`, not `require`)
- Prisma client is a singleton from `lib/prisma.js` - always import from there
- Socket.io instance is a singleton from `lib/socket.js`
- Timezone: Venezuela (America/Caracas, UTC-4) via `lib/dateUtils.js`
- Image assets use numeric game IDs as directory names: `storage/bases/1/` (LOTOANIMALITO), `storage/bases/2/` (LOTTOPANTERA)
- Draw status queries: filter by `DRAWN` for completed draws locally. **Production still uses `PUBLISHED`** (legacy status) — query both when needed: `status IN ('DRAWN', 'PUBLISHED')`
- All social channel publishing goes through `services/publication.service.js`

### Webhook System (Multi-Provider)

External betting providers can send bets via webhooks instead of being polled (like SRQ).

**How it works:**
1. Admin creates a provider in `/admin/proveedores` with mode `PUSH` and generates a token
2. The provider is given: `POST https://tote.atilax.io/api/webhooks/{slug}` + `X-Webhook-Token` header
3. When a provider sends a webhook:
   - If no adapter exists → payload logged as `DISCOVERED` (discovery mode) — inspect in `/admin/proveedores/logs`
   - If adapter exists → payload normalized → Ticket created in real-time

**Provider modes:**
- `PULL` — System polls the provider on a schedule (SRQ pattern via `sync-api-tickets` job)
- `PUSH` — Provider sends webhooks to our endpoint

**Key files:**
- `middlewares/webhook-auth.middleware.js` — Token auth via `crypto.timingSafeEqual`
- `services/webhook.service.js` — Discovery mode, adapter routing, ticket creation
- `controllers/webhook.controller.js` — Thin handler, always returns 200 after auth
- `routes/webhook.routes.js` — `POST /:providerSlug` with `express.raw()` body capture
- `webhooks/adapters/{slug}.adapter.js` — Per-provider normalizer (create when provider payload is known)

**Adapter pattern:** To wire a new provider, create `backend/src/webhooks/adapters/{slug}.adapter.js` exporting a `normalize(rawPayload)` function that returns an array of `{ externalTicketId, number, amount, drawId, providerData }`. The service dynamically imports the adapter by slug.

**Database models:**
- `ApiSystem.slug` — Unique identifier used in the webhook URL path
- `ApiSystem.webhookToken` — Token for `X-Webhook-Token` header auth
- `ApiSystem.mode` — `PULL` or `PUSH` (enum `ApiSystemMode`)
- `WebhookLog` — Stores every received payload with status: `DISCOVERED`, `PROCESSED`, `DUPLICATE`, `FAILED`
- `Ticket.source = 'WEBHOOK_PUSH'` — Distinguishes webhook tickets from SRQ (`EXTERNAL_API`) and online (`TAQUILLA_ONLINE`)

**Admin UI:**
- `/admin/proveedores` — Provider CRUD with mode badges (PULL/PUSH), adapter status badges (Ready/Discovery), token generation (show-once)
- `/admin/proveedores/logs` — Webhook log viewer with filters by provider/status, JSON inspector modal

**SRQ coexistence:** SRQ stays as `mode: PULL` with `slug: 'srq'`. Its existing sync jobs (`sync-api-tickets`, `sync-api-planning`) are unchanged. The `deleteMany` in `api-integration.service.js` only affects `source: 'EXTERNAL_API'` tickets, so `WEBHOOK_PUSH` tickets are safe.

---

## Production Environment (VPS 94 — Telecom)

> **Migración:** la producción se mudó de VPS 144 (DigitalOcean, IP `144.126.150.120`) a VPS 94 (Telecom, IP `94.72.116.98`) en 2026-05. El alias `ssh 144` aún resuelve al box viejo pero **no contiene el stack actual**. Usar siempre `ssh 94`.

### Conexión SSH
```bash
ssh 94     # alias configurado localmente en ~/.ssh/config
```
IP del servidor: `94.72.116.98`

### Ubicación de proyectos
Todos los proyectos están en `/var/proyectos/`:
```
/var/proyectos/tote-web/          # Este proyecto
/var/proyectos/tote-scrape/       # Sidecar Maxplay (FastAPI + Scrapling, port 8055) — repo: github.com/diazhh/tote-scrape (privado)
```

### pm2 — Procesos de tote-web
| ID | Nombre           | Descripción                                       |
|----|------------------|---------------------------------------------------|
| 0  | tote-backend     | Express API (port 3001)                           |
| 2  | tote-frontend    | Next.js (port 10000)                              |
| 3  | whatsapp-service | WhatsApp gateway                                  |
| 4  | tote-scrape      | Maxplay scraping sidecar (FastAPI on `127.0.0.1:8055`) |

> Los IDs son los actuales del `pm2 list` en VPS 94 — pueden cambiar si pm2 se reinicia. Referenciar siempre por nombre.

Comandos útiles en producción:
```bash
ssh 94 "pm2 list"                           # Ver todos los procesos
ssh 94 "pm2 logs tote-backend --lines 50"   # Ver logs del backend
ssh 94 "pm2 logs tote-scrape --lines 100"   # Ver logs del sidecar Maxplay
ssh 94 "pm2 restart tote-backend"           # Reiniciar backend (cuesta 1-2s downtime)
ssh 94 "pm2 restart tote-frontend"          # Reiniciar frontend (build cache, ver feedback memory)
ssh 94 "pm2 restart tote-scrape"            # Reiniciar sidecar (próximo scrape paga ~45s cold start)
```

### Base de Datos — Producción
- **Host:** localhost:5433 (mismo puerto que local, pero en el VPS)
- **DB:** `tote_db`
- **User:** `tote_user`
- **Password:** `ToteSecure2024*`
- **URL:** `postgresql://tote_user:ToteSecure2024*@localhost:5433/tote_db?schema=public`

Consultar desde local vía SSH:
```bash
ssh 94 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 -d tote_db -c 'SELECT ...'"
```

### Maxplay Scraping Sidecar

El proveedor Maxplay no expone API ni webhooks — sólo un dashboard administrativo (`mpgadmin.maxplaygo.com`) protegido por Cloudflare + login. Para sortear esto, hay un servicio FastAPI en Python ("tote-scrape") que mantiene una sesión stealth caliente y expone `POST /scrape/maxplay/jugadas` al backend Node.

- **Repo:** [github.com/diazhh/tote-scrape](https://github.com/diazhh/tote-scrape) (privado — contiene credenciales hardcoded)
- **Path en VPS:** `/var/proyectos/tote-scrape/` · pm2 `tote-scrape` · puerto `127.0.0.1:8055`
- **Cliente Node:** `backend/src/services/maxplay.service.js` (timeout default 90s, override con `MAXPLAY_TIMEOUT_MS`)
- **Worker pg-boss:** `backend/src/queue/workers/sync-scrape-tickets.worker.js` (corre T-5min antes de cada sorteo)
- **Tickets:** `Ticket.source = 'EXTERNAL_SCRAPE'`, `apiSystemId` apunta al row `ApiSystem` con `slug='maxplay'` y `mode='SCRAPE'`
- **Performance:** cold start ~45s (browser boot + Cloudflare + login + Turnstile + form submit), warm session ~5–7s

**Cloudflare Turnstile interactivo:** desde 2026-05-07 el form de login muestra un widget "Verify you are human" con checkbox que requiere click explícito. La función `_solve_turnstile_checkbox` en `app/adapters/maxplay.py` lo maneja con un click humanizado al iframe + espera al token `cf-turnstile-response`. Si CF endurece y rechaza clicks automatizados, el plan B documentado es 2Captcha/Capsolver.

**Despliegue manual** (no hay CI):
```bash
# Desde local, en /Users/diazhh/Documents/GitHub/tote-scrape
rsync -av --exclude '.venv' --exclude '__pycache__' --exclude '*.egg-info' --exclude '.git' ./ 94:/var/proyectos/tote-scrape/
ssh 94 "pm2 restart tote-scrape"
```

**Diagnóstico ante fallo:** el adapter dumpea screenshot + HTML + DOM markers en `/tmp/maxplay-debug-*` cuando hay timeout. Inspeccionar `*.json` da el estado en 5s; el `.png` confirma visualmente.

### Base de Datos — Local (Docker)
- **Contenedor:** `tote_postgres`
- **Host:** localhost:5433
- **DB:** `tote_db`
- **User:** `tote_user`
- **Password:** `tote_password_2025`
- **URL:** `postgresql://tote_user:tote_password_2025@localhost:5433/tote_db?schema=public`

Consultar local:
```bash
docker exec tote_postgres psql -U tote_user -d tote_db -c 'SELECT ...'
```

### Estado de draws en producción vs local
| Entorno    | Status draws completados |
|------------|--------------------------|
| Producción | `PUBLISHED` (legacy)     |
| Local/dev  | `DRAWN` (nuevo)          |

En producción hay ~2648 sorteos con `PUBLISHED` desde 2025-12-20 hasta hoy. Siempre filtrar por `status = 'PUBLISHED'` al consultar producción.

### Game IDs (idénticos en producción y local)
| UUID                                 | Slug             | Nombre           |
|--------------------------------------|------------------|------------------|
| d953f80c-4335-4bc9-9f78-9b56193286fe | lotoanimalito    | LOTOANIMALITO    |
| 61580ccf-5a2d-4d10-877e-4883515135e4 | lottopantera     | LOTTOPANTERA     |
| 69efc4d7-52cb-41a6-951d-be299590f393 | triple-pantera   | TRIPLE PANTERA   |
| 741ef8e9-129b-446b-abad-d00f68323f1c | terminal-pantera | TERMINAL PANTERA |

> **Importante:** Los UUIDs de `Game` y `GameItem` son idénticos entre producción y local. Esto permite usar seeds y seeds SQL directamente sin traducción de IDs.

### Seed de datos de producción
Para actualizar la DB local con resultados reales de producción:
```bash
# El archivo seed-prod-results.sql contiene los últimos 5 días (2026-03-01 a 2026-03-06)
docker exec -i tote_postgres psql -U tote_user -d tote_db < backend/src/scripts/seed-prod-results.sql
```

Para regenerar el seed con datos más recientes, consultar producción y usar el patrón del archivo `backend/src/scripts/seed-prod-results.sql`.
