import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { startOfDay, endOfDay, differenceInDays, differenceInHours } from 'date-fns';
import { startOfDayInCaracas, endOfDayInCaracas } from '../lib/dateUtils.js';

/**
 * Servicio de Optimización de Pre-Ganadores
 * 
 * Algoritmo multi-criterio que considera:
 * 
 * 1. RESTRICCIONES DURAS (eliminatorias):
 *    - Pago total (directo + tripletas) <= monto máximo configurado
 *    - Item no usado hoy (ni preseleccionado ni ganador)
 *    - Para TRIPLE: centena no usada hoy
 *    - No debe causar pérdidas (pago total <= ventas totales)
 * 
 * 2. CRITERIOS DE SCORING (optimización):
 *    - Maximizar cantidad de tickets ganadores (más personas ganan = mejor)
 *    - Preferir items con más tiempo sin ganar
 *    - Evitar patrones sucesivos (01, 02, 03)
 *    - Minimizar impacto de tripletas
 *    - Distribuir resultados (no repetir patrones)
 */
class PrewinnerOptimizerService {
  
  /**
   * Pesos para cada criterio de scoring
   * Estos valores pueden ajustarse según las prioridades del negocio
   */
  static WEIGHTS = {
    TICKET_COUNT: 0.35,        // Maximizar tickets ganadores
    DAYS_SINCE_WIN: 0.25,      // Items sin salir hace más tiempo
    SEQUENTIAL_PENALTY: 0.15,  // Evitar números sucesivos
    TRIPLETA_RISK: 0.15,       // Minimizar riesgo de tripletas
    PAYOUT_EFFICIENCY: 0.10    // Eficiencia del pago (cercano pero debajo del máximo)
  };

  /**
   * Configuración por defecto
   */
  static DEFAULTS = {
    MAX_PAYOUT_PERCENTAGE: 70,      // Porcentaje máximo de ventas a repartir
    MAX_PAYOUT_FIXED: null,         // Monto fijo máximo (prioridad sobre porcentaje)
    SEQUENTIAL_WINDOW: 5,           // Cuántos sorteos atrás revisar para patrones
    MAX_DAYS_BONUS: 30,             // Días máx para normalizar score de días sin ganar
    MIN_CENTENA_SEPARATION: 1       // Mínima separación entre centenas
  };

