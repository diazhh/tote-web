# Prize Multipliers, Aproximación & Conciliación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix GameItem multipliers for all four games, add aproximación prize tier to Triple Pantera, add a 30-day prize recalculation script, and build a new Conciliación admin report.

**Architecture:** Backend scripts use Prisma directly (ES modules, `dotenv.config()`). Prize processor is extended with an `options` parameter to support reprocessing without balance updates. Conciliación is a new service+controller+route trio following the same pattern as `monitor`. Frontend adds a page under `/admin/conciliacion` wired into the existing sidebar in `frontend/app/admin/layout.js`.

**Tech Stack:** Node.js/ES modules, Prisma ORM, Express, Next.js 14 App Router, React 18, TailwindCSS v4, Lucide React, axios.

**Spec:** `docs/superpowers/specs/2026-04-22-prize-multipliers-aproximacion-conciliacion-design.md`

---

## File Map

| Action | Path |
|--------|------|
| Create | `backend/src/scripts/update-multipliers.js` |
| Create | `backend/src/scripts/recalculate-prizes-30d.js` |
| Modify | `backend/src/services/prize-processor.service.js` |
| Create | `backend/src/services/conciliacion.service.js` |
| Create | `backend/src/controllers/conciliacion.controller.js` |
| Create | `backend/src/routes/conciliacion.routes.js` |
| Modify | `backend/src/index.js` (add 2 lines: import + app.use) |
| Create | `frontend/lib/api/conciliacion.js` |
| Create | `frontend/components/admin/conciliacion/ConciliacionFilters.js` |
| Create | `frontend/components/admin/conciliacion/ConciliacionTable.js` |
| Create | `frontend/app/admin/conciliacion/page.js` |
| Modify | `frontend/app/admin/layout.js` (add menu entry) |

---

## Task 1: Script — update-multipliers.js

**Files:**
- Create: `backend/src/scripts/update-multipliers.js`

- [ ] **Step 1: Create the script**

```js
// backend/src/scripts/update-multipliers.js
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function updateGame(slug, getMultiplier) {
  const game = await prisma.game.findUnique({
    where: { slug },
    include: { items: true },
  });
  if (!game) {
    console.log(`  ⚠️  Not found: ${slug}`);
    return 0;
  }

  const changes = game.items
    .map(item => {
      const next = getMultiplier(item.number);
      return parseFloat(item.multiplier) !== next
        ? { id: item.id, number: item.number, from: item.multiplier, to: next }
        : null;
    })
    .filter(Boolean);

  console.log(`\n${game.name}: ${changes.length} items`);
  changes.slice(0, 5).forEach(c => console.log(`  [${c.number}] ${c.from} → ${c.to}`));
  if (changes.length > 5) console.log(`  ... and ${changes.length - 5} more`);

  if (!DRY_RUN) {
    for (const c of changes) {
      await prisma.gameItem.update({ where: { id: c.id }, data: { multiplier: c.to } });
    }
  }
  return changes.length;
}

async function main() {
  console.log(DRY_RUN ? '\n🔍 DRY RUN\n' : '\n🔧 Updating multipliers\n');

  let total = 0;
  total += await updateGame('lotoanimalito',    n => n === '16' ? 50 : 30);
  total += await updateGame('lottopantera',     n => n === '40' ? 100 : 37);
  total += await updateGame('triple-pantera',   n => parseInt(n, 10) % 100 === 0 ? 1000 : 600);
  total += await updateGame('terminal-pantera', () => 70);

  if (!DRY_RUN) {
    await prisma.game.update({
      where: { slug: 'triple-pantera' },
      data: { config: { aproximacion: { enabled: true, multiplier: 5 } } },
    });
    console.log('\n✅ Triple Pantera config.aproximacion → { enabled: true, multiplier: 5 }');
  } else {
    console.log('\n🔍 Would set Triple Pantera config.aproximacion = { enabled: true, multiplier: 5 }');
  }

  console.log(`\nTotal items changed: ${total}`);
  if (DRY_RUN) console.log('Run without --dry-run to apply.\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Verify it runs (dry-run)**

```bash
cd backend
node src/scripts/update-multipliers.js --dry-run
```

Expected output: lists items per game with current → target multipliers. No DB changes.

- [ ] **Step 3: Commit**

```bash
git add backend/src/scripts/update-multipliers.js
git commit -m "feat(scripts): add update-multipliers script with dry-run support"
```

---

## Task 2: Add aproximación to prize-processor.service.js

**Files:**
- Modify: `backend/src/services/prize-processor.service.js`

The existing `processPrizesForDraw` method uses `detail.multiplier` to compute prizes. We need to:
1. Load aproximación config from `draw.game.config`
2. Compute the two neighbor item IDs (±1 with wrap-around at 0/999)
3. Award those details with the aproximación multiplier
4. Add an `options` parameter to allow reprocessing (skip status check, skip balance update)

- [ ] **Step 1: Add options parameter and aproximación logic**

Replace the entire file content with the following (line numbers from the original are cited in comments):

```js
// backend/src/services/prize-processor.service.js
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import playerNotificationService from './player-notification.service.js';

