/**
 * Servicio para el Monitor de Sorteos
 * Proporciona estadísticas por bancas, números y reportes diarios
 */

import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { startOfDayDate, endOfDayDate, getVenezuelaDateAsUTC } from '../lib/dateUtils.js';
import { cacheOrCompute } from '../lib/redis.js';

/**
 * Shared apiSystem PULL-vs-PUSH/SCRAPE resolution helper (Plan 14-02 Task 1, O4).
 *
 * Centralizes the legacy resolution block (was inline at lines 463-485 of getDailyReport
 * and 60-88 of accounting-report.service.js) so both the legacy and materialized branches —
 * and both services — share an identical implementation.
 *
 * @param {string|null} apiSystemId
 * @returns {Promise<{
 *   pushProviderFilter: boolean,
 *   drawIdsForPull: string[]|null
 * }>}
 *   - pushProviderFilter=true → caller filters tickets by apiSystemId (PUSH/SCRAPE direct attribution)
 *   - drawIdsForPull non-null  → caller narrows draws by `where.id = { in: drawIdsForPull }` (PULL via ApiDrawMapping)
 *   - both false/null when apiSystemId is null (no filter)
 */
export async function resolveApiSystemFilter(apiSystemId) {
  if (!apiSystemId) return { pushProviderFilter: false, drawIdsForPull: null };
  const apiSystem = await prisma.apiSystem.findUnique({
    where: { id: apiSystemId },
    select: { mode: true },
  });
  if (apiSystem?.mode === 'PUSH' || apiSystem?.mode === 'SCRAPE') {
    return { pushProviderFilter: true, drawIdsForPull: null };
  }
  const mappings = await prisma.apiDrawMapping.findMany({
    where: { apiConfig: { apiSystemId } },
    select: { drawId: true },
  });
  return { pushProviderFilter: false, drawIdsForPull: mappings.map((m) => m.drawId) };
}

class MonitorService {
  /**
   * Obtener estadísticas por banca para un sorteo.
   * Cacheado 60s en Redis para soportar el auto-refresh de /admin/monitor (90s).
   * @param {string} drawId - ID del sorteo
   */
  async getBancaStats(drawId) {
    return cacheOrCompute(
      `tote:v1:banca:stats:${drawId}`,
      60,
      () => this._getBancaStatsUncached(drawId),
    );
  }

