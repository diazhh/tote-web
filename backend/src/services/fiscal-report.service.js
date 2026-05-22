/**
 * Reporte para el rol FISCALIZADOR.
 *
 * Filas por (fecha, juego) con ventas, premios y utilidad. Reusa el patrón
 * legacy de accounting-report.service.js pero recorta el universo al scope
 * del fiscalizador (gameIds, apiSystemIds, includeTaquilla).
 *
 * - Excluye tickets CANCELLED.
 * - Premios de tripletas externas se atribuyen por `prizeDrawId` (mismo
 *   patrón que accounting-report).
 * - Sin desglose por proveedor en pantalla. El fiscalizador NO ve nombres
 *   de proveedores en el output, solo las cifras agregadas por (fecha, juego).
 */
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

const MAX_RANGE_DAYS = 366;

function validateInputs({ dateFrom, dateTo }) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(dateFrom || '') || !re.test(dateTo || '')) {
    const err = new Error('dateFrom y dateTo deben tener formato YYYY-MM-DD');
    err.statusCode = 400;
    throw err;
  }
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T00:00:00.000Z`);
  if (to < from) {
    const err = new Error('dateTo debe ser >= dateFrom');
    err.statusCode = 400;
    throw err;
  }
  const days = Math.round((to - from) / 86400000) + 1;
  if (days > MAX_RANGE_DAYS) {
    const err = new Error(`Rango máximo de ${MAX_RANGE_DAYS} días`);
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Intersecta el filtro pedido con el scope permitido (auto-recorte).
 * @returns {{gameIds: string[]|null, apiSystemIds: string[]|null, includeTaquilla: boolean}}
 */
function intersectScope(scope, requested) {
  // Juegos: si pidió juegos, recortar al permitido; si no, usar el permitido.
  let gameIds;
  if (requested.gameIds && requested.gameIds.length > 0) {
    gameIds = scope.gameIds
      ? requested.gameIds.filter((id) => scope.gameIds.includes(id))
      : requested.gameIds;
  } else {
    gameIds = scope.gameIds;
  }

  // Proveedores: misma lógica.
  let apiSystemIds;
  if (requested.apiSystemIds && requested.apiSystemIds.length > 0) {
    apiSystemIds = scope.apiSystemIds
      ? requested.apiSystemIds.filter((id) => scope.apiSystemIds.includes(id))
      : requested.apiSystemIds;
  } else {
    apiSystemIds = scope.apiSystemIds;
  }

  // includeTaquilla: si el scope no lo permite, el cliente no puede activarlo;
  // si el cliente lo desactiva, respetar.
  const includeTaquilla = scope.includeTaquilla && (requested.includeTaquilla !== false);

  return { gameIds, apiSystemIds, includeTaquilla };
}

/**
 * Construye el filtro `where` para Ticket usando el universo efectivo.
 *
 * Lógica de fuentes:
 *   - includeTaquilla=true  → incluir Ticket.source='TAQUILLA_ONLINE'
 *   - apiSystemIds=null     → incluir todos los proveedores (PUSH/SCRAPE/PULL)
 *   - apiSystemIds=[]       → incluir ninguno (caso intersección vacía)
 *   - apiSystemIds=[...]    → incluir solo esos (apiSystemId match + EXTERNAL_API
 *                              cuyo Draw mapea a esos PULL providers)
 *
 * Para PULL providers (SRQ) los tickets NO tienen apiSystemId — están mapeados
 * vía ApiDrawMapping → drawId. Mismo patrón que accounting-report.
 */
async function buildTicketWhere({ dateFrom, dateTo, gameIds, apiSystemIds, includeTaquilla }) {
  // Caso: intersección vacía explícita → no devolver nada.
  if ((gameIds && gameIds.length === 0) ||
      (apiSystemIds && apiSystemIds.length === 0 && !includeTaquilla)) {
    return null; // sentinel: empty result
  }

  const drawWhere = {
    drawDate: {
      gte: new Date(`${dateFrom}T00:00:00.000Z`),
      lte: new Date(`${dateTo}T00:00:00.000Z`),
    },
  };
  if (gameIds && gameIds.length > 0) drawWhere.gameId = { in: gameIds };

  // Resolver tipo de cada apiSystem (PUSH/SCRAPE vs PULL) para saber dónde filtrar.
  let pushScrapeIds = [];
  let pullDrawIds = [];
  if (apiSystemIds && apiSystemIds.length > 0) {
    const systems = await prisma.apiSystem.findMany({
      where: { id: { in: apiSystemIds } },
      select: { id: true, mode: true },
    });
    pushScrapeIds = systems
      .filter((s) => s.mode === 'PUSH' || s.mode === 'SCRAPE')
      .map((s) => s.id);
    const pullIds = systems.filter((s) => s.mode === 'PULL').map((s) => s.id);

    if (pullIds.length > 0) {
      const mappings = await prisma.apiDrawMapping.findMany({
        where: { apiSystemId: { in: pullIds } },
        select: { drawId: true },
      });
      pullDrawIds = [...new Set(mappings.map((m) => m.drawId))];
    }
  }

  // Construir el OR de fuentes según los buckets activos.
  const orSourceClauses = [];
  if (includeTaquilla) {
    orSourceClauses.push({ source: 'TAQUILLA_ONLINE' });
  }
  if (!apiSystemIds) {
    // Sin restricción de proveedores → incluir todas las fuentes externas
    orSourceClauses.push({ source: { in: ['EXTERNAL_API', 'WEBHOOK_PUSH', 'EXTERNAL_SCRAPE'] } });
  } else {
    if (pushScrapeIds.length > 0) {
      orSourceClauses.push({ apiSystemId: { in: pushScrapeIds } });
    }
    if (pullDrawIds.length > 0) {
      orSourceClauses.push({ source: 'EXTERNAL_API', drawId: { in: pullDrawIds } });
    }
  }

  if (orSourceClauses.length === 0) return null;

  return {
    status: { not: 'CANCELLED' },
    draw: drawWhere,
    OR: orSourceClauses,
  };
}

class FiscalReportService {
  /**
   * @param {object} params
   * @param {string} params.dateFrom YYYY-MM-DD
   * @param {string} params.dateTo   YYYY-MM-DD
   * @param {string[]} [params.gameIds]     - filtros adicionales del cliente
   * @param {string[]} [params.apiSystemIds]
   * @param {boolean}  [params.includeTaquilla]
   * @param {object} params.scope - de fiscal-scope.middleware
   */
  async getReport({ dateFrom, dateTo, gameIds = null, apiSystemIds = null, includeTaquilla = true, scope }) {
    validateInputs({ dateFrom, dateTo });
    if (!scope) {
      const err = new Error('scope requerido');
      err.statusCode = 500;
      throw err;
    }

    const effective = intersectScope(scope, {
      gameIds,
      apiSystemIds,
      includeTaquilla,
    });

    const ticketWhere = await buildTicketWhere({ dateFrom, dateTo, ...effective });
    if (!ticketWhere) {
      return {
        dateFrom,
        dateTo,
        effectiveScope: effective,
        rows: [],
        totals: { totalSales: 0, totalPrize: 0, utility: 0, ticketCount: 0 },
      };
    }

    // Obtener tickets con su draw + game.
    const tickets = await prisma.ticket.findMany({
      where: ticketWhere,
      select: {
        totalAmount: true,
        totalPrize: true,
        source: true,
        providerData: true,
        draw: {
          select: {
            id: true,
            drawDate: true,
            gameId: true,
            game: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Premios de tripletas externas: se imputan al prizeDrawId (sorteo donde
    // se completa), no al draw del ticket. Necesario para que el utility cuadre
    // con accounting-report y con la realidad contable. Solo aplica si el
    // universo incluye EXTERNAL_API.
    const includesSrq = ticketWhere.OR.some(
      (c) =>
        c.source === 'EXTERNAL_API' ||
        (c.source && c.source.in && c.source.in.includes('EXTERNAL_API')),
    );
    let tripletaPrizeByDraw = {};
    if (includesSrq) {
      const drawIds = [...new Set(tickets.map((t) => t.draw.id))];
      if (drawIds.length > 0) {
        const tripletaWinners = await prisma.ticket.findMany({
          where: {
            prizeDrawId: { in: drawIds },
            status: 'WON',
            source: 'EXTERNAL_API',
            providerData: { path: ['type'], equals: 'TRIPLETA' },
          },
          select: { prizeDrawId: true, totalPrize: true, draw: { select: { gameId: true } } },
        });
        for (const t of tripletaWinners) {
          // Aplicar solo si el juego del draw destino está permitido.
          if (effective.gameIds && !effective.gameIds.includes(t.draw.gameId)) continue;
          tripletaPrizeByDraw[t.prizeDrawId] =
            (tripletaPrizeByDraw[t.prizeDrawId] || 0) + parseFloat(t.totalPrize);
        }
      }
    }

    // Agregar por (fecha, juego).
    const byDayGame = new Map();
    const drawHasTripletaApplied = new Set();
    for (const t of tickets) {
      const isTripleta =
        t.source === 'EXTERNAL_API' && t.providerData?.type === 'TRIPLETA';
      const dateKey = t.draw.drawDate.toISOString().split('T')[0];
      const key = `${dateKey}|${t.draw.gameId}`;
      if (!byDayGame.has(key)) {
        byDayGame.set(key, {
          date: dateKey,
          gameId: t.draw.gameId,
          game: t.draw.game.name,
          totalSales: 0,
          totalPrize: 0,
          utility: 0,
          ticketCount: 0,
        });
      }
      const row = byDayGame.get(key);
      row.totalSales += parseFloat(t.totalAmount);
      // El premio del ticket-tripleta se atribuye al prizeDrawId (no aquí);
      // sumamos solo premios de tickets no-tripleta.
      if (!isTripleta) {
        row.totalPrize += parseFloat(t.totalPrize);
      }
      row.ticketCount += 1;

      // Inyectar premios de tripletas al draw del ticket regular (una vez por draw).
      if (!drawHasTripletaApplied.has(t.draw.id) && tripletaPrizeByDraw[t.draw.id]) {
        row.totalPrize += tripletaPrizeByDraw[t.draw.id];
        drawHasTripletaApplied.add(t.draw.id);
      }
    }
    // Si quedaron draws con tripleta sin row (porque ningún ticket regular cayó
    // ahí en el rango), no los agregamos para no inventar filas vacías.

    for (const row of byDayGame.values()) {
      row.utility = row.totalSales - row.totalPrize;
    }

    const rows = Array.from(byDayGame.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.game.localeCompare(b.game);
    });

    const totals = rows.reduce(
      (acc, r) => ({
        totalSales: acc.totalSales + r.totalSales,
        totalPrize: acc.totalPrize + r.totalPrize,
        utility: acc.utility + r.utility,
        ticketCount: acc.ticketCount + r.ticketCount,
      }),
      { totalSales: 0, totalPrize: 0, utility: 0, ticketCount: 0 },
    );

    return {
      dateFrom,
      dateTo,
      effectiveScope: effective,
      rows,
      totals,
    };
  }

  /**
   * Lista los juegos visibles para el fiscalizador (para llenar el filtro UI).
   */
  async getVisibleGames(scope) {
    const where = { isActive: true };
    if (scope.gameIds && scope.gameIds.length > 0) where.id = { in: scope.gameIds };
    const games = await prisma.game.findMany({
      where,
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
    return games;
  }

  /**
   * Lista los proveedores visibles para el fiscalizador.
   */
  async getVisibleApiSystems(scope) {
    const where = { isActive: true };
    if (scope.apiSystemIds && scope.apiSystemIds.length > 0) where.id = { in: scope.apiSystemIds };
    const systems = await prisma.apiSystem.findMany({
      where,
      select: { id: true, name: true, slug: true, mode: true },
      orderBy: { name: 'asc' },
    });
    return systems;
  }
}

export default new FiscalReportService();
