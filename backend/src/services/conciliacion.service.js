// backend/src/services/conciliacion.service.js
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Identifies how a ticket should be grouped for the Conciliación report.
 * Production invariants (verified 2026-04-22):
 *   - Legacy SRQ tickets have source='EXTERNAL_API' and apiSystemId=NULL
 *   - PUSH provider tickets have source='WEBHOOK_PUSH' and a populated apiSystemId + apiSystem.name
 *   - Online tickets have source='TAQUILLA_ONLINE' and apiSystemId=NULL
 */
function classifyTicket(ticket) {
  if (ticket.source === 'TAQUILLA_ONLINE') {
    return { key: '__online__', providerName: 'Online', isSRQ: false };
  }
  if (ticket.source === 'EXTERNAL_API') {
    // SRQ is the only PULL provider in the system. Its tickets have apiSystemId=NULL in production.
    return { key: '__srq__', providerName: 'SRQ', isSRQ: true };
  }
  if (ticket.source === 'WEBHOOK_PUSH') {
    const key = ticket.apiSystemId || '__push_unknown__';
    const providerName = ticket.apiSystem?.name || 'Desconocido';
    return { key, providerName, isSRQ: false };
  }
  return { key: '__other__', providerName: 'Otro', isSRQ: false };
}

class ConciliacionService {
  /**
   * Get conciliación report.
   * @param {Object} params
   * @param {string} params.dateFrom   - YYYY-MM-DD
   * @param {string} params.dateTo     - YYYY-MM-DD
   * @param {string[]} [params.gameIds] - optional game UUID filter
   */
  async getConciliacion({ dateFrom, dateTo, gameIds = [] } = {}) {
    try {
      if (!dateFrom || !dateTo) {
        throw new Error('dateFrom and dateTo are required');
      }

      // Match monitor.service.js date semantics: drawDate is @db.Date, and both endpoints
      // are compared with 00:00 UTC. This is an inclusive range over dates.
      const fromDate = new Date(dateFrom + 'T00:00:00.000Z');
      const toDate   = new Date(dateTo   + 'T00:00:00.000Z');

      // 1. Resolve draws in range.
      // Match monitor.service.js: NO status filter. Draws in CLOSED/SCHEDULED state
      // still have real ticket sales (reventa en curso) that must appear in the report.
      const where = { drawDate: { gte: fromDate, lte: toDate } };
      if (gameIds.length > 0) {
        where.gameId = { in: gameIds };
      }

      const draws = await prisma.draw.findMany({
        where,
        select: {
          id:     true,
          gameId: true,
          game:   { select: { id: true, name: true } },
        },
      });

      if (draws.length === 0) return [];

      // Group draws by game
      const drawsByGame = {};
      for (const d of draws) {
        if (!drawsByGame[d.gameId]) {
          drawsByGame[d.gameId] = { game: d.game, drawIds: new Set() };
        }
        drawsByGame[d.gameId].drawIds.add(d.id);
      }

      const allDrawIds = draws.map(d => d.id);

      // 2. Fetch tickets for the draws (excluding CANCELLED, matching monitor.service.js).
      const tickets = await prisma.ticket.findMany({
        where: {
          drawId: { in: allDrawIds },
          status: { not: 'CANCELLED' },
        },
        select: {
          drawId:       true,
          source:       true,
          apiSystemId:  true,
          totalAmount:  true,
          totalPrize:   true,
          status:       true,
          providerData: true,
          apiSystem:    { select: { id: true, name: true, slug: true } },
        },
      });

      // 3. Tripleta prize attribution (external SRQ tripletas).
      // An external tripleta's prize is attributed to the draw where the 3-match condition
      // completed (prizeDrawId), not to the draw where it was bought (drawId). Pull those
      // winners separately and fold their prize into the aggregate per target draw.
      const tripletaWinners = await prisma.ticket.findMany({
        where: {
          prizeDrawId: { in: allDrawIds },
          status:      'WON',
        },
        select: {
          prizeDrawId:  true,
          totalPrize:   true,
          providerData: true,
        },
      });

      // 4. Load SRQ ApiSystem id once and collect comercializadora names.
      // Legacy SRQ tickets carry apiSystemId=NULL, so we look up the SRQ system by slug.
      const srqSystem = await prisma.apiSystem.findFirst({
        where: { slug: 'srq' },
        select: { id: true },
      });

      const srqTickets = tickets.filter(t => t.source === 'EXTERNAL_API');
      const comercialExternalIds = [
        ...new Set(
          [...srqTickets, ...tripletaWinners]
            .map(t => t.providerData?.comercialID)
            .filter(v => v != null)
            .map(v => parseInt(v, 10))
            .filter(n => !Number.isNaN(n))
        ),
      ];

      let comercialNames = {}; // externalId → name
      if (srqSystem?.id && comercialExternalIds.length > 0) {
        const comerciales = await prisma.providerComercial.findMany({
          where: {
            apiSystemId: srqSystem.id,
            externalId:  { in: comercialExternalIds },
          },
          select: { externalId: true, name: true },
        });
        comercialNames = Object.fromEntries(
          comerciales.map(c => [c.externalId, c.name || `Comercial ${c.externalId}`])
        );
      }

      // 5. Aggregate per game.
      const result = [];

      for (const [gameId, { game, drawIds }] of Object.entries(drawsByGame)) {
        const gameTickets = tickets.filter(t => drawIds.has(t.drawId));

        // Group by provider key
        const providerMap = {};

        for (const ticket of gameTickets) {
          const { key, providerName, isSRQ } = classifyTicket(ticket);

          if (!providerMap[key]) {
            providerMap[key] = {
              apiSystemId:  ticket.apiSystemId || null,
              providerName,
              source:       ticket.source,
              venta:        0,
              premio:       0,
              isSRQ,
              comerciales:  {},
            };
          }

          const p = providerMap[key];
          p.venta += parseFloat(ticket.totalAmount || 0);

          // Exclude external tripletas from regular prize sum — their prize is attributed
          // separately below via the prizeDrawId join (mirrors monitor.service.js).
          const isExternalTripleta =
            ticket.source === 'EXTERNAL_API' &&
            ticket.providerData?.type === 'TRIPLETA';
          if (!isExternalTripleta) {
            p.premio += parseFloat(ticket.totalPrize || 0);
          }

          if (isSRQ) {
            const rawCid = ticket.providerData?.comercialID;
            const cid = rawCid == null ? null : parseInt(rawCid, 10);
            if (cid != null && !Number.isNaN(cid)) {
              if (!p.comerciales[cid]) {
                p.comerciales[cid] = {
                  comercialId:   cid,
                  comercialName: comercialNames[cid] || `Comercial ${cid}`,
                  venta:         0,
                  premio:        0,
                };
              }
              p.comerciales[cid].venta += parseFloat(ticket.totalAmount || 0);
              if (!isExternalTripleta) {
                p.comerciales[cid].premio += parseFloat(ticket.totalPrize || 0);
              }
            }
          }
        }

        // Attribute tripleta prizes whose prizeDrawId falls into this game's draws.
        // These prizes are always SRQ (external tripletas) — route them to the SRQ bucket.
        const tripletaPrizesForGame = tripletaWinners.filter(w => drawIds.has(w.prizeDrawId));
        if (tripletaPrizesForGame.length > 0) {
          if (!providerMap['__srq__']) {
            providerMap['__srq__'] = {
              apiSystemId:  null,
              providerName: 'SRQ',
              source:       'EXTERNAL_API',
              venta:        0,
              premio:       0,
              isSRQ:        true,
              comerciales:  {},
            };
          }
          const srq = providerMap['__srq__'];
          for (const w of tripletaPrizesForGame) {
            const prize = parseFloat(w.totalPrize || 0);
            srq.premio += prize;

            const rawCid = w.providerData?.comercialID;
            const cid = rawCid == null ? null : parseInt(rawCid, 10);
            if (cid != null && !Number.isNaN(cid)) {
              if (!srq.comerciales[cid]) {
                srq.comerciales[cid] = {
                  comercialId:   cid,
                  comercialName: comercialNames[cid] || `Comercial ${cid}`,
                  venta:         0,
                  premio:        0,
                };
              }
              srq.comerciales[cid].premio += prize;
            }
          }
        }

        // Finalize providers array
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

      return result.sort((a, b) => a.gameName.localeCompare(b.gameName));
    } catch (error) {
      logger.error('Error in getConciliacion:', error);
      throw error;
    }
  }
}

export default new ConciliacionService();