  async _getBancaStatsUncached(drawId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          winnerItem: true,
          tickets: {
            where: { source: 'EXTERNAL_API', status: { not: 'CANCELLED' } },
            include: {
              details: {
                include: {
                  gameItem: true
                }
              }
            }
          }
        }
      });

      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      // Agrupar tickets por banca
      const bancaMap = new Map();

      for (const ticket of draw.tickets) {
        const bancaId = ticket.providerData?.bancaID;
        if (!bancaId) continue;

        if (!bancaMap.has(bancaId)) {
          bancaMap.set(bancaId, {
            externalId: bancaId,
            name: null,
            totalAmount: 0,
            totalPrize: 0,
            ticketCount: 0,
            entityId: ticket.providerData?.entityIds?.bancaId || null
          });
        }

        const banca = bancaMap.get(bancaId);
        banca.totalAmount += parseFloat(ticket.totalAmount);
        banca.ticketCount += 1;

        // Calcular premio si el item ganó
        if (draw.winnerItemId) {
          for (const detail of ticket.details) {
            if (detail.gameItemId === draw.winnerItemId) {
              const prize = parseFloat(detail.amount) * parseFloat(detail.gameItem.multiplier);
              banca.totalPrize += prize;
            }
          }
        }
      }

      // Obtener nombres de bancas si existen en nuestro sistema
      const bancaIds = Array.from(bancaMap.values())
        .filter(b => b.entityId)
        .map(b => b.entityId);

      if (bancaIds.length > 0) {
        const bancas = await prisma.providerBanca.findMany({
          where: { id: { in: bancaIds } }
        });

        for (const banca of bancas) {
          const entry = Array.from(bancaMap.values()).find(b => b.entityId === banca.id);
          if (entry) {
            entry.name = banca.name;
          }
        }
      }

      return {
        drawId,
        game: draw.game.name,
        drawDate: draw.drawDate,
        drawTime: draw.drawTime,
        winnerItem: draw.winnerItem ? {
          number: draw.winnerItem.number,
          name: draw.winnerItem.name
        } : null,
        bancas: Array.from(bancaMap.values()).sort((a, b) => b.totalAmount - a.totalAmount)
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas por banca:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas por número/item para un sorteo
   * Incluye información de tripletas asociadas
   * @param {string} drawId - ID del sorteo
   */
  async getItemStats(drawId) {
    return cacheOrCompute(
      `tote:v1:items:stats:full:${drawId}`,
      60,
      () => this._getItemStatsUncached(drawId),
    );
  }

  async _getItemStatsUncached(drawId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          winnerItem: true,
          tickets: {
            where: { status: { not: 'CANCELLED' } },
            include: {
              details: {
                include: {
                  gameItem: true
                }
              }
            }
          }
        }
      });

      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      // Obtener todos los items del juego
      const gameItems = await prisma.gameItem.findMany({
        where: { gameId: draw.gameId, isActive: true },
        orderBy: { number: 'asc' }
      });

      // Agrupar por item
      const itemMap = new Map();

      for (const item of gameItems) {
        itemMap.set(item.id, {
          itemId: item.id,
          number: item.number,
          name: item.name,
          multiplier: parseFloat(item.multiplier),
          totalAmount: 0,
          ticketCount: 0,
          potentialPrize: 0,
          percentageOfSales: 0,
          tripletaCount: 0,
          tripletaPrize: 0,
          totalPotentialPrize: 0
        });
      }

      // Calcular ventas totales
      let totalSales = 0;
      for (const ticket of draw.tickets) {
        for (const detail of ticket.details) {
          const item = itemMap.get(detail.gameItemId);
          if (item) {
            const amount = parseFloat(detail.amount);
            item.totalAmount += amount;
            item.ticketCount += 1;
            totalSales += amount;
          }
        }
      }

      // Calcular premios potenciales y porcentajes
      for (const item of itemMap.values()) {
        item.potentialPrize = item.totalAmount * item.multiplier;
        item.percentageOfSales = totalSales > 0 
          ? ((item.potentialPrize / totalSales) * 100).toFixed(2)
          : 0;
      }

      // Obtener tripletas activas que incluyen items de este sorteo
      // Construir fecha/hora completa del sorteo para comparar con expiresAt
      const drawDateTime = new Date(draw.drawDate);
      const [hours, minutes] = draw.drawTime.split(':');
      drawDateTime.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // Obtener sorteos anteriores ejecutados (para verificar números ganados)
      // Esta consulta se hace una sola vez para todas las tripletas
      const previousDraws = await prisma.draw.findMany({
        where: {
          gameId: draw.gameId,
          OR: [
            { drawDate: { lt: draw.drawDate } },
            { drawDate: draw.drawDate, drawTime: { lt: draw.drawTime } }
          ],
          status: 'DRAWN',
          winnerItemId: { not: null }
        },
        orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }],
        take: 11,
        select: { winnerItemId: true }
      });
      
      const previousWinnerIds = previousDraws.map(d => d.winnerItemId);

      // 1. Tripletas locales (TripleBet)
      const activeTripletas = await prisma.tripleBet.findMany({
        where: {
          gameId: draw.gameId,
          status: 'ACTIVE',
          expiresAt: { gte: drawDateTime }
        }
      });

      // Contar tripletas locales por item
      // Solo contar tripletas que ganarían en ESTE sorteo específico (les falta solo 1 número)
      for (const tripleta of activeTripletas) {
        const itemIds = [tripleta.item1Id, tripleta.item2Id, tripleta.item3Id];
        const tripletaPrize = parseFloat(tripleta.amount) * parseFloat(tripleta.multiplier);

        const numbersAlreadyWon = itemIds.filter(id => previousWinnerIds.includes(id)).length;
        
        // Solo contar si le falta exactamente 1 número (2 ya ganaron)
        if (numbersAlreadyWon === 2) {
          // Encontrar qué número falta
          const missingItemId = itemIds.find(id => !previousWinnerIds.includes(id));
          
          const item = itemMap.get(missingItemId);
          if (item) {
            item.tripletaCount += 1;
            item.tripletaPrize += tripletaPrize;
          }
        }
      }

      // 2. Tripletas externas de SRQ (Ticket con source EXTERNAL_API y type TRIPLETA)
      // Las tripletas de SRQ son válidas para 11 sorteos consecutivos desde el primer sorteo después de jugarse
      // Necesitamos buscar tripletas de sorteos anteriores que aún estén dentro de su ventana de validez
      
      // Obtener los 11 sorteos anteriores (incluyendo el actual) para determinar qué tripletas están activas
      const previousDrawsForSearch = await prisma.draw.findMany({
        where: {
          gameId: draw.gameId,
          OR: [
            { drawDate: { lt: draw.drawDate } },
            { drawDate: draw.drawDate, drawTime: { lte: draw.drawTime } }
          ]
        },
        orderBy: [
          { drawDate: 'desc' },
          { drawTime: 'desc' }
        ],
        take: 11,
        select: { id: true, drawDate: true, drawTime: true }
      });

      const drawIdsToSearch = previousDrawsForSearch.map(d => d.id);

      // Buscar tripletas asociadas a cualquiera de estos sorteos
      // Filtrar solo ACTIVE porque las WON/LOST ya no participan
      const externalTripletaTickets = await prisma.ticket.findMany({
        where: {
          source: 'EXTERNAL_API',
          status: 'ACTIVE',
          providerData: {
            path: ['type'],
            equals: 'TRIPLETA'
          },
          drawId: { in: drawIdsToSearch }
        },
        include: {
          details: {
            include: {
              gameItem: true
            }
          },
          draw: {
            select: {
              drawDate: true,
              drawTime: true
            }
          }
        }
      });

      // Contar tripletas externas por item
      // Solo contar tripletas que ganarían en ESTE sorteo específico (les falta solo 1 número)
      for (const ticket of externalTripletaTickets) {
        // Cada ticket de tripleta tiene 3 detalles (los 3 números)
        const tripletaPrize = parseFloat(ticket.totalAmount) * parseFloat(ticket.details[0]?.multiplier || 50); // multiplier default 50x
        
        // Obtener los 3 números de la tripleta
        const tripletaItemIds = ticket.details.map(d => d.gameItemId);
        
        const numbersAlreadyWon = tripletaItemIds.filter(id => previousWinnerIds.includes(id)).length;
        
        // Solo contar si le falta exactamente 1 número (2 ya ganaron)
        // Esto significa que si este sorteo gana uno de los números faltantes, la tripleta se completa
        if (numbersAlreadyWon === 2) {
          // Encontrar qué número falta
          const missingItemId = tripletaItemIds.find(id => !previousWinnerIds.includes(id));
          
          const item = itemMap.get(missingItemId);
          if (item) {
            item.tripletaCount += 1;
            item.tripletaPrize += tripletaPrize;
          }
        }
      }

      // Calcular premio total potencial
      for (const item of itemMap.values()) {
        item.totalPotentialPrize = item.potentialPrize + item.tripletaPrize;
      }

      return {
        drawId,
        game: draw.game.name,
        drawDate: draw.drawDate,
        drawTime: draw.drawTime,
        totalSales,
        winnerItem: draw.winnerItem ? {
          number: draw.winnerItem.number,
          name: draw.winnerItem.name
        } : null,
        items: Array.from(itemMap.values())
          .filter(i => i.totalAmount > 0 || i.tripletaCount > 0)
          .sort((a, b) => b.totalAmount - a.totalAmount)
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas por item:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas por número/item para un sorteo, filtrado por fuente/proveedor.
   * Versión simplificada de getItemStats (sin tripletas) para reportes de proveedores.
   *
   * @param {string} drawId
   * @param {Object} filters
   * @param {string} [filters.source]      - TAQUILLA_ONLINE | EXTERNAL_API | WEBHOOK_PUSH
   * @param {string} [filters.apiSystemId] - UUID del ApiSystem
   */
  async getItemStatsFiltered(drawId, filters = {}) {
    const normalized = {
      source: filters.source || null,
      apiSystemId: filters.apiSystemId || null,
    };
    const hash = crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
    const key = `tote:v1:items:stats:${drawId}:${hash}`;
    // TTL 60s — coordina con auto-refresh del frontend (90s). Mantiene cache
    // caliente durante refrescos consecutivos del admin.
    return cacheOrCompute(key, 60, () => this._getItemStatsFilteredUncached(drawId, filters));
  }

  async _getItemStatsFilteredUncached(drawId, { source = null, apiSystemId = null } = {}) {
    try {
      const ticketWhere = { status: { not: 'CANCELLED' } };
      if (apiSystemId) {
        const sys = await prisma.apiSystem.findUnique({ where: { id: apiSystemId }, select: { mode: true } });
        if (sys?.mode === 'PUSH' || sys?.mode === 'SCRAPE') ticketWhere.apiSystemId = apiSystemId;
        else ticketWhere.source = 'EXTERNAL_API';
      } else if (source) {
        ticketWhere.source = source;
      }

      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          winnerItem: true,
          tickets: {
            where: ticketWhere,
            include: {
              details: { include: { gameItem: true } }
            }
          }
        }
      });

      if (!draw) throw new Error('Sorteo no encontrado');

      const gameItems = await prisma.gameItem.findMany({
        where: { gameId: draw.gameId, isActive: true },
        orderBy: { number: 'asc' }
      });

      const itemMap = new Map();
      for (const item of gameItems) {
        itemMap.set(item.id, {
          itemId: item.id,
          number: item.number,
          name: item.name,
          multiplier: parseFloat(item.multiplier),
          totalAmount: 0,
          ticketCount: 0,
          potentialPrize: 0,
          percentageOfSales: 0,
        });
      }

      let totalSales = 0;
      for (const ticket of draw.tickets) {
        for (const detail of ticket.details) {
          const item = itemMap.get(detail.gameItemId);
          if (item) {
            const amount = parseFloat(detail.amount);
            item.totalAmount += amount;
            item.ticketCount += 1;
            totalSales += amount;
          }
        }
      }

      for (const item of itemMap.values()) {
        item.potentialPrize = item.totalAmount * item.multiplier;
        item.percentageOfSales = totalSales > 0
          ? ((item.potentialPrize / totalSales) * 100).toFixed(2)
          : 0;
      }

      return {
        drawId,
        game: draw.game.name,
        drawDate: draw.drawDate,
        drawTime: draw.drawTime,
        totalSales,
        ticketCount: draw.tickets.length,
        winnerItem: draw.winnerItem ? { number: draw.winnerItem.number, name: draw.winnerItem.name } : null,
        items: Array.from(itemMap.values())
          .filter(i => i.totalAmount > 0)
          .sort((a, b) => b.totalAmount - a.totalAmount)
      };
    } catch (error) {
      logger.error('Error obteniendo item stats filtrados:', error);
      throw error;
    }
  }

  /**
   * Obtener reporte de sorteos por rango de fechas con filtros opcionales.
   * Soporta modo legacy (date param) y modo rango (dateFrom/dateTo).
   *
   * @param {Object} params
   * @param {string} [params.date]        - YYYY-MM-DD (legacy, single day)
   * @param {string} [params.dateFrom]    - YYYY-MM-DD start of range (BACK-01)
   * @param {string} [params.dateTo]      - YYYY-MM-DD end of range (BACK-01)
   * @param {string} [params.gameId]      - filter by game UUID
   * @param {string} [params.source]      - TAQUILLA_ONLINE | EXTERNAL_API | WEBHOOK_PUSH (BACK-02)
   * @param {string} [params.apiSystemId] - filter draws by ApiSystem UUID (BACK-02)
   */
  /**
   * Cached entry point. v1.4 wraps the historical query in Redis.
   * - Key: sha1(normalized filters) under prefix `tote:v1:report:daily:`.
   * - TTL: 60s if dateTo touches today (data still mutates),
   *        3600s for purely historical ranges (immutable post-DRAWN).
   * Cache misses fall through to `_getDailyReportUncached` (unchanged body).
   */
  async getDailyReport(filters = {}) {
    const normalized = {
      date: filters.date ? new Date(filters.date).toISOString().slice(0, 10) : null,
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom).toISOString().slice(0, 10) : null,
      dateTo: filters.dateTo ? new Date(filters.dateTo).toISOString().slice(0, 10) : null,
      gameId: filters.gameId || null,
      source: filters.source || null,
      apiSystemId: filters.apiSystemId || null,
      useMaterialized: filters.useMaterialized !== false,
    };

    const hash = crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
    const key = `tote:v1:report:daily:${hash}`;

    const todayStr = new Date().toISOString().slice(0, 10);
    const touchesToday =
      normalized.date === todayStr ||
      (normalized.dateTo && normalized.dateTo >= todayStr);
    const ttl = touchesToday ? 60 : 3600;

    return cacheOrCompute(
      key,
      ttl,
      () => this._getDailyReportUncached({ ...filters, useMaterialized: normalized.useMaterialized }),
      { trackingSet: 'tote:v1:report:daily:*' },
    );
  }

  async _getDailyReportUncached({ date = null, dateFrom = null, dateTo = null, gameId = null, source = null, apiSystemId = null, useMaterialized = true } = {}) {
    if (useMaterialized) {
      return this._getDailyReportMaterialized({ date, dateFrom, dateTo, gameId, source, apiSystemId });
    }
    return this._getDailyReportLegacy({ date, dateFrom, dateTo, gameId, source, apiSystemId });
  }

  /**
   * LEGACY branch — verbatim move of the pre-refactor getDailyReport body.
   *
   * P-A regression net: `legacy-report-snapshot.json` pins this method's response shape.
   * Any byte-level drift in JSON.stringify(result) fails the snapshot test (daily-report-legacy-snapshot.test.js).
   *
   * The ONLY structural change from the pre-refactor body is that the inline
   * apiSystem PULL-vs-PUSH/SCRAPE resolution (was lines 463-485) is replaced with
   * a call to the shared `resolveApiSystemFilter` helper — same downstream effects.
   */
  async _getDailyReportLegacy({ date = null, dateFrom = null, dateTo = null, gameId = null, source = null, apiSystemId = null } = {}) {
    try {
      const where = {};

      // Date range vs. legacy single-date
      if (dateFrom && dateTo) {
        where.drawDate = {
          gte: new Date(dateFrom + 'T00:00:00.000Z'),
          lte: new Date(dateTo   + 'T00:00:00.000Z')
        };
      } else if (date) {
        const dateStr = typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];
        where.drawDate = new Date(dateStr + 'T00:00:00.000Z');
      }

      if (gameId) {
        where.gameId = gameId;
      }

      // apiSystemId: resolve differently for PULL vs PUSH/SCRAPE providers (via shared helper).
      let pushProviderFilter = false;
      if (apiSystemId) {
        const resolved = await resolveApiSystemFilter(apiSystemId);
        if (resolved.pushProviderFilter) {
          // PUSH and SCRAPE providers set Ticket.apiSystemId directly — filter by that
          pushProviderFilter = true;
        } else {
          // PULL providers: resolve to draw IDs via ApiDrawMapping (BACK-02)
          if (resolved.drawIdsForPull.length === 0) {
            return {
              dateFrom, dateTo, gameId: gameId || null,
              source: source || null, apiSystemId,
              draws: [], totals: { totalSales: 0, totalPrize: 0, totalBalance: 0, totalTickets: 0, drawCount: 0 },
              byGame: [], bySource: []
            };
          }
          where.id = { in: resolved.drawIdsForPull };
        }
      }

      // Build tickets include — apply source filter if provided (BACK-02)
      const ticketsInclude = {
        where: { status: { not: 'CANCELLED' } }
      };
      if (pushProviderFilter) {
        ticketsInclude.where.apiSystemId = apiSystemId;
      } else if (source) {
        ticketsInclude.where.source = source;
      }

      const draws = await prisma.draw.findMany({
        where,
        include: {
          game: true,
          winnerItem: true,
          tickets: ticketsInclude
        },
        orderBy: [
          { drawDate: 'asc' },
          { drawTime: 'asc' }
        ]
      });

      // Premios de tripletas externas agrupados por el sorteo donde ganaron (prizeDrawId).
      // Solo aplica cuando no hay filtro de fuente o el filtro es EXTERNAL_API.
      const tripletaPrizeByDraw = {};
      const includesTripletaPrizes = !source || source === 'EXTERNAL_API';
      if (includesTripletaPrizes && draws.length > 0) {
        const drawIds = draws.map(d => d.id);
        const tripletaWinners = await prisma.ticket.findMany({
          where: { prizeDrawId: { in: drawIds }, status: 'WON' },
          select: { prizeDrawId: true, totalPrize: true }
        });
        for (const t of tripletaWinners) {
          tripletaPrizeByDraw[t.prizeDrawId] =
            (tripletaPrizeByDraw[t.prizeDrawId] || 0) + parseFloat(t.totalPrize);
        }
      }

      const report = [];

      // Aggregation buckets (BACK-03)
      const byGameMap   = {};
      const bySourceMap = {};

      for (const draw of draws) {
        const tickets = draw.tickets || [];
        const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);

        // Premios: sumar ticket.totalPrize de tickets no-tripleta (ya pagados por prize-processor)
        // más premios de tripletas externas que completaron su condición en este sorteo.
        const regularPrize = tickets
          .filter(t => !(t.source === 'EXTERNAL_API' && t.providerData?.type === 'TRIPLETA'))
          .reduce((sum, t) => sum + parseFloat(t.totalPrize), 0);
        const totalPrize = regularPrize + (tripletaPrizeByDraw[draw.id] || 0);

        const balance = totalSales - totalPrize;

        report.push({
          drawId:      draw.id,
          gameId:      draw.gameId,
          game:        draw.game.name,
          drawDate:    draw.drawDate,
          drawTime:    draw.drawTime,
          status:      draw.status,
          winnerItem:  draw.winnerItem ? { number: draw.winnerItem.number, name: draw.winnerItem.name } : null,
          totalSales,
          totalPrize,
          balance,
          ticketCount: tickets.length
        });

        // byGame aggregation (BACK-03)
        if (!byGameMap[draw.gameId]) {
          byGameMap[draw.gameId] = {
            gameId:       draw.gameId,
            game:         draw.game.name,
            totalSales:   0,
            totalPrize:   0,
            totalBalance: 0,
            totalTickets: 0,
            drawCount:    0
          };
        }
        const g = byGameMap[draw.gameId];
        g.totalSales   += totalSales;
        g.totalPrize   += totalPrize;
        g.totalBalance += balance;
        g.totalTickets += tickets.length;
        g.drawCount++;

        // bySource aggregation (BACK-03) — split por (source, apiSystemId)
        // para que distintos webhooks/proveedores muestren filas separadas.
        for (const ticket of tickets) {
          const src = ticket.source;
          const sysId = ticket.apiSystemId || null;
          const key = sysId ? `${src}::${sysId}` : src;
          if (!bySourceMap[key]) {
            bySourceMap[key] = {
              source: src,
              apiSystemId: sysId,
              apiSystemName: null,
              totalSales: 0,
              ticketCount: 0,
            };
          }
          bySourceMap[key].totalSales  += parseFloat(ticket.totalAmount);
          bySourceMap[key].ticketCount += 1;
        }
      }

      // Resolve provider names en bulk
      await this._enrichBySourceWithProviderNames(bySourceMap);

      const totals = {
        totalSales:   report.reduce((sum, r) => sum + r.totalSales,  0),
        totalPrize:   report.reduce((sum, r) => sum + r.totalPrize,  0),
        totalBalance: report.reduce((sum, r) => sum + r.balance,     0),
        totalTickets: report.reduce((sum, r) => sum + r.ticketCount, 0),
        drawCount:    report.length
      };

      return {
        dateFrom: dateFrom || (date ? (typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0]) : null),
        dateTo:   dateTo   || (date ? (typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0]) : null),
        gameId:      gameId      || null,
        source:      source      || null,
        apiSystemId: apiSystemId || null,
        draws:   report,
        totals,
        byGame:   Object.values(byGameMap),
        bySource: Object.values(bySourceMap)
      };
    } catch (error) {
      logger.error('Error obteniendo reporte:', error);
      throw error;
    }
  }

  /**
   * MATERIALIZED branch — reads from DrawFinancial + DrawFinancialProvider (Phase 11).
   *
   * Eliminates the v1.2 multi-draw attribution bug at the source: DrawFinancial.totalSales
   * is aggregated upstream via TicketDetail.drawId (NOT Ticket.drawId), so a single ticket
   * whose details span multiple draws is split correctly across them (FIN-REPORT-02).
   *
   * Response shape is IDENTICAL to _getDailyReportLegacy (FIN-REPORT-03): same top-level keys,
   * same per-draw fields, same totals/byGame/bySource shape.
   *
   * Falls back to the legacy branch when:
   *   - `source` filter is provided: per-ticket source attribution is not preserved in
   *     DrawFinancialProvider (which keys on apiSystemId only). The legacy branch handles it.
   */
  async _getDailyReportMaterialized({ date = null, dateFrom = null, dateTo = null, gameId = null, source = null, apiSystemId = null } = {}) {
    // Source filter: fall back to legacy because materialized aggregates lose per-ticket source.
    if (source) {
      logger.warn(`[monitor.service] _getDailyReportMaterialized: source filter '${source}' not supported by materialized branch — falling back to legacy`);
      return this._getDailyReportLegacy({ date, dateFrom, dateTo, gameId, source, apiSystemId });
    }

    try {
      // Date range vs. legacy single-date — same input handling as legacy.
      let fromDateStr = null;
      let toDateStr   = null;
      if (dateFrom && dateTo) {
        fromDateStr = dateFrom;
        toDateStr   = dateTo;
      } else if (date) {
        const dateStr = typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];
        fromDateStr = dateStr;
        toDateStr   = dateStr;
      } else {
        // No date filter at all — extremely rare; default to nothing
        return {
          dateFrom: null, dateTo: null,
          gameId: gameId || null, source: null, apiSystemId: apiSystemId || null,
          draws: [], totals: { totalSales: 0, totalPrize: 0, totalBalance: 0, totalTickets: 0, drawCount: 0 },
          byGame: [], bySource: []
        };
      }

      // F-X — comparar como ::date para evitar shift por TZ del servidor.
      // `drawDate` es DATE; pasar un Date JS (timestamptz) hace que Postgres
      // case el date a timestamp en TZ del server (e.g. CEST → 22:00 UTC del día anterior),
      // produciendo rangos vacíos cuando dateFrom == dateTo.
      const fromDate = fromDateStr;
      const toDate   = toDateStr;

      // Resolve apiSystem filter via the shared helper (same as legacy).
      const resolved = await resolveApiSystemFilter(apiSystemId);

      if (apiSystemId && !resolved.pushProviderFilter && resolved.drawIdsForPull.length === 0) {
        return {
          dateFrom: fromDateStr, dateTo: toDateStr,
          gameId: gameId || null, source: null, apiSystemId,
          draws: [], totals: { totalSales: 0, totalPrize: 0, totalBalance: 0, totalTickets: 0, drawCount: 0 },
          byGame: [], bySource: []
        };
      }

      // Build dynamic SQL fragments via Prisma.sql (parameterized — no string concat).
      const gameFilter = gameId
        ? Prisma.sql`AND d."gameId" = ${gameId}`
        : Prisma.empty;
      const pullDrawFilter = (apiSystemId && !resolved.pushProviderFilter)
        ? Prisma.sql`AND d.id IN (${Prisma.join(resolved.drawIdsForPull)})`
        : Prisma.empty;

      // Single $queryRaw against Draw LEFT JOIN DrawFinancial — the materialized aggregate.
      // COALESCE wraps every SUM/value so empty-data days (P-C) return 0, not NULL.
      const rows = await prisma.$queryRaw`
        SELECT d.id                                                 AS "drawId",
               d."gameId"                                            AS "gameId",
               g.name                                                AS "game",
               d."drawDate"                                          AS "drawDate",
               d."drawTime"                                          AS "drawTime",
               d.status::text                                        AS "status",
               d."winnerItemId"                                      AS "winnerItemId",
               wi.number                                             AS "winnerNumber",
               wi.name                                               AS "winnerName",
               COALESCE(df."totalSales", 0)::numeric(12,2)           AS "totalSales",
               COALESCE(df."totalPrize", 0)::numeric(12,2)           AS "totalPrize",
               COALESCE(df."commission", 0)::numeric(12,2)           AS "commission",
               COALESCE(df."ticketCount", 0)::int                    AS "ticketCount"
        FROM   "Draw" d
        JOIN   "Game" g          ON g.id = d."gameId"
        LEFT JOIN "GameItem" wi  ON wi.id = d."winnerItemId"
        LEFT JOIN "DrawFinancial" df ON df."drawId" = d.id
        WHERE  d."drawDate" >= ${fromDate}::date
          AND  d."drawDate" <= ${toDate}::date
          ${gameFilter}
          ${pullDrawFilter}
        ORDER  BY d."drawDate" ASC, d."drawTime" ASC
      `;

      // Si hay filtro por apiSystem (cualquier mode — PULL/PUSH/SCRAPE),
      // reemplazar los totales por sorteo con el slice del proveedor desde
      // DrawFinancialProvider + ledger. Sin esto, filtrar por SRQ (PULL)
      // devolvía los totales del sorteo entero (todas las fuentes) en vez
      // de solo la porción de SRQ — fix 2026-05-22.
      let providerOverride = null;
      let providerCommissionByDraw = null;
      if (apiSystemId) {
        const drawIds = rows.map((r) => r.drawId);
        if (drawIds.length > 0) {
          const providerRows = await prisma.drawFinancialProvider.findMany({
            where: { apiSystemId, drawId: { in: drawIds } },
            select: { drawId: true, totalSales: true, totalPrize: true, ticketCount: true },
          });
          providerOverride = new Map(providerRows.map((p) => [p.drawId, p]));
          // Commission specific to this provider — sum ledger filtered.
          const commRows = await prisma.providerCommissionLedger.groupBy({
            by: ['drawId'],
            where: { apiSystemId, drawId: { in: drawIds } },
            _sum: { amount: true },
          });
          providerCommissionByDraw = new Map(
            commRows.map((c) => [c.drawId, parseFloat((c._sum.amount ?? 0).toString())]),
          );
        } else {
          providerOverride = new Map();
          providerCommissionByDraw = new Map();
        }
      }

      // Build the by-source bucket from DrawFinancialProvider rows joined with ApiSystem.
      // apiSystem.mode → source mapping:
      //   PUSH   → WEBHOOK_PUSH
      //   SCRAPE → EXTERNAL_SCRAPE
      //   PULL   → EXTERNAL_API
      //   null apiSystemId → TAQUILLA_ONLINE (D-06 Phase 11 house bucket)
      const drawIds = rows.map((r) => r.drawId);
      const providerAgg = drawIds.length > 0
        ? await prisma.drawFinancialProvider.findMany({
            where: {
              drawId: { in: drawIds },
              // Cualquier mode (incluyendo PULL/SRQ) — antes solo PUSH/SCRAPE.
              ...(apiSystemId ? { apiSystemId } : {}),
            },
            select: {
              drawId: true, apiSystemId: true, totalSales: true, totalPrize: true, ticketCount: true,
              apiSystem: { select: { mode: true } },
            },
          })
        : [];

      // Commission por (drawId, apiSystemId) — sumar del ledger para alimentar bySource.
      const commissionByDrawAndProvider = new Map();
      if (drawIds.length > 0) {
        const commRows = await prisma.providerCommissionLedger.groupBy({
          by: ['drawId', 'apiSystemId'],
          where: { drawId: { in: drawIds } },
          _sum: { amount: true },
        });
        for (const c of commRows) {
          commissionByDrawAndProvider.set(
            `${c.drawId}::${c.apiSystemId}`,
            parseFloat((c._sum.amount ?? 0).toString()),
          );
        }
      }

      const bySourceMap = {};
      for (const row of providerAgg) {
        let src;
        if (row.apiSystemId === null) src = 'TAQUILLA_ONLINE';
        else if (row.apiSystem?.mode === 'PUSH')   src = 'WEBHOOK_PUSH';
        else if (row.apiSystem?.mode === 'SCRAPE') src = 'EXTERNAL_SCRAPE';
        else                                       src = 'EXTERNAL_API';
        const sysId = row.apiSystemId || null;
        const key = sysId ? `${src}::${sysId}` : src;
        if (!bySourceMap[key]) {
          bySourceMap[key] = {
            source: src,
            apiSystemId: sysId,
            apiSystemName: null,
            totalSales: 0,
            totalPrize: 0,
            totalCommission: 0,
            totalNet: 0,
            ticketCount: 0,
          };
        }
        const sales = parseFloat(row.totalSales);
        const prize = parseFloat(row.totalPrize);
        const comm  = commissionByDrawAndProvider.get(`${row.drawId}::${row.apiSystemId}`) ?? 0;
        bySourceMap[key].totalSales      += sales;
        bySourceMap[key].totalPrize      += prize;
        bySourceMap[key].totalCommission += comm;
        bySourceMap[key].totalNet        += sales - prize - comm;
        bySourceMap[key].ticketCount     += row.ticketCount;
      }
      await this._enrichBySourceWithProviderNames(bySourceMap);

      // Compose per-draw response (same shape as legacy).
      const report = [];
      const byGameMap = {};

      for (const row of rows) {
        let totalSales  = parseFloat(row.totalSales);
        let totalPrize  = parseFloat(row.totalPrize);
        let commission  = parseFloat(row.commission);
        let ticketCount = parseInt(row.ticketCount, 10);

        if (providerOverride) {
          const override = providerOverride.get(row.drawId);
          if (override) {
            totalSales  = parseFloat(override.totalSales);
            totalPrize  = parseFloat(override.totalPrize);
            ticketCount = override.ticketCount;
            commission  = providerCommissionByDraw.get(row.drawId) ?? 0;
          } else {
            totalSales  = 0;
            totalPrize  = 0;
            commission  = 0;
            ticketCount = 0;
          }
        }

        const balance = totalSales - totalPrize;
        const net     = balance - commission;

        report.push({
          drawId:      row.drawId,
          gameId:      row.gameId,
          game:        row.game,
          drawDate:    row.drawDate,
          drawTime:    row.drawTime,
          status:      row.status,
          winnerItem:  row.winnerItemId ? { number: row.winnerNumber, name: row.winnerName } : null,
          totalSales,
          totalPrize,
          commission,
          balance,
          net,
          ticketCount,
        });

        if (!byGameMap[row.gameId]) {
          byGameMap[row.gameId] = {
            gameId:          row.gameId,
            game:            row.game,
            totalSales:      0,
            totalPrize:      0,
            totalCommission: 0,
            totalBalance:    0,
            totalNet:        0,
            totalTickets:    0,
            drawCount:       0,
          };
        }
        const g = byGameMap[row.gameId];
        g.totalSales      += totalSales;
        g.totalPrize      += totalPrize;
        g.totalCommission += commission;
        g.totalBalance    += balance;
        g.totalNet        += net;
        g.totalTickets    += ticketCount;
        g.drawCount++;
      }

      const totals = {
        totalSales:      report.reduce((sum, r) => sum + r.totalSales,  0),
        totalPrize:      report.reduce((sum, r) => sum + r.totalPrize,  0),
        totalCommission: report.reduce((sum, r) => sum + r.commission,  0),
        totalBalance:    report.reduce((sum, r) => sum + r.balance,     0),
        totalNet:        report.reduce((sum, r) => sum + r.net,         0),
        totalTickets:    report.reduce((sum, r) => sum + r.ticketCount, 0),
        drawCount:       report.length,
      };

      return {
        dateFrom: fromDateStr,
        dateTo:   toDateStr,
        gameId:      gameId      || null,
        source:      null,
        apiSystemId: apiSystemId || null,
        draws:   report,
        totals,
        byGame:   Object.values(byGameMap),
        bySource: Object.values(bySourceMap),
      };
    } catch (error) {
      logger.error('Error obteniendo reporte (materialized):', error);
      throw error;
    }
  }

  /**
   * Obtener tickets de una banca específica en un sorteo
   * @param {string} drawId - ID del sorteo
   * @param {number} bancaExternalId - ID externo de la banca
   */
  async getTicketsByBanca(drawId, bancaExternalId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          tickets: {
            where: {
              source: 'EXTERNAL_API',
              status: { not: 'CANCELLED' },
              providerData: {
                path: ['bancaID'],
                equals: parseInt(bancaExternalId)
              }
            },
            include: {
              details: {
                include: {
                  gameItem: true
                }
              }
            }
          }
        }
      });

      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      const tickets = draw.tickets.map(t => ({
        id: t.id,
        externalTicketId: t.externalTicketId,
        comercialId: t.providerData?.comercialID,
        bancaId: t.providerData?.bancaID,
        grupoId: t.providerData?.grupoID,
        taquillaId: t.providerData?.taquillaID,
        totalAmount: parseFloat(t.totalAmount),
        details: t.details.map(d => ({
          number: d.gameItem.number,
          name: d.gameItem.name,
          amount: parseFloat(d.amount)
        })),
        createdAt: t.createdAt
      }));

      return {
        drawId,
        bancaExternalId,
        ticketCount: tickets.length,
        totalAmount: tickets.reduce((sum, t) => sum + t.amount, 0),
        tickets
      };
    } catch (error) {
      logger.error('Error obteniendo tickets por banca:', error);
      throw error;
    }
  }

  /**
   * Obtener tickets de un item específico en un sorteo
   * @param {string} drawId - ID del sorteo
   * @param {string} itemId - ID del item
   */
  async getTicketsByItem(drawId, itemId) {
    try {
      // Two queries: one filtered by item (to find which tickets), one with all details
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          tickets: {
            where: { status: { not: 'CANCELLED' } },
            include: {
              details: {
                include: {
                  gameItem: true
                }
              }
            }
          }
        }
      });

      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      // Filter tickets that have at least one detail matching the requested item
      const ticketsWithItem = draw.tickets.filter(t =>
        t.details.some(d => d.gameItemId === itemId)
      );

      const tickets = ticketsWithItem.map(t => {
        // Monto jugado específicamente a este item dentro del ticket.
        // Un ticket puede tener varios details apuntando al mismo gameItemId
        // (ej. ticket multi-jugada) — los sumamos todos.
        const itemDetails = t.details.filter(d => d.gameItemId === itemId);
        const itemAmount = itemDetails.reduce((s, d) => s + parseFloat(d.amount), 0);
        return {
          id: t.id,
          externalTicketId: t.externalTicketId,
          source: t.source,
          comercialId: t.providerData?.comercialID,
          bancaId: t.providerData?.bancaID,
          grupoId: t.providerData?.grupoID,
          taquillaId: t.providerData?.taquillaID,
          totalAmount: parseFloat(t.totalAmount), // total del ticket completo
          itemAmount,                              // monto jugado al item seleccionado
          details: t.details.map(d => ({
            amount: parseFloat(d.amount),
            number: d.gameItem.number,
            name: d.gameItem.name,
            status: d.status
          })),
          createdAt: t.createdAt
        };
      });

      const gameItem = await prisma.gameItem.findUnique({
        where: { id: itemId }
      });

      return {
        drawId,
        item: gameItem ? {
          id: gameItem.id,
          number: gameItem.number,
          name: gameItem.name,
          multiplier: parseFloat(gameItem.multiplier)
        } : null,
        ticketCount: tickets.length,
        // Suma del itemAmount — total vendido específicamente al item.
        totalAmount: tickets.reduce((sum, t) => sum + t.itemAmount, 0),
        tickets
      };
    } catch (error) {
      logger.error('Error obteniendo tickets por item:', error);
      throw error;
    }
  }

  /**
   * Obtener tripletas que incluyen un item específico
   * @param {string} drawId - ID del sorteo (para contexto de fecha)
   * @param {string} itemId - ID del item
   */
  async getTripletasByItem(drawId, itemId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: { game: true }
      });

      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      // Buscar tripletas activas que incluyan este item
      // Construir fecha/hora completa del sorteo
      const drawDateTime = new Date(draw.drawDate);
      const [hours, minutes] = draw.drawTime.split(':');
      drawDateTime.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // 1. Tripletas locales (TripleBet)
      const tripletas = await prisma.tripleBet.findMany({
        where: {
          gameId: draw.gameId,
          status: 'ACTIVE',
          expiresAt: { gte: drawDateTime },
          OR: [
            { item1Id: itemId },
            { item2Id: itemId },
            { item3Id: itemId }
          ]
        },
        include: {
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });

      // 2. Tripletas externas de SRQ (Ticket)
      // Las tripletas de SRQ son válidas para 11 sorteos consecutivos
      // Buscar en los últimos 11 sorteos
      const previousDrawsForItem = await prisma.draw.findMany({
        where: {
          gameId: draw.gameId,
          OR: [
            { drawDate: { lt: draw.drawDate } },
            { drawDate: draw.drawDate, drawTime: { lte: draw.drawTime } }
          ]
        },
        orderBy: [
          { drawDate: 'desc' },
          { drawTime: 'desc' }
        ],
        take: 11,
        select: { id: true }
      });

      const drawIdsForItem = previousDrawsForItem.map(d => d.id);

      const externalTripletas = await prisma.ticket.findMany({
        where: {
          source: 'EXTERNAL_API',
          status: 'ACTIVE',
          providerData: {
            path: ['type'],
            equals: 'TRIPLETA'
          },
          drawId: { in: drawIdsForItem },
          details: {
            some: {
              gameItemId: itemId
            }
          }
        },
        include: {
          details: {
            include: {
              gameItem: true
            }
          }
        }
      });

      // Obtener los items de cada tripleta local
      const itemIds = new Set();
      for (const t of tripletas) {
        itemIds.add(t.item1Id);
        itemIds.add(t.item2Id);
        itemIds.add(t.item3Id);
      }

      // Agregar items de tripletas externas
      for (const ticket of externalTripletas) {
        for (const detail of ticket.details) {
          itemIds.add(detail.gameItemId);
        }
      }

      const items = await prisma.gameItem.findMany({
        where: { id: { in: Array.from(itemIds) } }
      });

      const itemMap = new Map(items.map(i => [i.id, i]));

      // Verificar cuántos números ya salieron para cada tripleta LOCAL
      const tripletasWithDetails = await Promise.all(tripletas.map(async (t) => {
        // Obtener sorteos ejecutados en el rango de la tripleta
        const startDraw = await prisma.draw.findUnique({
          where: { id: t.startDrawId }
        });

        // Construir fecha/hora del sorteo inicial
        const startDateTime = new Date(startDraw.drawDate);
        const [startHours, startMinutes] = startDraw.drawTime.split(':');
        startDateTime.setUTCHours(parseInt(startHours), parseInt(startMinutes), 0, 0);
        
        const executedDraws = await prisma.draw.findMany({
          where: {
            gameId: draw.gameId,
            OR: [
              { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
              { drawDate: { gt: startDraw.drawDate, lte: new Date(t.expiresAt).toISOString().split('T')[0] + 'T00:00:00.000Z' } }
            ],
            status: 'DRAWN',
            winnerItemId: { not: null }
          },
          select: { 
            id: true,
            drawDate: true,
            drawTime: true,
            winnerItemId: true 
          },
          orderBy: [
            { drawDate: 'asc' },
            { drawTime: 'asc' }
          ]
        });

        // Obtener todos los sorteos del rango (incluyendo pendientes)
        const allDrawsInRange = await prisma.draw.findMany({
          where: {
            gameId: draw.gameId,
            OR: [
              { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
              { drawDate: { gt: startDraw.drawDate, lte: new Date(t.expiresAt).toISOString().split('T')[0] + 'T00:00:00.000Z' } }
            ]
          },
          select: {
            id: true,
            drawDate: true,
            drawTime: true,
            status: true,
            winnerItemId: true
          },
          orderBy: [
            { drawDate: 'asc' },
            { drawTime: 'asc' }
          ]
        });

        const winnerItemIds = executedDraws.map(d => d.winnerItemId);
        const item1Won = winnerItemIds.includes(t.item1Id);
        const item2Won = winnerItemIds.includes(t.item2Id);
        const item3Won = winnerItemIds.includes(t.item3Id);
        const numbersWon = [item1Won, item2Won, item3Won].filter(Boolean).length;

        // Encontrar en qué sorteos ganó cada número
        const item1WonIn = executedDraws.find(d => d.winnerItemId === t.item1Id);
        const item2WonIn = executedDraws.find(d => d.winnerItemId === t.item2Id);
        const item3WonIn = executedDraws.find(d => d.winnerItemId === t.item3Id);

        // Calcular peligrosidad
        let dangerLevel = 'low';
        if (numbersWon === 2) {
          dangerLevel = 'high'; // Solo falta 1 número - muy peligroso
        } else if (numbersWon === 1) {
          dangerLevel = 'medium'; // Faltan 2 números
        }

        return {
          id: t.id,
          oderId: t.userId,
          username: t.user?.username,
          amount: parseFloat(t.amount),
          multiplier: parseFloat(t.multiplier),
          potentialPrize: parseFloat(t.amount) * parseFloat(t.multiplier),
          drawsCount: t.drawsCount,
          startDrawId: t.startDrawId,
          expiresAt: t.expiresAt,
          createdAt: t.createdAt,
          items: [
            { 
              ...itemMap.get(t.item1Id), 
              won: item1Won,
              wonInDraw: item1WonIn ? { id: item1WonIn.id, drawDate: item1WonIn.drawDate, drawTime: item1WonIn.drawTime } : null
            },
            { 
              ...itemMap.get(t.item2Id), 
              won: item2Won,
              wonInDraw: item2WonIn ? { id: item2WonIn.id, drawDate: item2WonIn.drawDate, drawTime: item2WonIn.drawTime } : null
            },
            { 
              ...itemMap.get(t.item3Id), 
              won: item3Won,
              wonInDraw: item3WonIn ? { id: item3WonIn.id, drawDate: item3WonIn.drawDate, drawTime: item3WonIn.drawTime } : null
            }
          ],
          numbersWon,
          numbersRemaining: 3 - numbersWon,
          dangerLevel,
          drawsInRange: {
            total: allDrawsInRange.length,
            executed: executedDraws.length,
            pending: allDrawsInRange.filter(d => d.status === 'SCHEDULED').length,
            draws: allDrawsInRange.map(d => ({
              id: d.id,
              drawDate: d.drawDate,
              drawTime: d.drawTime,
              status: d.status,
              winnerItemId: d.winnerItemId,
              isRelevant: d.winnerItemId === t.item1Id || d.winnerItemId === t.item2Id || d.winnerItemId === t.item3Id
            }))
          }
        };
      }));

      // Procesar tripletas EXTERNAS de SRQ
      const externalTripletasWithDetails = await Promise.all(externalTripletas.map(async (ticket) => {
        const details = ticket.details;
        const itemIds = details.map(d => d.gameItemId);
        
        // Obtener el sorteo inicial (donde está asociada la tripleta)
        const startDraw = await prisma.draw.findUnique({
          where: { id: ticket.drawId },
          select: { drawDate: true, drawTime: true }
        });

        // Obtener los siguientes 11 sorteos desde el sorteo inicial
        const allDrawsInRange = await prisma.draw.findMany({
          where: {
            gameId: draw.gameId,
            OR: [
              { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
              { drawDate: { gt: startDraw.drawDate } }
            ]
          },
          select: {
            id: true,
            drawDate: true,
            drawTime: true,
            status: true,
            winnerItemId: true
          },
          orderBy: [
            { drawDate: 'asc' },
            { drawTime: 'asc' }
          ],
          take: 11
        });

        // Filtrar solo los sorteos ejecutados
        const executedDraws = allDrawsInRange.filter(d => 
          d.status === 'DRAWN' && d.winnerItemId
        );

        // Verificar cuántos números han ganado
        const winnerItemIds = executedDraws.map(d => d.winnerItemId);
        const itemsWonStatus = itemIds.map(itemId => {
          const wonDraw = executedDraws.find(d => d.winnerItemId === itemId);
          return {
            itemId,
            won: !!wonDraw,
            wonInDraw: wonDraw ? { 
              id: wonDraw.id, 
              drawDate: wonDraw.drawDate, 
              drawTime: wonDraw.drawTime 
            } : null
          };
        });

        const numbersWon = itemsWonStatus.filter(i => i.won).length;

        // Calcular peligrosidad
        let dangerLevel = 'low';
        if (numbersWon === 2) {
          dangerLevel = 'high'; // Solo falta 1 número - muy peligroso
        } else if (numbersWon === 1) {
          dangerLevel = 'medium'; // Faltan 2 números
        }
        
        // Calcular estado de la tripleta
        const pendingDraws = allDrawsInRange.filter(d => d.status === 'SCHEDULED').length;
        let status = 'ACTIVE';
        if (numbersWon === 3) {
          status = 'WON';
        } else if (pendingDraws === 0 && numbersWon < 3) {
          status = 'LOST';
        }
        
        return {
          id: ticket.providerData?.ticketID || ticket.id, // Mostrar ticketID de SRQ en lugar del ID de DB
          userId: null,
          username: ticket.providerData?.taquillaID ? `Taquilla ${ticket.providerData.taquillaID}` : 'SRQ',
          amount: parseFloat(ticket.totalAmount),
          multiplier: parseFloat(details[0]?.multiplier || 50),
          potentialPrize: parseFloat(ticket.totalAmount) * parseFloat(details[0]?.multiplier || 50),
          drawsCount: 11, // Tripletas de SRQ son válidas por 11 sorteos
          startDrawId: ticket.drawId,
          expiresAt: null,
          createdAt: ticket.createdAt,
          status,
          items: details.map((d, idx) => ({
            ...itemMap.get(d.gameItemId),
            won: itemsWonStatus[idx].won,
            wonInDraw: itemsWonStatus[idx].wonInDraw
          })),
          numbersWon,
          numbersRemaining: 3 - numbersWon,
          dangerLevel,
          source: 'EXTERNAL_API',
          providerData: ticket.providerData,
          drawsInRange: {
            total: allDrawsInRange.length,
            executed: executedDraws.length,
            pending: pendingDraws,
            draws: allDrawsInRange.map(d => ({
              id: d.id,
              drawDate: d.drawDate,
              drawTime: d.drawTime,
              status: d.status,
              winnerItemId: d.winnerItemId,
              isRelevant: itemIds.includes(d.winnerItemId)
            }))
          }
        };
      }));

      // Combinar tripletas locales y externas
      const allTripletas = [...tripletasWithDetails, ...externalTripletasWithDetails];

      return {
        drawId,
        itemId,
        item: itemMap.get(itemId) ? {
          number: itemMap.get(itemId).number,
          name: itemMap.get(itemId).name
        } : null,
        tripletaCount: allTripletas.length,
        totalPotentialPrize: allTripletas.reduce((sum, t) => sum + t.potentialPrize, 0),
        tripletas: allTripletas.sort((a, b) => a.numbersRemaining - b.numbersRemaining)
      };
    } catch (error) {
      logger.error('Error obteniendo tripletas por item:', error);
      throw error;
    }
  }
  /**
   * Listar tickets con filtros y paginación.
   * @param {Object} params
   * @param {string} [params.dateFrom]    - YYYY-MM-DD
   * @param {string} [params.dateTo]      - YYYY-MM-DD
   * @param {string} [params.gameId]      - filter by game UUID
   * @param {string} [params.source]      - TAQUILLA_ONLINE | EXTERNAL_API | WEBHOOK_PUSH
   * @param {string} [params.apiSystemId] - filter by provider UUID
   * @param {number} [params.page]        - page number (1-based)
   * @param {number} [params.pageSize]    - items per page
   */
  async getTicketList(filters = {}) {
    const normalized = {
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom).toISOString().slice(0, 10) : null,
      dateTo: filters.dateTo ? new Date(filters.dateTo).toISOString().slice(0, 10) : null,
      gameId: filters.gameId || null,
      source: filters.source || null,
      apiSystemId: filters.apiSystemId || null,
      playerSearch: filters.playerSearch ? String(filters.playerSearch).trim().toLowerCase() : null,
      page: filters.page || 1,
      pageSize: filters.pageSize || 50,
    };
    const hash = crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
    const key = `tote:v1:tickets:list:${hash}`;
    return cacheOrCompute(key, 60, () => this._getTicketListUncached(filters));
  }

  async _getTicketListUncached({ dateFrom = null, dateTo = null, gameId = null, source = null, apiSystemId = null, playerSearch = null, page = 1, pageSize = 50 } = {}) {
    try {
      const where = { status: { not: 'CANCELLED' } };

      // Date filter via draw relationship
      const drawWhere = {};
      if (dateFrom && dateTo) {
        drawWhere.drawDate = {
          gte: new Date(dateFrom + 'T00:00:00.000Z'),
          lte: new Date(dateTo + 'T00:00:00.000Z'),
        };
      }
      if (gameId) drawWhere.gameId = gameId;

      if (Object.keys(drawWhere).length > 0) {
        where.draw = drawWhere;
      }

      if (apiSystemId) {
        const sys = await prisma.apiSystem.findUnique({ where: { id: apiSystemId }, select: { mode: true } });
        if (sys?.mode === 'PUSH') where.apiSystemId = apiSystemId;
        else where.source = 'EXTERNAL_API';
      } else if (source) {
        where.source = source;
      }

      // Búsqueda por jugador: matchea username/email del usuario (online) o
      // externalTicketId (SRQ/Webhook/Scrape, donde no hay User).
      const term = playerSearch ? String(playerSearch).trim() : '';
      if (term) {
        where.OR = [
          { user: { username: { contains: term, mode: 'insensitive' } } },
          { user: { email:    { contains: term, mode: 'insensitive' } } },
          { externalTicketId: { contains: term, mode: 'insensitive' } },
        ];
      }

      const [tickets, total] = await Promise.all([
        prisma.ticket.findMany({
          where,
          include: {
            draw: { include: { game: true, winnerItem: true } },
            details: { include: { gameItem: true } },
            apiSystem: { select: { name: true } },
            user: { select: { username: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.ticket.count({ where }),
      ]);

      return {
        tickets: tickets.map(t => ({
          id: t.id,
          ticketNumber: t.ticketNumber,
          externalTicketId: t.externalTicketId,
          source: t.source,
          provider: t.apiSystem?.name || null,
          player: t.user ? { username: t.user.username, email: t.user.email } : null,
          totalAmount: parseFloat(t.totalAmount),
          totalPrize: parseFloat(t.totalPrize),
          status: t.status,
          createdAt: t.createdAt,
          draw: {
            id: t.draw.id,
            game: t.draw.game.name,
            drawDate: t.draw.drawDate,
            drawTime: t.draw.drawTime,
            status: t.draw.status,
          },
          winnerItem: t.draw.winnerItem ? { number: t.draw.winnerItem.number, name: t.draw.winnerItem.name } : null,
          details: t.details.map(d => ({
            number: d.gameItem.number,
            name: d.gameItem.name,
            amount: parseFloat(d.amount),
            multiplier: parseFloat(d.gameItem.multiplier),
            status: d.status,
            prize: parseFloat(d.prize || 0),
            game: { name: t.draw.game.name },
          })),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } catch (error) {
      logger.error('Error obteniendo lista de tickets:', error);
      throw error;
    }
  }

  /**
   * Para un juego dado, retorna la lista de items con la fecha de su última salida
   * (winnerItemId en un Draw cerrado) y los días transcurridos desde esa fecha.
   *
   * Items que nunca han salido se devuelven con `lastDrawnAt: null` y `daysSince: null`.
   *
   * @param {string} gameId
   * @returns {Promise<Array<{id, number, name, multiplier, lastDrawnAt, daysSince}>>}
   */
  async getItemsLastDrawn(gameId) {
    if (!gameId) {
      throw new Error('gameId es requerido');
    }

    // 1. Una sola query agrupada para obtener la última fecha de salida por item.
    //    Usa raw SQL con cast a text para soportar tanto local (enum DrawStatus
    //    sin PUBLISHED) como producción (DB con valor PUBLISHED legacy en filas
    //    históricas — el enum Prisma puede o no incluirlo según la versión).
    const lastDraws = await prisma.$queryRaw`
      SELECT
        "winnerItemId" AS "winnerItemId",
        MAX("drawDate") AS "lastDrawnAt"
      FROM "Draw"
      WHERE "gameId" = ${gameId}
        AND "winnerItemId" IS NOT NULL
        AND status::text IN ('DRAWN', 'PUBLISHED')
      GROUP BY "winnerItemId"
    `;

    const lastDrawnByItem = new Map();
    for (const row of lastDraws) {
      if (row.winnerItemId && row.lastDrawnAt) {
        lastDrawnByItem.set(row.winnerItemId, row.lastDrawnAt);
      }
    }

    // 2. Listado de items activos del juego, ordenado por número.
    const items = await prisma.gameItem.findMany({
      where: { gameId, isActive: true },
      orderBy: { number: 'asc' },
      select: { id: true, number: true, name: true, multiplier: true },
    });

    // 3. Calcular días desde la última salida usando midnight UTC de hoy en Venezuela.
    const todayCaracas = getVenezuelaDateAsUTC();
    const ONE_DAY_MS = 86400000;

    return items.map((item) => {
      const lastDrawnAt = lastDrawnByItem.get(item.id) || null;
      const daysSince = lastDrawnAt
        ? Math.max(0, Math.floor((todayCaracas.getTime() - new Date(lastDrawnAt).getTime()) / ONE_DAY_MS))
        : null;
      return {
        id: item.id,
        number: item.number,
        name: item.name,
        multiplier: item.multiplier,
        lastDrawnAt,
        daysSince,
      };
    });
  }

  /**
   * Llena `apiSystemName` en cada entrada de bySourceMap haciendo un único
   * lookup por todos los apiSystemId presentes. Mutates the map in place.
   *
   * @private
   * @param {Object} bySourceMap
   */
  async _enrichBySourceWithProviderNames(bySourceMap) {
    const ids = Array.from(
      new Set(
        Object.values(bySourceMap)
          .map((r) => r.apiSystemId)
          .filter((id) => id),
      ),
    );
    if (ids.length === 0) return;
    const systems = await prisma.apiSystem.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const byId = new Map(systems.map((s) => [s.id, s.name]));
    for (const row of Object.values(bySourceMap)) {
      if (row.apiSystemId) {
        row.apiSystemName = byId.get(row.apiSystemId) || null;
      }
    }
  }
}

export default new MonitorService();