class PrizeProcessorService {
  /**
   * Process prizes for a draw.
   * @param {string} drawId
   * @param {Object} [opts]
   * @param {boolean} [opts.skipStatusCheck=false]  - Allow PUBLISHED status (for reprocessing)
   * @param {boolean} [opts.skipBalanceUpdate=false] - Skip crediting user.balance (for reprocessing)
   */
  async processPrizesForDraw(drawId, opts = {}) {
    const { skipStatusCheck = false, skipBalanceUpdate = false } = opts;
    try {
      logger.info('Starting prize processing for draw', { drawId, opts });

      return await prisma.$transaction(async (tx) => {
        const draw = await tx.draw.findUnique({
          where: { id: drawId },
          include: {
            game: true,
            winnerItem: true
          }
        });

        if (!draw) {
          throw new Error('Sorteo no encontrado');
        }

        if (!skipStatusCheck && draw.status !== 'DRAWN') {
          throw new Error('El sorteo debe estar en estado DRAWN para procesar premios');
        }

        if (!draw.winnerItemId) {
          throw new Error('El sorteo no tiene un número ganador definido');
        }

        // ── Aproximación config ────────────────────────────────────────────
        const aproxCfg = (draw.game.config || {}).aproximacion;
        const hasAprox = aproxCfg?.enabled === true;
        const aproxMultiplier = hasAprox ? parseFloat(aproxCfg.multiplier) : 0;
        const neighborIds = new Set();

        if (hasAprox && draw.winnerItem) {
          const winNum = parseInt(draw.winnerItem.number, 10);
          const max    = 999;
          const n1Str  = String(winNum === 0 ? max : winNum - 1).padStart(3, '0');
          const n2Str  = String(winNum === max ? 0 : winNum + 1).padStart(3, '0');
          const neighbors = await tx.gameItem.findMany({
            where: { gameId: draw.game.id, number: { in: [n1Str, n2Str] } },
            select: { id: true },
          });
          neighbors.forEach(n => neighborIds.add(n.id));
        }
        // ──────────────────────────────────────────────────────────────────

        // Obtener SOLO los detalles de tickets que pertenecen a este sorteo
        // EXCLUIR tickets de tripleta externa (se verifican con lógica especial)
        const allTicketDetails = await tx.ticketDetail.findMany({
          where: {
            ticket: { drawId },
            status: 'ACTIVE'
          },
          include: {
            gameItem: true,
            ticket: { include: { user: true } }
          }
        });

        // Filtrar en código: excluir solo tripletas externas
        const ticketDetails = allTicketDetails.filter(detail => {
          const ticket = detail.ticket;
          if (ticket.source === 'EXTERNAL_API' &&
              ticket.providerData &&
              ticket.providerData.type === 'TRIPLETA') {
            return false;
          }
          return true;
        });

        logger.info('Found ticket details to process', {
          drawId,
          detailCount: ticketDetails.length
        });

        let totalPrizesAwarded = 0;
        const processedTickets = new Set();
        const winningTickets = new Set();

        for (const detail of ticketDetails) {
          const isExact = detail.gameItemId === draw.winnerItemId;
          const isAprox = hasAprox && neighborIds.has(detail.gameItemId);
          const isWinner = isExact || isAprox;

          let prize = 0;
          if (isExact) {
            prize = parseFloat(detail.amount) * parseFloat(detail.multiplier);
          } else if (isAprox) {
            prize = parseFloat(detail.amount) * aproxMultiplier;
          }

          await tx.ticketDetail.update({
            where: { id: detail.id },
            data: {
              status: isWinner ? 'WON' : 'LOST',
              prize
            }
          });

          if (isWinner) {
            totalPrizesAwarded += prize;
            winningTickets.add(detail.ticketId);

            logger.info('Winning detail found', {
              ticketId: detail.ticketId,
              detailId: detail.id,
              gameItemNumber: detail.gameItem.number,
              amount: detail.amount,
              prize,
              type: isExact ? 'exact' : 'aproximacion',
            });
          }

          processedTickets.add(detail.ticketId);
        }

        // Actualizar cada ticket: recalcular su premio total y status
        for (const ticketId of processedTickets) {
          const allDetails = await tx.ticketDetail.findMany({
            where: { ticketId }
          });

          const ticketTotalPrize = allDetails.reduce((sum, d) => sum + parseFloat(d.prize || 0), 0);

          const hasWinningDetail = allDetails.some(d => d.status === 'WON');
          const hasActiveDetail  = allDetails.some(d => d.status === 'ACTIVE');

          let ticketStatus;
          if (hasWinningDetail) {
            ticketStatus = 'WON';
          } else if (hasActiveDetail) {
            ticketStatus = 'ACTIVE';
          } else {
            ticketStatus = 'LOST';
          }

          await tx.ticket.update({
            where: { id: ticketId },
            data: { status: ticketStatus, totalPrize: ticketTotalPrize }
          });

          if (!skipBalanceUpdate && winningTickets.has(ticketId)) {
            const ticket = await tx.ticket.findUnique({
              where: { id: ticketId },
              include: { user: true }
            });

            // Prize for THIS draw (exact + aproximación)
            const thisDrawPrize = ticketDetails
              .filter(d => d.ticketId === ticketId &&
                (d.gameItemId === draw.winnerItemId || neighborIds.has(d.gameItemId)))
              .reduce((sum, d) => {
                if (d.gameItemId === draw.winnerItemId) {
                  return sum + parseFloat(d.amount) * parseFloat(d.multiplier);
                }
                return sum + parseFloat(d.amount) * aproxMultiplier;
              }, 0);

            if (ticket.userId) {
              await tx.user.update({
                where: { id: ticket.userId },
                data: { balance: { increment: thisDrawPrize } }
              });

              logger.info('Prize awarded to user', {
                userId: ticket.userId,
                username: ticket.user.username,
                ticketId: ticket.id,
                prize: thisDrawPrize
              });

              playerNotificationService.notifyPrizeWon(ticket.userId, thisDrawPrize, draw);
            } else {
              logger.info('Prize calculated for external ticket', {
                ticketId: ticket.id,
                source: ticket.source,
                prize: thisDrawPrize
              });
            }
          }
        }

        const winnersCount = winningTickets.size;
        const losersCount  = processedTickets.size - winnersCount;

        const summary = {
          drawId,
          gameName: draw.game.name,
          winnerNumber: draw.winnerItem.number,
          totalTickets: processedTickets.size,
          winnersCount,
          losersCount,
          totalPrizesAwarded,
          processedAt: new Date()
        };

        logger.info('Prize processing completed', summary);
        return summary;
      }, { timeout: 30000 });
    } catch (error) {
      logger.error('Error processing prizes:', error);
      throw error;
    }
  }

