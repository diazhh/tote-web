import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getCaidas, hasCaidas } from '../data/caidas.js';
import { loadDrawTicketDetails, sumDetailsAmount } from '../lib/drawDetailsLoader.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function computeMaxPayout(config, totalSales) {
  const pct = config?.percentageToDistribute || 70;
  let maxPayout = config?.maxPayoutFixed && config.maxPayoutFixed > 0
    ? parseFloat(config.maxPayoutFixed)
    : (totalSales * pct) / 100;
  return Math.min(maxPayout, totalSales);
}

function riskOf(premioPotencial, maxPayout) {
  if (premioPotencial <= 0 || maxPayout <= 0) return 'BAJO';
  if (premioPotencial >= maxPayout) return 'ALTO';
  if (premioPotencial >= maxPayout * 0.5) return 'MEDIO';
  return 'BAJO';
}

/**
 * Caídas enriquecidas para un sorteo, según el ganador del sorteo anterior del
 * mismo día. Devuelve null si el juego no tiene tabla o no hay sorteo previo.
 */
async function getCaidasForDraw(drawId) {
  try {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: {
        id: true, gameId: true, drawDate: true, drawTime: true,
        preselectedItemId: true, winnerItemId: true,
        game: { select: { slug: true, config: true } },
      },
    });
    if (!draw || !hasCaidas(draw.game.slug)) return null;

    // Ganador del sorteo anterior del MISMO día
    const prev = await prisma.draw.findFirst({
      where: {
        gameId: draw.gameId,
        drawDate: draw.drawDate,
        drawTime: { lt: draw.drawTime },
        winnerItemId: { not: null },
      },
      orderBy: { drawTime: 'desc' },
      select: { id: true, drawTime: true, winnerItem: { select: { number: true, name: true } } },
    });
    if (!prev || !prev.winnerItem) return null;

    const caidaDefs = getCaidas(draw.game.slug, prev.winnerItem.number);
    if (caidaDefs.length === 0) return null;
    const caidaNumbers = caidaDefs.map((c) => c.number);

    // GameItems de las caídas (id + multiplier)
    const items = await prisma.gameItem.findMany({
      where: { gameId: draw.gameId, number: { in: caidaNumbers } },
      select: { id: true, number: true, name: true, multiplier: true },
    });
    const itemByNumber = new Map(items.map((i) => [i.number, i]));

    // Ventas del sorteo ACTUAL
    const details = await loadDrawTicketDetails(drawId, { ticketSelect: { id: true } });
    const totalSales = sumDetailsAmount(details);
    const salesByItemId = new Map();
    for (const d of details) {
      salesByItemId.set(d.gameItemId, (salesByItemId.get(d.gameItemId) || 0) + parseFloat(d.amount));
    }
    const maxPayout = computeMaxPayout(draw.game.config, totalSales);

    // Histórico para "tiempo sin salir": sorteos ejecutados antes del actual
    const executed = await prisma.draw.findMany({
      where: {
        gameId: draw.gameId,
        winnerItemId: { not: null },
        OR: [
          { drawDate: { lt: draw.drawDate } },
          { drawDate: draw.drawDate, drawTime: { lt: draw.drawTime } },
        ],
      },
      orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }],
      take: 600, // ventana reciente: acota el escaneo en el path con lock; no-encontrado => sorteosSinSalir null
      select: { winnerItemId: true, drawDate: true },
    });

    const caidas = caidaDefs.map((def) => {
      const item = itemByNumber.get(def.number);
      const multiplier = item ? parseFloat(item.multiplier) : 0;
      const ventaActual = item ? (salesByItemId.get(item.id) || 0) : 0;
      const premioPotencial = ventaActual * multiplier;
      const utilidadSobreVenta = totalSales > 0
        ? ((totalSales - premioPotencial) / totalSales) * 100
        : 100;

      let sorteosSinSalir = null;
      let diasSinSalir = null;
      if (item) {
        const idx = executed.findIndex((e) => e.winnerItemId === item.id);
        if (idx >= 0) {
          sorteosSinSalir = idx; // 0 = ganó el sorteo inmediato anterior
          diasSinSalir = Math.round((draw.drawDate - executed[idx].drawDate) / DAY_MS);
        }
      }

      return {
        number: def.number,
        name: def.name,
        reason: def.reason,
        itemId: item ? item.id : null,
        multiplier,
        sorteosSinSalir,
        diasSinSalir,
        ventaActual,
        premioPotencial,
        utilidadSobreVenta,
        riesgo: riskOf(premioPotencial, maxPayout),
      };
    });

    // Número objetivo (ganador si existe, si no el preseleccionado). Se busca
    // primero en los items ya cargados (las caídas); solo si no está ahí se
    // hace una query puntual. Así el caso común (coincide con una caída) no
    // requiere query extra.
    const resolveNumber = async (id) => {
      if (!id) return null;
      const inItems = items.find((i) => i.id === id);
      if (inItems) return inItems.number;
      const gi = await prisma.gameItem.findUnique({ where: { id }, select: { number: true } });
      return gi?.number || null;
    };
    const targetNumber = await resolveNumber(draw.winnerItemId);
    const preselNumber = await resolveNumber(draw.preselectedItemId);
    const effectiveNumber = targetNumber ?? preselNumber;
    const preselectedEnCaidas = effectiveNumber != null && caidaNumbers.includes(effectiveNumber);

    return {
      game: draw.game.slug,
      previousDraw: { id: prev.id, drawTime: prev.drawTime, winner: prev.winnerItem },
      caidas,
      preselectedEnCaidas,
    };
  } catch (error) {
    logger.error(`Error en getCaidasForDraw(${drawId}): ${error.message}`);
    return null;
  }
}

export { getCaidasForDraw };
export default { getCaidasForDraw };
