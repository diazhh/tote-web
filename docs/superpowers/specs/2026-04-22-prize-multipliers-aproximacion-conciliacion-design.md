# Design: Prize Multipliers, Aproximación, and Conciliación Report

**Date:** 2026-04-22  
**Status:** Approved

---

## 1. Scope

Four independent but related changes:

1. Correct GameItem multipliers across all four games
2. Add "aproximación" prize modality to Triple Pantera
3. Script to recalculate prizes for the last 30 days after multiplier update
4. New "Conciliación" admin report (top-level menu)

---

## 2. Multiplier Corrections

### Target values

| Game | Slug | Default multiplier | Exception |
|------|------|--------------------|-----------|
| LotoAnimalito | `lotoanimalito` | 30 | Panda (item 16) → 50 |
| LotoPantera | `lottopantera` | 37 | Pantera (item 40) → 100 |
| Triple Pantera | `triple-pantera` | 600 | Centenarios (numbers divisible by 100: 0, 100, 200…900) → 1000 |
| Terminal Pantera | `terminal-pantera` | 70 | — |

### Implementation

**File:** `backend/src/scripts/update-multipliers.js`

- Uses the Prisma client (reads from `.env`) — no raw SQL
- Supports `--dry-run` flag: prints affected row counts without writing
- Prints a summary per game after committing
- Also writes `Game.config` for Triple Pantera:
  ```json
  { "aproximacion": { "enabled": true, "multiplier": 5 } }
  ```

---

## 3. Aproximación Modality (Triple Pantera only)

### What it is

When the winning number is drawn, the two adjacent numbers (±1, with wrap-around) also win at a reduced multiplier.

| Winning number | Exact winners | Aproximación winners |
|----------------|--------------|----------------------|
| 729 | 729 | 728, 730 |
| 000 | 000 | 999, 001 |
| 999 | 999 | 998, 000 |

### Configuration

Stored in `Game.config` (no schema migration needed):
```json
{ "aproximacion": { "enabled": true, "multiplier": 5 } }
```

Change the multiplier in production by updating this JSON field.

### Logic changes

**File:** `backend/src/services/prize-processor.service.js`

When processing prizes for a draw:
1. Check if the draw's game has `config.aproximacion.enabled === true`
2. If yes, after resolving the winner item, compute neighbor item IDs (±1 with wrap-around at 0/999)
3. `TicketDetail` records whose item matches the winner → `status: WON`, `prize = amount × item.multiplier` (600 or 1000)
4. `TicketDetail` records whose item matches a neighbor → `status: WON`, `prize = amount × config.aproximacion.multiplier` (5)
5. No schema changes — existing `prize` field stores the amount; the difference between exact and aproximación wins is implicit in the prize value relative to the bet amount

---

## 4. Recalculation Script (Last 30 Days)

**File:** `backend/src/scripts/recalculate-prizes-30d.js`

### Flow (per draw, inside a transaction)

1. Find all draws with `status IN ('DRAWN', 'PUBLISHED')` in the last 30 days
2. Reset `Draw.prizesProcessed = false`, `Draw.statsCalculated = false`
3. Reset all `TicketDetail` for that draw: `prize = null`, `status = ACTIVE`
4. Reset `Ticket.totalPrize = 0`, `Ticket.status = ACTIVE`
5. Re-run `prize-processor.service.js` (now includes aproximación logic)
6. Recalculate `DrawStats` via `draw-stats.service.js`

### User balance caveat

The script does **not** touch `User.balance`. TAQUILLA_ONLINE prizes are corrected in the database but any balance already credited to users is not reversed. This is intentional — a manual adjustment would be required for any TAQUILLA_ONLINE winners whose prize amount changed.

### Flags

- `--dry-run`: shows draw count, affected ticket count, and prize delta (before vs. after) without writing
- Run dry-run first, review output, then run without the flag

---

## 5. Conciliación Report

### Backend

| File | Purpose |
|------|---------|
| `backend/src/services/conciliacion.service.js` | Aggregated query: joins Ticket, TicketDetail, Draw, Game, ApiSystem, ProviderComercial |
| `backend/src/controllers/conciliacion.controller.js` | Thin handler |
| `backend/src/routes/conciliacion.routes.js` | `GET /api/conciliacion` |