  async getPrizesSummary(drawId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: { game: true, winnerItem: true }
      });

      if (!draw) throw new Error('Sorteo no encontrado');

      const tickets = await prisma.ticket.findMany({
        where: { drawId },
        include: {
          details: { where: { status: 'WON' } },
          user: { select: { id: true, username: true, email: true } }
        }
      });

      const winners = tickets
        .filter(t => t.status === 'WON')
        .map(t => ({
          ticketId: t.id,
          user: t.user,
          totalPrize: parseFloat(t.totalPrize),
          createdAt: t.createdAt
        }));

      const totalPrizesAwarded = winners.reduce((sum, w) => sum + w.totalPrize, 0);

      return {
        drawId,
        gameName: draw.game.name,
        winnerNumber: draw.winnerItem?.number,
        status: draw.status,
        totalTickets: tickets.length,
        winnersCount: winners.length,
        losersCount: tickets.length - winners.length,
        totalPrizesAwarded,
        winners
      };
    } catch (error) {
      logger.error('Error getting prizes summary:', error);
      throw error;
    }
  }
}

export default new PrizeProcessorService();
```

- [ ] **Step 2: Verify the backend starts without errors**

```bash
cd backend
node src/index.js &
sleep 3 && curl -s http://localhost:3001/health | node -e "process.stdin.resume();process.stdin.on('data',d=>console.log(d.toString()))"
kill %1
```

Expected: `{"status":"ok",...}`

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/prize-processor.service.js
git commit -m "feat(prizes): add aproximacion prize tier to Triple Pantera + opts param for reprocessing"
```

---

## Task 3: Script — recalculate-prizes-30d.js

**Files:**
- Create: `backend/src/scripts/recalculate-prizes-30d.js`

This script resets and reprocesses prizes for all DRAWN/PUBLISHED draws in the last 30 days. It updates `TicketDetail.multiplier` to the current `GameItem.multiplier` before reprocessing, so the corrected rates take effect.

- [ ] **Step 1: Create the script**