  /**
   * Seleccionar pre-ganador óptimo para un sorteo
   * @param {string} drawId - ID del sorteo
   * @returns {Promise<Object>} Resultado con item seleccionado y análisis
   */
  async selectOptimalPrewinner(drawId) {
    const startTime = Date.now();
    logger.info(`🎯 [OPTIMIZER] Iniciando selección óptima para sorteo ${drawId}`);

    try {
      // 1. Cargar todos los datos necesarios
      const context = await this.loadDrawContext(drawId);
      
      if (!context.draw) {
        throw new Error(`Sorteo ${drawId} no encontrado`);
      }

      // Si ya hay un pre-ganador de admin, respetarlo
      if (context.draw.preselectedItemId && context.draw.preselectedItem) {
        logger.info(`  👤 Pre-ganador ya seleccionado por admin: ${context.draw.preselectedItem.number}`);
        return {
          success: true,
          method: 'admin',
          selectedItem: context.draw.preselectedItem,
          analysis: null
        };
      }

      // 2. Si no hay ventas, hacer selección aleatoria inteligente
      if (context.totalSales === 0) {
        logger.info(`  📭 Sin ventas, selección aleatoria inteligente...`);
        const randomItem = await this.selectRandomIntelligent(context);
        return {
          success: true,
          method: 'random_intelligent',
          selectedItem: randomItem,
          analysis: { noSales: true }
        };
      }

      // 3. Calcular restricciones
      const constraints = this.calculateConstraints(context);
      logger.info(`  💰 Ventas: $${context.totalSales.toFixed(2)}, Máx pago: $${constraints.maxPayout.toFixed(2)}`);

      // 4. Obtener historial para patrones
      const history = await this.getDrawHistory(context);

      // 5. Evaluar cada item candidato
      const candidates = await this.evaluateCandidates(context, constraints, history);

      if (candidates.length === 0) {
        logger.warn(`  ⚠️ No hay candidatos válidos, relajando restricciones...`);
        const fallbackItem = await this.selectFallback(context, constraints);
        return {
          success: true,
          method: 'fallback',
          selectedItem: fallbackItem,
          analysis: { noValidCandidates: true }
        };
      }

      // 6. Ordenar por score y seleccionar el mejor
      candidates.sort((a, b) => b.finalScore - a.finalScore);
      const selected = candidates[0];

      const elapsed = Date.now() - startTime;
      logger.info(`  ✅ Seleccionado: ${selected.item.number} (${selected.item.name})`);
      logger.info(`     Score: ${selected.finalScore.toFixed(4)}`);
      logger.info(`     Tickets ganadores: ${selected.ticketCount}`);
      logger.info(`     Días sin ganar: ${selected.daysSinceWin}`);
      logger.info(`     Pago total: $${selected.totalPayout.toFixed(2)}`);
      logger.info(`  ⏱️ Tiempo de cálculo: ${elapsed}ms`);

      return {
        success: true,
        method: 'optimized',
        selectedItem: selected.item,
        analysis: {
          totalCandidates: context.gameItems.length,
          validCandidates: candidates.length,
          selected: {
            number: selected.item.number,
            name: selected.item.name,
            ticketCount: selected.ticketCount,
            salesAmount: selected.salesAmount,
            potentialPayout: selected.potentialPayout,
            tripletaPayout: selected.tripletaImpact.totalPrize,
            totalPayout: selected.totalPayout,
            daysSinceWin: selected.daysSinceWin,
            scores: selected.scores,
            finalScore: selected.finalScore
          },
          topAlternatives: candidates.slice(1, 6).map(c => ({
            number: c.item.number,
            name: c.item.name,
            ticketCount: c.ticketCount,
            finalScore: c.finalScore
          })),
          constraints,
          timing: { elapsed }
        }
      };
    } catch (error) {
      logger.error(`❌ [OPTIMIZER] Error: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Cargar todo el contexto necesario para el sorteo
   */
  async loadDrawContext(drawId) {
    // Cargar sorteo con todas las relaciones necesarias
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: {
        game: true,
        preselectedItem: true,
        tickets: {
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

    if (!draw) return { draw: null };

    // Cargar items del juego
    const gameItems = await prisma.gameItem.findMany({
      where: {
        gameId: draw.gameId,
        isActive: true
      },
      orderBy: { number: 'asc' }
    });

    // Calcular ventas totales
    const tickets = draw.tickets || [];
    const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);

    // Agrupar ventas por item
    const salesByItem = this.groupSalesByItem(tickets);

    // Cargar tripletas activas
    // Construir fecha/hora completa del sorteo
    const drawDateTime = new Date(draw.drawDate);
    const [hours, minutes] = draw.drawTime.split(':');
    drawDateTime.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    const activeTripletas = await prisma.tripleBet.findMany({
      where: {
        gameId: draw.gameId,
        status: 'ACTIVE',
        expiresAt: { gte: drawDateTime }
      }
    });

    // Obtener items usados hoy
    const usedItemsToday = await this.getUsedItemsToday(draw.gameId, draw.drawDate);
    
    // Obtener centenas usadas hoy (solo para TRIPLE)
    const usedCentenasToday = draw.game.type === 'TRIPLE'
      ? await this.getUsedCentenasToday(draw.gameId, draw.drawDate)
      : new Set();

    return {
      draw,
      game: draw.game,
      gameItems,
      tickets,
      totalSales,
      salesByItem,
      activeTripletas,
      usedItemsToday,
      usedCentenasToday
    };
  }

  /**
   * Agrupar ventas por item
   */
  groupSalesByItem(tickets) {
    const salesByItem = new Map();
    
    for (const ticket of tickets) {
      for (const detail of ticket.details) {
        const existing = salesByItem.get(detail.gameItemId) || { 
          amount: 0, 
          count: 0,
          tickets: []
        };
        existing.amount += parseFloat(detail.amount);
        existing.count += 1;
        existing.tickets.push({
          ticketId: ticket.id,
          amount: parseFloat(detail.amount)
        });
        salesByItem.set(detail.gameItemId, existing);
      }
    }

    return salesByItem;
  }

  /**
   * Calcular restricciones basadas en configuración del juego
   */
  calculateConstraints(context) {
    const { game, totalSales } = context;
    const config = game.config || {};

    // Monto máximo a repartir
    // Prioridad: 1) maxPayoutFixed, 2) percentageToDistribute de ventas
    let maxPayout;
    
    if (config.maxPayoutFixed && config.maxPayoutFixed > 0) {
      // Monto fijo configurado en el juego
      maxPayout = parseFloat(config.maxPayoutFixed);
    } else {
      // Porcentaje de las ventas
      const percentage = config.percentageToDistribute || PrewinnerOptimizerService.DEFAULTS.MAX_PAYOUT_PERCENTAGE;
      maxPayout = (totalSales * percentage) / 100;
    }

    // Nunca pagar más de lo que se vendió
    maxPayout = Math.min(maxPayout, totalSales);

    return {
      maxPayout,
      maxPayoutSource: config.maxPayoutFixed ? 'fixed' : 'percentage',
      totalSales,
      gameType: game.type
    };
  }

  /**
   * Obtener historial de sorteos para detectar patrones
   */
  async getDrawHistory(context) {
    const { draw, game } = context;
    
    // Obtener últimos N sorteos ejecutados del mismo juego
    const recentDraws = await prisma.draw.findMany({
      where: {
        gameId: game.id,
        status: { in: ['DRAWN', 'PUBLISHED'] },
        winnerItemId: { not: null },
        OR: [
          { drawDate: { lt: draw.drawDate } },
          { drawDate: draw.drawDate, drawTime: { lt: draw.drawTime } }
        ]
      },
      orderBy: [
        { drawDate: 'desc' },
        { drawTime: 'desc' }
      ],
      take: 20,
      include: {
        winnerItem: true
      }
    });

    // Extraer números ganadores recientes
    const recentWinners = recentDraws.map(d => ({
      number: parseInt(d.winnerItem.number),
      itemId: d.winnerItemId,
      drawDate: d.drawDate,
      drawTime: d.drawTime
    }));

    // Obtener sorteos del mismo día (anteriores)
    const todayDraws = recentDraws.filter(d => 
      d.drawDate.getTime() === draw.drawDate.getTime()
    );

    return {
      recentWinners,
      todayWinners: todayDraws.map(d => parseInt(d.winnerItem.number)),
      totalRecentDraws: recentDraws.length
    };
  }

  /**
   * Evaluar todos los items candidatos
   */
  async evaluateCandidates(context, constraints, history) {
    const { gameItems, salesByItem, usedItemsToday, usedCentenasToday, activeTripletas, draw } = context;
    const candidates = [];
    const now = new Date();

    for (const item of gameItems) {
      // === RESTRICCIONES DURAS ===
      
      // 1. No puede haber sido usado hoy
      if (usedItemsToday.has(item.id)) {
        continue;
      }

      // 2. Para TRIPLE, centena no puede haber sido usada hoy
      if (context.game.type === 'TRIPLE') {
        const centena = Math.floor(parseInt(item.number) / 100);
        if (usedCentenasToday.has(centena)) {
          continue;
        }
      }

      // Obtener datos de ventas para este item
      const sales = salesByItem.get(item.id) || { amount: 0, count: 0 };
      const potentialPayout = parseFloat(sales.amount) * parseFloat(item.multiplier);

      // 3. Calcular impacto de tripletas
      const tripletaImpact = await this.calculateTripletaImpact(
        context.game.id,
        item.id,
        draw.id,
        activeTripletas
      );

      // Pago total incluyendo tripletas
      const totalPayout = potentialPayout + tripletaImpact.totalPrize;

      // 4. No puede exceder el máximo a pagar
      if (totalPayout > constraints.maxPayout) {
        continue;
      }

      // 5. No puede causar pérdidas (pagar más de lo vendido)
      if (totalPayout > context.totalSales) {
        continue;
      }

      // === PASÓ TODAS LAS RESTRICCIONES - CALCULAR SCORES ===

      // Días desde última victoria
      const daysSinceWin = item.lastWin 
        ? differenceInDays(now, new Date(item.lastWin))
        : 365; // Si nunca ha ganado, dar un valor alto

      // Calcular scores individuales
      const scores = this.calculateScores(
        item,
        sales,
        totalPayout,
        tripletaImpact,
        daysSinceWin,
        history,
        constraints,
        context
      );

      // Calcular score final ponderado
      const finalScore = this.calculateFinalScore(scores);

      candidates.push({
        item,
        salesAmount: sales.amount,
        ticketCount: sales.count,
        potentialPayout,
        tripletaImpact,
        totalPayout,
        daysSinceWin,
        scores,
        finalScore
      });
    }

    return candidates;
  }

  /**
   * Calcular scores individuales para cada criterio
   */
  calculateScores(item, sales, totalPayout, tripletaImpact, daysSinceWin, history, constraints, context) {
    const scores = {};

    // 1. TICKET_COUNT - Maximizar cantidad de tickets ganadores
    // Normalizar: más tickets = mejor score
    const maxTickets = Math.max(...Array.from(context.salesByItem.values()).map(s => s.count), 1);
    scores.ticketCount = sales.count / maxTickets;

    // 2. DAYS_SINCE_WIN - Preferir items que no han ganado hace más tiempo
    const maxDays = PrewinnerOptimizerService.DEFAULTS.MAX_DAYS_BONUS;
    scores.daysSinceWin = Math.min(daysSinceWin / maxDays, 1);

    // 3. SEQUENTIAL_PENALTY - Penalizar números sucesivos
    scores.sequential = this.calculateSequentialScore(item, history);

    // 4. TRIPLETA_RISK - Penalizar items que completan tripletas costosas
    if (tripletaImpact.completedCount > 0) {
      // Cuanto más alto el premio de tripletas vs máximo, peor score
      const tripletaRatio = tripletaImpact.totalPrize / constraints.maxPayout;
      scores.tripletaRisk = Math.max(0, 1 - tripletaRatio * 2);
    } else {
      scores.tripletaRisk = 1; // Sin riesgo de tripletas
    }

    // 5. PAYOUT_EFFICIENCY - Preferir pagos eficientes (cercanos pero debajo del máximo)
    if (constraints.maxPayout > 0) {
      const payoutRatio = totalPayout / constraints.maxPayout;
      // Score óptimo cuando está entre 50-90% del máximo
      if (payoutRatio <= 0.9) {
        scores.payoutEfficiency = payoutRatio / 0.9;
      } else {
        scores.payoutEfficiency = Math.max(0, 1 - (payoutRatio - 0.9) * 5);
      }
    } else {
      scores.payoutEfficiency = 0.5;
    }

    return scores;
  }

  /**
   * Calcular score de secuencialidad (evitar 01, 02, 03)
   */
  calculateSequentialScore(item, history) {
    const itemNumber = parseInt(item.number);
    const { todayWinners, recentWinners } = history;

    // Verificar si sería parte de una secuencia con los ganadores de hoy
    let sequentialPenalty = 0;

    // Revisar ganadores de hoy para detectar secuencias
    for (const winnerNum of todayWinners) {
      const diff = Math.abs(itemNumber - winnerNum);
      if (diff === 1) {
        sequentialPenalty += 0.4; // Número consecutivo directo
      } else if (diff === 2) {
        sequentialPenalty += 0.2; // Casi consecutivo
      }
    }

    // Revisar últimos 5 sorteos para patrones más amplios
    const recentNumbers = recentWinners.slice(0, 5).map(w => w.number);
    
    // Detectar si formaría parte de una serie aritmética
    for (let i = 0; i < recentNumbers.length - 1; i++) {
      const diff1 = recentNumbers[i] - (recentNumbers[i+1] || 0);
      const diff2 = itemNumber - recentNumbers[0];
      
      if (Math.abs(diff1) === Math.abs(diff2) && diff1 !== 0) {
        sequentialPenalty += 0.15; // Patrón aritmético detectado
      }
    }

    // Convertir penalidad a score (1 = sin penalidad, 0 = máxima penalidad)
    return Math.max(0, 1 - Math.min(sequentialPenalty, 1));
  }

  /**
   * Calcular score final ponderado
   */
  calculateFinalScore(scores) {
    const weights = PrewinnerOptimizerService.WEIGHTS;
    
    return (
      (scores.ticketCount * weights.TICKET_COUNT) +
      (scores.daysSinceWin * weights.DAYS_SINCE_WIN) +
      (scores.sequential * weights.SEQUENTIAL_PENALTY) +
      (scores.tripletaRisk * weights.TRIPLETA_RISK) +
      (scores.payoutEfficiency * weights.PAYOUT_EFFICIENCY)
    );
  }

  /**
   * Calcular impacto en tripletas si un item gana
   */
  async calculateTripletaImpact(gameId, itemId, drawId, activeTripletas) {
    try {
      // Filtrar tripletas que incluyen este item
      const relevantTripletas = activeTripletas.filter(t => 
        t.item1Id === itemId || t.item2Id === itemId || t.item3Id === itemId
      );

      if (relevantTripletas.length === 0) {
        return { count: 0, completedCount: 0, totalPrize: 0, details: [] };
      }

      const details = [];
      let completedCount = 0;
      let totalPrize = 0;

      for (const tripleta of relevantTripletas) {
        // Obtener sorteo inicial de la tripleta
        const startDraw = await prisma.draw.findUnique({
          where: { id: tripleta.startDrawId }
        });

        if (!startDraw) continue;

        // Obtener sorteos ejecutados en el rango de la tripleta
        // Construir fecha/hora del sorteo inicial
        const startDateTime = new Date(startDraw.drawDate);
        const [startHours, startMinutes] = startDraw.drawTime.split(':');
        startDateTime.setUTCHours(parseInt(startHours), parseInt(startMinutes), 0, 0);
        
        const expiresDate = new Date(tripleta.expiresAt).toISOString().split('T')[0] + 'T00:00:00.000Z';
        
        const executedDraws = await prisma.draw.findMany({
          where: {
            gameId,
            OR: [
              { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
              { drawDate: { gt: startDraw.drawDate, lte: expiresDate } }
            ],
            status: { in: ['DRAWN', 'PUBLISHED'] },
            winnerItemId: { not: null }
          },
          select: { id: true, winnerItemId: true }
        });

        const winnerItemIds = executedDraws.map(d => d.winnerItemId);
        
        // Verificar si este item es el que falta para completar
        const itemIds = [tripleta.item1Id, tripleta.item2Id, tripleta.item3Id];
        const otherItems = itemIds.filter(id => id !== itemId);
        const otherItemsWon = otherItems.every(id => winnerItemIds.includes(id));

        // Si los otros 2 ya salieron, este item completaría la tripleta
        const wouldComplete = otherItemsWon && !winnerItemIds.includes(itemId);
        const prize = parseFloat(tripleta.amount) * parseFloat(tripleta.multiplier);

        if (wouldComplete) {
          completedCount++;
          totalPrize += prize;
        }

        // Contar cuántos números ya han salido (para tripletas parciales)
        const numbersHit = itemIds.filter(id => winnerItemIds.includes(id)).length;

        details.push({
          tripletaId: tripleta.id,
          amount: parseFloat(tripleta.amount),
          multiplier: parseFloat(tripleta.multiplier),
          prize,
          wouldComplete,
          numbersHit,
          remainingNumbers: 3 - numbersHit
        });
      }

      return {
        count: relevantTripletas.length,
        completedCount,
        totalPrize,
        details: details.sort((a, b) => b.wouldComplete - a.wouldComplete)
      };
    } catch (error) {
      logger.error('Error en calculateTripletaImpact:', error);
      return { count: 0, completedCount: 0, totalPrize: 0, details: [] };
    }
  }

  /**
   * Obtener items usados hoy (preseleccionados o ganadores)
   */
  async getUsedItemsToday(gameId, referenceDate) {
    const drawsToday = await prisma.draw.findMany({
      where: {
        gameId,
        drawDate: referenceDate,
        OR: [
          { preselectedItemId: { not: null } },
          { winnerItemId: { not: null } }
        ]
      },
      select: {
        preselectedItemId: true,
        winnerItemId: true
      }
    });

    const usedItems = new Set();
    for (const draw of drawsToday) {
      if (draw.preselectedItemId) usedItems.add(draw.preselectedItemId);
      if (draw.winnerItemId) usedItems.add(draw.winnerItemId);
    }

    return usedItems;
  }

  /**
   * Obtener centenas usadas hoy (solo para TRIPLE)
   */
  async getUsedCentenasToday(gameId, referenceDate) {
    const drawsToday = await prisma.draw.findMany({
      where: {
        gameId,
        drawDate: referenceDate,
        OR: [
          { preselectedItemId: { not: null } },
          { winnerItemId: { not: null } }
        ]
      },
      include: {
        preselectedItem: true,
        winnerItem: true
      }
    });

    const usedCentenas = new Set();
    for (const draw of drawsToday) {
      if (draw.preselectedItem) {
        const centena = Math.floor(parseInt(draw.preselectedItem.number) / 100);
        usedCentenas.add(centena);
      }
      if (draw.winnerItem) {
        const centena = Math.floor(parseInt(draw.winnerItem.number) / 100);
        usedCentenas.add(centena);
      }
    }

    return usedCentenas;
  }

  /**
   * Selección aleatoria inteligente (cuando no hay ventas)
   * Aún aplica restricciones de no repetir y evitar sucesivos
   */
  async selectRandomIntelligent(context) {
    const { gameItems, usedItemsToday, usedCentenasToday, game, draw } = context;
    const history = await this.getDrawHistory(context);
    
    // Filtrar items válidos
    let validItems = gameItems.filter(item => {
      // No usado hoy
      if (usedItemsToday.has(item.id)) return false;
      
      // Para TRIPLE, centena no usada
      if (game.type === 'TRIPLE') {
        const centena = Math.floor(parseInt(item.number) / 100);
        if (usedCentenasToday.has(centena)) return false;
      }
      
      return true;
    });

    if (validItems.length === 0) {
      // Fallback: cualquier item
      validItems = gameItems;
    }

    // Ordenar por días sin ganar (preferir los que llevan más tiempo)
    const now = new Date();
    validItems.sort((a, b) => {
      const daysA = a.lastWin ? differenceInDays(now, new Date(a.lastWin)) : 999;
      const daysB = b.lastWin ? differenceInDays(now, new Date(b.lastWin)) : 999;
      return daysB - daysA;
    });

    // Filtrar los que serían sucesivos ANTES de ordenar
    const nonSequential = validItems.filter(item => {
      const itemNumber = parseInt(item.number);
      for (const winnerNum of history.todayWinners) {
        if (Math.abs(itemNumber - winnerNum) <= 1) return false;
      }
      return true;
    });

    // Si hay suficientes items no sucesivos, usar esos; sino usar todos
    const itemsToSort = nonSequential.length >= 5 ? nonSequential : validItems;

    // Ordenar por días sin ganar
    itemsToSort.sort((a, b) => {
      const daysA = a.lastWin ? differenceInDays(now, new Date(a.lastWin)) : 999;
      const daysB = b.lastWin ? differenceInDays(now, new Date(b.lastWin)) : 999;
      return daysB - daysA;
    });

    // Tomar del top 30% de los que más tiempo llevan sin ganar
    const topCount = Math.max(Math.floor(itemsToSort.length * 0.3), 5);
    const topItems = itemsToSort.slice(0, topCount);
    
    // Selección aleatoria del pool filtrado
    const randomIndex = Math.floor(Math.random() * topItems.length);
    return topItems[randomIndex];
  }

  /**
   * Selección de fallback cuando no hay candidatos válidos
   * Relaja algunas restricciones pero mantiene las críticas
   */
  async selectFallback(context, constraints) {
    const { gameItems, usedItemsToday, game } = context;
    const history = await this.getDrawHistory(context);
    
    // Solo mantener restricción de no usado hoy
    let validItems = gameItems.filter(item => !usedItemsToday.has(item.id));
    
    if (validItems.length === 0) {
      // Último recurso: cualquier item activo
      validItems = gameItems;
    }

    // Filtrar números sucesivos con los ganadores de hoy
    const nonSequential = validItems.filter(item => {
      const itemNumber = parseInt(item.number);
      for (const winnerNum of history.todayWinners) {
        if (Math.abs(itemNumber - winnerNum) <= 1) return false;
      }
      return true;
    });

    // Si hay items no sucesivos, usar esos; sino usar todos
    const candidatePool = nonSequential.length > 0 ? nonSequential : validItems;

    // Ordenar por menos ventas para tener un pool de bajo riesgo
    const salesByItem = context.salesByItem;
    candidatePool.sort((a, b) => {
      const salesA = salesByItem.get(a.id)?.amount || 0;
      const salesB = salesByItem.get(b.id)?.amount || 0;
      return salesA - salesB;
    });

    // Tomar el top 30% con menos ventas y seleccionar aleatoriamente
    const topCount = Math.max(Math.floor(candidatePool.length * 0.3), 3);
    const lowSalesItems = candidatePool.slice(0, topCount);
    
    // Selección aleatoria del pool
    const randomIndex = Math.floor(Math.random() * lowSalesItems.length);
    return lowSalesItems[randomIndex];
  }

  /**
   * Obtener estadísticas de un item
   */
  async getItemStatistics(itemId) {
    const item = await prisma.gameItem.findUnique({
      where: { id: itemId },
      include: {
        drawsAsWinner: {
          where: {
            status: { in: ['DRAWN', 'PUBLISHED'] }
          },
          orderBy: [
            { drawDate: 'desc' },
            { drawTime: 'desc' }
          ],
          take: 10
        }
      }
    });

    if (!item) return null;

    const now = new Date();
    const daysSinceLastWin = item.lastWin 
      ? differenceInDays(now, new Date(item.lastWin))
      : null;

    return {
      id: item.id,
      number: item.number,
      name: item.name,
      multiplier: parseFloat(item.multiplier),
      lastWin: item.lastWin,
      daysSinceLastWin,
      totalWins: item.drawsAsWinner.length,
      recentWins: item.drawsAsWinner.map(d => ({
        drawId: d.id,
        drawDate: d.drawDate,
        drawTime: d.drawTime
      }))
    };
  }
}

export default new PrewinnerOptimizerService();