**Query params:** `dateFrom`, `dateTo`, `gameIds[]` (all games if omitted)

**Response shape (per game):**
```json
[
  {
    "gameId": "...",
    "gameName": "LOTTOPANTERA",
    "venta": 140000,
    "premio": 42000,
    "utilidad": 98000,
    "providers": [
      {
        "apiSystemId": "...",
        "providerName": "SRQ",
        "source": "EXTERNAL_API",
        "venta": 130000,
        "premio": 40000,
        "utilidad": 90000,
        "comerciales": [
          { "comercialId": 1, "comercialName": "Comercial A", "venta": 80000, "premio": 25000, "utilidad": 55000 },
          { "comercialId": 2, "comercialName": "Comercial B", "venta": 50000, "premio": 15000, "utilidad": 35000 }
        ]
      },
      {
        "providerName": "Online",
        "source": "TAQUILLA_ONLINE",
        "venta": 10000,
        "premio": 2000,
        "utilidad": 8000,
        "comerciales": []
      },
      {
        "apiSystemId": "...",
        "providerName": "Premier",
        "source": "WEBHOOK_PUSH",
        "venta": 5000,
        "premio": 1000,
        "utilidad": 4000,
        "comerciales": []
      }
    ]
  }
]
```

**Utilidad** = `venta - premio` (no additional costs/commissions).

### Frontend

| File | Purpose |
|------|---------|
| `frontend/app/admin/conciliacion/page.js` | Page component |
| `frontend/components/admin/conciliacion/ConciliacionTable.js` | Expandable table |
| `frontend/components/admin/conciliacion/ConciliacionFilters.js` | Date range + multi-game selector |

**Menu:** Top-level item "Conciliación" in the admin sidebar (not nested under Reportes).

**Table behavior:**
- Each row = one game (venta / premio / utilidad)
- Click to expand → shows provider rows (SRQ, Online, each PUSH provider by name)
- SRQ row can further expand → shows one sub-row per `ProviderComercial`
- Other providers are leaf nodes (no further expansion)

---

## 6. Deployment Flow

```bash
# 1. Backup DB before any changes
ssh 144 "PGPASSWORD='ToteSecure2024*' pg_dump -U tote_user -h localhost -p 5433 tote_db > /var/proyectos/backups/tote_$(date +%Y%m%d_%H%M).sql"

# 2. Pull latest code
ssh 144 "cd /var/proyectos/tote-web && git pull"

# 3. Install deps if needed
ssh 144 "cd /var/proyectos/tote-web/backend && npm install"

# 4. Dry-run multiplier update → review → apply
ssh 144 "cd /var/proyectos/tote-web/backend && node src/scripts/update-multipliers.js --dry-run"
ssh 144 "cd /var/proyectos/tote-web/backend && node src/scripts/update-multipliers.js"

# 5. Dry-run prize recalculation → review delta → apply
ssh 144 "cd /var/proyectos/tote-web/backend && node src/scripts/recalculate-prizes-30d.js --dry-run"
ssh 144 "cd /var/proyectos/tote-web/backend && node src/scripts/recalculate-prizes-30d.js"

# 6. Restart services
ssh 144 "pm2 restart tote-backend && pm2 restart tote-frontend"
```

No Prisma migrations — schema is unchanged.

---

## 7. File Inventory

### New files
- `backend/src/scripts/update-multipliers.js`
- `backend/src/scripts/recalculate-prizes-30d.js`
- `backend/src/services/conciliacion.service.js`
- `backend/src/controllers/conciliacion.controller.js`
- `backend/src/routes/conciliacion.routes.js`
- `frontend/app/admin/conciliacion/page.js`
- `frontend/components/admin/conciliacion/ConciliacionTable.js`
- `frontend/components/admin/conciliacion/ConciliacionFilters.js`

### Modified files
- `backend/src/services/prize-processor.service.js` — add aproximación logic
- `backend/src/app.js` (or wherever routes are registered) — register conciliacion routes
- `frontend/components/admin/AdminSidebar.js` (or equivalent) — add Conciliación menu item