```js
// backend/src/scripts/recalculate-prizes-30d.js
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import prizeProcessor from '../services/prize-processor.service.js';
import drawStatsService from '../services/draw-stats.service.js';

dotenv.config();

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(DRY_RUN ? '\n🔍 DRY RUN — nothing will be written\n' : '\n🔧 Recalculating prizes for last 30 days...\n');

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const draws = await prisma.draw.findMany({
    where: {
      status: { in: ['DRAWN', 'PUBLISHED'] },
      drawDate: { gte: since },
    },
    include: { game: { select: { name: true } } },
    orderBy: { drawDate: 'asc' },
  });

  console.log(`Found ${draws.length} draws\n`);

  let processed = 0;
  let failed = 0;
  let totalBefore = 0;
  let totalAfter = 0;

  for (const draw of draws) {
    const label = `${draw.game.name} ${draw.drawDate.toISOString().split('T')[0]} (${draw.id.slice(0, 8)})`;
    try {
      // Compute "before" totals
      const beforeAgg = await prisma.ticketDetail.aggregate({
        where: { ticket: { drawId: draw.id } },
        _sum: { prize: true },
      });
      const prizeBefore = parseFloat(beforeAgg._sum.prize || 0);
      totalBefore += prizeBefore;

      if (DRY_RUN) {
        console.log(`🔍 ${label} — current prize total: ${prizeBefore.toFixed(2)}`);
        processed++;
        continue;
      }

      // Step 1: Sync TicketDetail.multiplier → current GameItem.multiplier
      const details = await prisma.ticketDetail.findMany({
        where: { ticket: { drawId: draw.id } },
        include: { gameItem: { select: { multiplier: true } } },
      });
      for (const d of details) {
        if (d.gameItem) {
          await prisma.ticketDetail.update({
            where: { id: d.id },
            data: { multiplier: d.gameItem.multiplier },
          });
        }
      }

      // Step 2: Reset TicketDetails to ACTIVE with prize=0
      await prisma.ticketDetail.updateMany({
        where: { ticket: { drawId: draw.id } },
        data: { prize: 0, status: 'ACTIVE' },
      });

      // Step 3: Reset Tickets
      const ticketIds = [...new Set(details.map(d => d.ticketId))];
      if (ticketIds.length > 0) {
        await prisma.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: { totalPrize: 0, status: 'ACTIVE' },
        });
      }

      // Step 4: Reset draw processing flags
      await prisma.draw.update({
        where: { id: draw.id },
        data: { prizesProcessed: false, statsCalculated: false },
      });

      // Step 5: Reprocess prizes (skip status check + balance update)
      await prizeProcessor.processPrizesForDraw(draw.id, {
        skipStatusCheck: true,
        skipBalanceUpdate: true,
      });

      // Step 6: Recalculate draw stats
      await drawStatsService.calculateDrawStats(draw.id);

      // Compute "after" totals
      const afterAgg = await prisma.ticketDetail.aggregate({
        where: { ticket: { drawId: draw.id } },
        _sum: { prize: true },
      });
      const prizeAfter = parseFloat(afterAgg._sum.prize || 0);
      totalAfter += prizeAfter;

      const delta = prizeAfter - prizeBefore;
      console.log(`✅ ${label} — antes: ${prizeBefore.toFixed(2)} / después: ${prizeAfter.toFixed(2)} (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`);
      processed++;
    } catch (err) {
      console.error(`❌ ${label} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${DRY_RUN ? '🔍' : '✅'} ${processed} processed, ${failed} failed`);
  if (!DRY_RUN) {
    const delta = totalAfter - totalBefore;
    console.log(`  Total prizes before: ${totalBefore.toFixed(2)}`);
    console.log(`  Total prizes after:  ${totalAfter.toFixed(2)}`);
    console.log(`  Net delta:           ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`);
  }
  if (DRY_RUN) console.log('\nRun without --dry-run to apply.\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Verify it runs (dry-run only — no local data expected)**

```bash
cd backend
node src/scripts/recalculate-prizes-30d.js --dry-run
```

Expected: `Found 0 draws` (local DB likely empty) — no error.

- [ ] **Step 3: Commit**

```bash
git add backend/src/scripts/recalculate-prizes-30d.js
git commit -m "feat(scripts): add recalculate-prizes-30d with dry-run support"
```

---

## Task 4: conciliacion.service.js

**Files:**
- Create: `backend/src/services/conciliacion.service.js`

Aggregates tickets by game → provider → (SRQ) comercializadora. Uses `drawDate` for the date range filter (same pattern as `monitor.service.js`).

- [ ] **Step 1: Create the service**

```js
// backend/src/services/conciliacion.service.js
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class ConciliacionService {
  /**
   * Get conciliación report.
   * @param {Object} params
   * @param {string} params.dateFrom  - YYYY-MM-DD
   * @param {string} params.dateTo    - YYYY-MM-DD
   * @param {string[]} [params.gameIds] - optional game UUID filter
   */
  async getConciliacion({ dateFrom, dateTo, gameIds = [] } = {}) {
    try {
      // 1. Resolve draws in range
      const where = {
        status: { in: ['DRAWN', 'PUBLISHED'] },
      };
      if (dateFrom && dateTo) {
        where.drawDate = {
          gte: new Date(dateFrom + 'T00:00:00.000Z'),
          lte: new Date(dateTo   + 'T00:00:00.000Z'),
        };
      }
      if (gameIds.length > 0) {
        where.gameId = { in: gameIds };
      }

      const draws = await prisma.draw.findMany({
        where,
        select: {
          id: true,
          gameId: true,
          game: { select: { id: true, name: true } },
        },
      });

      if (draws.length === 0) return [];

      // Group draws by game
      const drawsByGame = {};
      for (const d of draws) {
        if (!drawsByGame[d.gameId]) {
          drawsByGame[d.gameId] = { game: d.game, drawIds: [] };
        }
        drawsByGame[d.gameId].drawIds.push(d.id);
      }

      const allDrawIds = draws.map(d => d.id);

      // 2. Fetch all tickets (one query)
      const tickets = await prisma.ticket.findMany({
        where: { drawId: { in: allDrawIds } },
        select: {
          drawId:      true,
          source:      true,
          apiSystemId: true,
          totalAmount: true,
          totalPrize:  true,
          providerData: true,
          apiSystem: { select: { id: true, name: true, slug: true } },
        },
      });

      // 3. Identify SRQ system and load comercializadora names
      const srqTickets = tickets.filter(t => t.apiSystem?.slug === 'srq');
      const comercialExternalIds = [
        ...new Set(srqTickets.map(t => t.providerData?.comercialID).filter(id => id != null)),
      ];

      let comercialNames = {}; // externalId → name
      if (comercialExternalIds.length > 0 && srqTickets.length > 0) {
        const srqSystemId = srqTickets[0].apiSystem.id;
        const comerciales = await prisma.providerComercial.findMany({
          where: {
            apiSystemId: srqSystemId,
            externalId: { in: comercialExternalIds },
          },
          select: { externalId: true, name: true },
        });
        comercialNames = Object.fromEntries(
          comerciales.map(c => [c.externalId, c.name || `Comercial ${c.externalId}`])
        );
      }

      // 4. Aggregate per game
      const result = [];

      for (const [gameId, { game, drawIds }] of Object.entries(drawsByGame)) {
        const gameTickets = tickets.filter(t => drawIds.includes(t.drawId));

        // Group by provider key
        // Key: '__online__' for TAQUILLA_ONLINE, apiSystemId for others
        const providerMap = {};

        for (const ticket of gameTickets) {
          const isOnline  = ticket.source === 'TAQUILLA_ONLINE';
          const key       = isOnline ? '__online__' : (ticket.apiSystemId || '__unknown__');
          const isSRQ     = ticket.apiSystem?.slug === 'srq';

          if (!providerMap[key]) {
            providerMap[key] = {
              apiSystemId:  ticket.apiSystemId  || null,
              providerName: isOnline ? 'Online' : (ticket.apiSystem?.name || 'Desconocido'),
              source:       ticket.source,
              venta:        0,
              premio:       0,
              isSRQ,
              comerciales: {},
            };
          }

          const p = providerMap[key];
          p.venta  += parseFloat(ticket.totalAmount || 0);
          p.premio += parseFloat(ticket.totalPrize  || 0);

          if (isSRQ) {
            const cid = ticket.providerData?.comercialID;
            if (cid != null) {
              if (!p.comerciales[cid]) {
                p.comerciales[cid] = {
                  comercialId:   cid,
                  comercialName: comercialNames[cid] || `Comercial ${cid}`,
                  venta:  0,
                  premio: 0,
                };
              }
              p.comerciales[cid].venta  += parseFloat(ticket.totalAmount || 0);
              p.comerciales[cid].premio += parseFloat(ticket.totalPrize  || 0);
            }
          }
        }

        let gameVenta = 0, gamePremio = 0;

        const providers = Object.values(providerMap).map(p => {
          gameVenta  += p.venta;
          gamePremio += p.premio;
          return {
            apiSystemId:  p.apiSystemId,
            providerName: p.providerName,
            source:       p.source,
            venta:        p.venta,
            premio:       p.premio,
            utilidad:     p.venta - p.premio,
            comerciales:  p.isSRQ
              ? Object.values(p.comerciales)
                  .map(c => ({ ...c, utilidad: c.venta - c.premio }))
                  .sort((a, b) => b.venta - a.venta)
              : [],
          };
        });

        result.push({
          gameId:    game.id,
          gameName:  game.name,
          venta:     gameVenta,
          premio:    gamePremio,
          utilidad:  gameVenta - gamePremio,
          providers: providers.sort((a, b) => b.venta - a.venta),
        });
      }

      // Sort by game name
      return result.sort((a, b) => a.gameName.localeCompare(b.gameName));
    } catch (error) {
      logger.error('Error in getConciliacion:', error);
      throw error;
    }
  }
}

export default new ConciliacionService();
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/conciliacion.service.js
git commit -m "feat(conciliacion): add aggregation service with game/provider/comercializadora breakdown"
```

---

## Task 5: Controller, Routes, and index.js registration

**Files:**
- Create: `backend/src/controllers/conciliacion.controller.js`
- Create: `backend/src/routes/conciliacion.routes.js`
- Modify: `backend/src/index.js`

- [ ] **Step 1: Create the controller**

```js
// backend/src/controllers/conciliacion.controller.js
import conciliacionService from '../services/conciliacion.service.js';
import logger from '../lib/logger.js';

class ConciliacionController {
  /**
   * GET /api/conciliacion
   * Query params: dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD), gameIds[] (UUID[])
   */
  async getReport(req, res) {
    try {
      const { dateFrom, dateTo } = req.query;
      const gameIds = req.query['gameIds[]']
        ? (Array.isArray(req.query['gameIds[]'])
            ? req.query['gameIds[]']
            : [req.query['gameIds[]']])
        : [];

      const data = await conciliacionService.getConciliacion({ dateFrom, dateTo, gameIds });
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error en getReport conciliacion:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new ConciliacionController();
```

- [ ] **Step 2: Create the routes file**

```js
// backend/src/routes/conciliacion.routes.js
import { Router } from 'express';
import conciliacionController from '../controllers/conciliacion.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN', 'OPERATOR'));

router.get('/', conciliacionController.getReport.bind(conciliacionController));

export default router;
```

- [ ] **Step 3: Register the route in backend/src/index.js**

In `backend/src/index.js`, add after the last import block (around line 181, after the portal import):

```js
import conciliacionRoutes from './routes/conciliacion.routes.js';
```

And after the `app.use('/api/portal', portalRoutes);` line (around line 230):

```js
app.use('/api/conciliacion', conciliacionRoutes);
```

- [ ] **Step 4: Test the endpoint**

```bash
cd backend && npm run dev &
sleep 4

# Get a token first (replace with real credentials):
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_ADMIN_PASSWORD"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token||JSON.parse(d).accessToken||'no-token'))")

curl -s "http://localhost:3001/api/conciliacion?dateFrom=2026-04-01&dateTo=2026-04-22" \
  -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2).slice(0,500)))"
