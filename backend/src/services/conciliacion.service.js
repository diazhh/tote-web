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
      // Production has legacy 'PUBLISHED' status alongside 'DRAWN' — use raw SQL
      // with ::text cast to bypass Prisma's DrawStatus enum validator (local schema
      // dropped PUBLISHED).
      const fromDate = dateFrom ? new Date(dateFrom + 'T00:00:00.000Z') : null;
      const toDate   = dateTo   ? new Date(dateTo   + 'T00:00:00.000Z') : null;

      if (!fromDate || !toDate) {
        throw new Error('dateFrom and dateTo are required');
      }

      const drawsRaw = await prisma.$queryRaw`
        SELECT d.id, d."gameId", g.id AS "game_id", g.name AS "game_name"
        FROM "Draw" d
        JOIN "Game" g ON g.id = d."gameId"
        WHERE d.status::text IN ('DRAWN', 'PUBLISHED')
          AND d."drawDate" >= ${fromDate}
          AND d."drawDate" <= ${toDate}
      `;

      // Apply gameIds filter in JS (avoids dynamic-IN complexity in raw SQL)
      const draws = gameIds.length > 0
        ? drawsRaw.filter(r => gameIds.includes(r.gameId))
        : drawsRaw;

      if (draws.length === 0) return [];

      // Group draws by game
      const drawsByGame = {};
      for (const d of draws) {
        if (!drawsByGame[d.gameId]) {
          drawsByGame[d.gameId] = {
            game: { id: d.game_id, name: d.game_name },
            drawIds: [],
          };
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
        const drawIdSet = new Set(drawIds);
        const gameTickets = tickets.filter(t => drawIdSet.has(t.drawId));

        // Group by provider key
        const providerMap = {};

        for (const ticket of gameTickets) {
          const isOnline = ticket.source === 'TAQUILLA_ONLINE';
          const key      = isOnline ? '__online__' : (ticket.apiSystemId || '__unknown__');
          const isSRQ    = ticket.apiSystem?.slug === 'srq';

          if (!providerMap[key]) {
            providerMap[key] = {
              apiSystemId:  ticket.apiSystemId || null,
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

      return result.sort((a, b) => a.gameName.localeCompare(b.gameName));
    } catch (error) {
      logger.error('Error in getConciliacion:', error);
      throw error;
    }
  }
}

export default new ConciliacionService();