```

Expected: `{"success":true,"data":[...]}` (empty array if no local data).

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/conciliacion.controller.js \
        backend/src/routes/conciliacion.routes.js \
        backend/src/index.js
git commit -m "feat(conciliacion): add controller, routes, and register in index.js"
```

---

## Task 6: Frontend API client

**Files:**
- Create: `frontend/lib/api/conciliacion.js`

- [ ] **Step 1: Create the API client**

```js
// frontend/lib/api/conciliacion.js
import axios from './axios';

export const conciliacionApi = {
  /**
   * @param {Object} params
   * @param {string} params.dateFrom  - YYYY-MM-DD
   * @param {string} params.dateTo    - YYYY-MM-DD
   * @param {string[]} [params.gameIds] - optional UUID array
   */
  getReport: async ({ dateFrom, dateTo, gameIds = [] } = {}) => {
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo)   params.append('dateTo',   dateTo);
    gameIds.forEach(id => params.append('gameIds[]', id));
    const response = await axios.get(`/conciliacion?${params.toString()}`);
    return response.data;
  },
};

export default conciliacionApi;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/api/conciliacion.js
git commit -m "feat(conciliacion): add frontend API client"
```

---

## Task 7: ConciliacionFilters component

**Files:**
- Create: `frontend/components/admin/conciliacion/ConciliacionFilters.js`

- [ ] **Step 1: Create the component**

```jsx
// frontend/components/admin/conciliacion/ConciliacionFilters.js
'use client';

import { todayInCaracas } from '@/lib/utils/dateUtils';

export default function ConciliacionFilters({ filters, games, onChange, onSearch, loading }) {
  const handleChange = (field, value) => {
    onChange({ ...filters, [field]: value });
  };

  const toggleGame = (gameId) => {
    const current = filters.gameIds || [];
    const next = current.includes(gameId)
      ? current.filter(id => id !== gameId)
      : [...current, gameId];
    onChange({ ...filters, gameIds: next });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        {/* Date range */}
        <div className="flex items-center gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo || todayInCaracas()}
              onChange={e => handleChange('dateFrom', e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom}
              max={todayInCaracas()}
              onChange={e => handleChange('dateTo', e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Buscar button */}
        <button
          onClick={onSearch}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? 'Cargando...' : 'Buscar'}
        </button>
      </div>

      {/* Game selector */}
      {games.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Juegos (todos si ninguno seleccionado)</p>
          <div className="flex flex-wrap gap-2">
            {games.map(game => {
              const selected = (filters.gameIds || []).includes(game.id);
              return (
                <button
                  key={game.id}
                  onClick={() => toggleGame(game.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition ${
                    selected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {game.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/conciliacion/ConciliacionFilters.js
git commit -m "feat(conciliacion): add ConciliacionFilters component"
```

---

## Task 8: ConciliacionTable component

**Files:**
- Create: `frontend/components/admin/conciliacion/ConciliacionTable.js`

The table has three levels:
1. Game row (always visible) — click to expand
2. Provider row (SRQ, Online, Premier…) — SRQ rows have a second expand toggle
3. Comercializadora sub-row (only under SRQ)

- [ ] **Step 1: Create the component**

```jsx
// frontend/components/admin/conciliacion/ConciliacionTable.js
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

function fmt(n) {
  return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function UtilidadCell({ utilidad }) {
  const isPositive = utilidad >= 0;
  return (
    <td className={`px-4 py-2 text-right text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? '' : '-'}{fmt(Math.abs(utilidad))}
    </td>
  );
}

function ComercialRows({ comerciales }) {
  return (
    <>
      {comerciales.map((c, i) => (
        <tr key={i} className="bg-gray-50 border-t border-gray-100">
          <td className="px-4 py-1.5 pl-20 text-xs text-gray-500">{c.comercialName}</td>
          <td className="px-4 py-1.5 text-right text-xs text-gray-600">{fmt(c.venta)}</td>
          <td className="px-4 py-1.5 text-right text-xs text-gray-600">{fmt(c.premio)}</td>
          <UtilidadCell utilidad={c.utilidad} />
        </tr>
      ))}
    </>
  );
}

function ProviderRow({ provider }) {
  const [open, setOpen] = useState(false);
  const hasCom = provider.comerciales?.length > 0;

  return (
    <>
      <tr className="border-t border-gray-100 bg-blue-50/30">
        <td className="px-4 py-2 pl-10 text-sm text-gray-700">
          <div className="flex items-center gap-1">
            {hasCom ? (
              <button onClick={() => setOpen(v => !v)} className="p-0.5 rounded hover:bg-blue-100">
                {open ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
              </button>
            ) : (
              <span className="w-4 inline-block" />
            )}
            {provider.providerName}
          </div>
        </td>
        <td className="px-4 py-2 text-right text-sm text-gray-700">{fmt(provider.venta)}</td>
        <td className="px-4 py-2 text-right text-sm text-gray-700">{fmt(provider.premio)}</td>
        <UtilidadCell utilidad={provider.utilidad} />
      </tr>
      {open && hasCom && <ComercialRows comerciales={provider.comerciales} />}
    </>
  );
}

function GameRow({ row }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-gray-50 border-b border-gray-200"
        onClick={() => setOpen(v => !v)}
      >
        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
            {row.gameName}
          </div>
        </td>
        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{fmt(row.venta)}</td>
        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{fmt(row.premio)}</td>
        <UtilidadCell utilidad={row.utilidad} />
      </tr>
      {open && row.providers.map((p, i) => (
        <ProviderRow key={p.apiSystemId || p.providerName || i} provider={p} />
      ))}
    </>
  );
}

export default function ConciliacionTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500 text-sm">
        Sin resultados para el período seleccionado.
      </div>
    );
  }

  const totals = data.reduce(
    (acc, row) => ({ venta: acc.venta + row.venta, premio: acc.premio + row.premio, utilidad: acc.utilidad + row.utilidad }),
    { venta: 0, premio: 0, utilidad: 0 }
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Juego / Proveedor</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Venta</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Premio</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Utilidad</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <GameRow key={row.gameId} row={row} />
          ))}
        </tbody>
        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
          <tr>
            <td className="px-4 py-3 text-sm font-bold text-gray-900">TOTAL</td>
            <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{fmt(totals.venta)}</td>
            <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{fmt(totals.premio)}</td>
            <UtilidadCell utilidad={totals.utilidad} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/conciliacion/ConciliacionTable.js
git commit -m "feat(conciliacion): add ConciliacionTable with 3-level expandable rows"
```

---

## Task 9: Conciliación page

**Files:**
- Create: `frontend/app/admin/conciliacion/page.js`

- [ ] **Step 1: Create the page**

```jsx
// frontend/app/admin/conciliacion/page.js
'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { todayInCaracas } from '@/lib/utils/dateUtils';
import conciliacionApi from '@/lib/api/conciliacion';
import ConciliacionFilters from '@/components/admin/conciliacion/ConciliacionFilters';
import ConciliacionTable from '@/components/admin/conciliacion/ConciliacionTable';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

export default function ConciliacionPage() {
  const [filters, setFilters] = useState({
    dateFrom: todayInCaracas(),
    dateTo:   todayInCaracas(),
    gameIds:  [],
  });
  const [games, setGames]   = useState([]);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);

  // Load games for the filter
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    fetch(`${API_URL}/games`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(res => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setGames(list.filter(g => g.isActive));
      })
      .catch(() => toast.error('Error cargando juegos'));
  }, []);

  const fetchReport = async () => {
    if (!filters.dateFrom || !filters.dateTo) {
      toast.error('Selecciona un rango de fechas');
      return;
    }
    setLoading(true);
    try {
      const result = await conciliacionApi.getReport({
        dateFrom: filters.dateFrom,
        dateTo:   filters.dateTo,
        gameIds:  filters.gameIds,
      });
      if (result?.success) {
        setData(result.data);
        if (result.data.length === 0) toast.info('Sin datos para el período seleccionado');
      } else {
        toast.error('Error en la respuesta del servidor');
      }
    } catch {
      toast.error('Error cargando conciliación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Conciliación</h1>
        <p className="text-sm text-gray-500">Venta, premios y utilidad por juego y proveedor</p>
      </div>

      <ConciliacionFilters
        filters={filters}
        games={games}
        onChange={setFilters}
        onSearch={fetchReport}
        loading={loading}
      />

      {data !== null && <ConciliacionTable data={data} />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/admin/conciliacion/page.js
git commit -m "feat(conciliacion): add conciliacion admin page"
```

---

## Task 10: Add menu item in admin layout

**Files:**
- Modify: `frontend/app/admin/layout.js`

- [ ] **Step 1: Add `Scale` to the lucide-react import (line 6)**

Find the existing import line:
```js
import { LayoutDashboard, Trophy, Calendar, Settings, LogOut, Users, MessageSquare, Send, Instagram, Facebook, Music, Bot, Menu, X, PauseCircle, DollarSign, Plug, Activity, FileText, BarChart3, List } from 'lucide-react';
```

Replace with:
```js
import { LayoutDashboard, Trophy, Calendar, Settings, LogOut, Users, MessageSquare, Send, Instagram, Facebook, Music, Bot, Menu, X, PauseCircle, DollarSign, Plug, Activity, FileText, BarChart3, List, Scale } from 'lucide-react';
```

- [ ] **Step 2: Add the Conciliación navigation entry**

In the `navigation` array, after the `Tickets` entry (around line 67):

```js
{ name: 'Tickets', href: '/admin/tickets-report', icon: List, adminOnly: true },
```

Add after it:
```js
{ name: 'Conciliación', href: '/admin/conciliacion', icon: Scale, adminOnly: true },
```

- [ ] **Step 3: Verify the dev server shows the menu item**

```bash
cd frontend && npm run dev
```

Open `http://localhost:10000/admin` in a browser, log in as ADMIN, and confirm "Conciliación" appears in the sidebar.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/layout.js
git commit -m "feat(conciliacion): add Conciliación menu item to admin sidebar"
```

---

## Task 11: Push to GitHub and deploy to production

- [ ] **Step 1: Push to GitHub**

```bash
git push origin diazhh
```

- [ ] **Step 2: SSH to production and take a DB backup**

```bash
ssh 144 "mkdir -p /var/proyectos/backups && PGPASSWORD='ToteSecure2024*' pg_dump -U tote_user -h localhost -p 5433 tote_db > /var/proyectos/backups/tote_$(date +%Y%m%d_%H%M).sql && echo 'Backup OK'"
```

Expected: `Backup OK`

- [ ] **Step 3: Pull code and install dependencies**

```bash
ssh 144 "cd /var/proyectos/tote-web && git pull && cd backend && npm install && cd ../frontend && npm install"
```

- [ ] **Step 4: Dry-run multiplier update**

```bash
ssh 144 "cd /var/proyectos/tote-web/backend && node src/scripts/update-multipliers.js --dry-run"
```

Review output carefully. Confirm item counts look correct per game.

- [ ] **Step 5: Apply multiplier update**

```bash
ssh 144 "cd /var/proyectos/tote-web/backend && node src/scripts/update-multipliers.js"
```

- [ ] **Step 6: Dry-run prize recalculation**

```bash
ssh 144 "cd /var/proyectos/tote-web/backend && node src/scripts/recalculate-prizes-30d.js --dry-run"
```

Review the list of draws to be reprocessed and their current prize totals.

- [ ] **Step 7: Apply prize recalculation**

```bash
ssh 144 "cd /var/proyectos/tote-web/backend && node src/scripts/recalculate-prizes-30d.js"
```

Review the delta output — positives mean new prizes awarded (aproximación + corrected multipliers).

- [ ] **Step 8: Restart services**

```bash
ssh 144 "pm2 restart tote-backend && pm2 restart tote-frontend && pm2 list"
```

- [ ] **Step 9: Smoke test**

```bash
ssh 144 "curl -s http://localhost:3001/health"
```

Open `https://tote.atilax.io/admin/conciliacion` in a browser. Select a date range and search.

---

## Self-Review Checklist

- [x] Spec §2 (Multiplier corrections) → Task 1
- [x] Spec §3 (Aproximación) → Task 2 (`prize-processor.service.js`)
- [x] Spec §4 (Recalculation script) → Task 3
- [x] Spec §5 (Conciliación backend) → Tasks 4–5
- [x] Spec §5 (Conciliación frontend) → Tasks 6–10
- [x] Spec §6 (Deployment flow) → Task 11
- [x] `options.skipStatusCheck` used in Task 3 matches the parameter added in Task 2
- [x] `providerData.comercialID` (Integer) matched against `ProviderComercial.externalId` (Int) in Task 4
- [x] `drawDate` field used for date filtering in Task 4 (matches `monitor.service.js` pattern)
- [x] `Scale` icon imported before use in Task 10
- [x] No user balance updates in `recalculate-prizes-30d.js` (per spec §4 caveat)
