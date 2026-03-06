import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { startOfDay, endOfDay, differenceInDays, differenceInHours } from 'date-fns';
import { startOfDayInCaracas, endOfDayInCaracas } from '../lib/dateUtils.js';

/**
 * Servicio de Optimización de Pre-Ganadores v2
 * 
 * MEJORAS v2:
 * - Usa historial REAL de sorteos en vez de lastWin (que puede estar desactualizado)
 * - Agrega restricción de COOLDOWN (no repetir en N días)
 * - Considera ganadores de AYER para penalización de secuencias
 * - Selección ponderada del top N para variedad natural
 * 
 * Algoritmo multi-criterio que considera:
 * 
 * 1. RESTRICCIONES DURAS (eliminatorias):
 *    - Pago total (directo + tripletas) <= monto máximo configurado
 *    - Item no usado hoy (ni preseleccionado ni ganador)
 *    - Item no usado en los últimos 7 días
 *    - Para TRIPLE: centena no usada hoy
 *    - No debe causar pérdidas (pago total <= ventas totales)
 * 
 * 2. CRITERIOS DE SCORING (optimización):
 *    - Tiempo sin ganar (usando historial real)
 *    - Evitar secuencias (incluyendo día anterior)
 *    - Penalizar ganadores muy recientes (cooldown suave)
 *    - Minimizar impacto de tripletas
 *    - Maximizar tickets ganadores
 */
class PrewinnerOptimizerService {
  
  /**
   * Pesos para cada criterio de scoring (v4 - Terminal diversity + variedad)
   */
  static WEIGHTS = {
    DAYS_SINCE_WIN: 0.20,           // Tiempo sin ganar (historial real)
    SEQUENTIAL_PENALTY: 0.15,       // Evitar secuencias (incluyendo día anterior)
    RECENCY_PENALTY: 0.10,          // Penalizar ganadores muy recientes
    TICKET_COUNT: 0.10,             // Maximizar tickets ganadores
    TRIPLETA_RISK: 0.20,            // Minimizar riesgo de tripletas
    TERMINAL_DIVERSITY: 0.15,       // Diversidad de terminales (últimos 2 dígitos)
    CENTENA_SPREAD: 0.10            // Diversidad de centenas
  };

  /**
   * Configuración por defecto
   */
  static DEFAULTS = {
    MAX_PAYOUT_PERCENTAGE: 70,      // Porcentaje máximo de ventas a repartir
    MAX_PAYOUT_FIXED: null,         // Monto fijo máximo (prioridad sobre porcentaje)
    SEQUENTIAL_WINDOW: 5,           // Cuántos sorteos atrás revisar para patrones
    MAX_DAYS_BONUS: 10,             // Días máx para normalizar score
    MIN_CENTENA_SEPARATION: 2,      // Mínima separación entre centenas (AUMENTADA)
    COOLDOWN_DAYS: 2,               // Días mínimos antes de repetir un número
    VARIETY_POOL_SIZE: 5,           // Del top N, seleccionar con peso para variedad
    TRIPLETA_BLOCK_THRESHOLD: 0.50, // Bloquear si tripleta pagaría más del 50% del maxPayout
    TRIPLETA_PARTIAL_PENALTY: 0.3,  // Penalización por tripletas parciales
    TERMINAL_COOLDOWN_DRAWS: 3      // No repetir misma terminal en N sorteos consecutivos
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
      logger.info(`  💰 Ventas: $${context.totalSales.toFixed(2)}, Máx pago: $${constraints.maxPayout.toFixed(2)}${context.terminalContext ? ` (+ Terminal vinculado)` : ''}`);

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

      // 6. Ordenar por score y seleccionar con variedad ponderada
      candidates.sort((a, b) => b.finalScore - a.finalScore);

      // Selección ponderada del top pool para introducir variedad natural
      const poolSize = Math.min(PrewinnerOptimizerService.DEFAULTS.VARIETY_POOL_SIZE, candidates.length);
      const pool = candidates.slice(0, poolSize);
      const selected = this.weightedRandomSelect(pool);

      const elapsed = Date.now() - startTime;
      logger.info(`  ✅ Seleccionado: ${selected.item.number} (${selected.item.name})`);
      logger.info(`     Score: ${selected.finalScore.toFixed(4)} (pool top ${poolSize})`);
      logger.info(`     Terminal: ${String(parseInt(selected.item.number) % 100).padStart(2, '0')}`);
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
          poolSize,
          selected: {
            number: selected.item.number,
            name: selected.item.name,
            ticketCount: selected.ticketCount,
            salesAmount: selected.salesAmount,
            potentialPayout: selected.potentialPayout,
            tripletaPayout: selected.tripletaImpact.totalPrize,
            terminalPayout: selected.terminalPayout || 0,
            totalPayout: selected.totalPayout,
            daysSinceWin: selected.daysSinceWin,
            scores: selected.scores,
            finalScore: selected.finalScore
          },
          topAlternatives: candidates.slice(0, 6).map(c => ({
            number: c.item.number,
            name: c.item.name,
            terminal: String(parseInt(c.item.number) % 100).padStart(2, '0'),
            ticketCount: c.ticketCount,
            finalScore: c.finalScore.toFixed(4)
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

    // Cargar tripletas activas (locales + externas de SRQ)
    // Construir fecha/hora completa del sorteo
    const drawDateTime = new Date(draw.drawDate);
    const [hours, minutes] = draw.drawTime.split(':');
    drawDateTime.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // 1. Tripletas LOCALES (TripleBet)
    const localTripletas = await prisma.tripleBet.findMany({
      where: {
        gameId: draw.gameId,
        status: 'ACTIVE',
        expiresAt: { gte: drawDateTime }
      }
    });

    // 2. Tripletas EXTERNAS de SRQ (Ticket con type TRIPLETA)
    // Buscar tripletas que estén en su rango de validez (drawsCount sorteos desde startDraw)
    const gameConfig = draw.game.config || {};
    const tripletaDrawsCount = gameConfig.tripleta?.drawsCount || 10;

    // Obtener todos los sorteos necesarios para calcular rangos de tripletas
    // Necesitamos sorteos pasados también porque las tripletas pueden haber iniciado antes
    // Las tripletas tienen validez de ~10 sorteos, que pueden abarcar varios días
    const drawDateMinusDays = new Date(draw.drawDate);
    drawDateMinusDays.setDate(drawDateMinusDays.getDate() - 7); // 7 días atrás para cubrir todas las tripletas activas
    
    const allDrawsForRange = await prisma.draw.findMany({
      where: {
        gameId: draw.gameId,
        drawDate: { gte: drawDateMinusDays }
      },
      orderBy: [
        { drawDate: 'asc' },
        { drawTime: 'asc' }
      ],
      select: {
        id: true,
        drawDate: true,
        drawTime: true
      }
    });

    const externalTripletaTickets = await prisma.ticket.findMany({
      where: {
        source: 'EXTERNAL_API',
        providerData: {
          path: ['type'],
          equals: 'TRIPLETA'
        },
        status: 'ACTIVE',
        draw: {
          gameId: draw.gameId
        }
      },
      include: {
        draw: true,
        details: {
          include: {
            gameItem: true
          }
        }
      }
    });

    // Convertir tripletas externas a formato compatible con TripleBet
    const externalTripletas = [];
    for (const ticket of externalTripletaTickets) {
      const details = ticket.details;
      const sortedDetails = details.sort((a, b) => a.id.localeCompare(b.id));
      
      // Encontrar el índice del sorteo inicial en la lista de sorteos
      const startDrawIndex = allDrawsForRange.findIndex(d => d.id === ticket.drawId);
      if (startDrawIndex === -1) continue; // Sorteo inicial no encontrado
      
      // Calcular el sorteo final (startDraw + drawsCount sorteos)
      const endDrawIndex = Math.min(startDrawIndex + tripletaDrawsCount - 1, allDrawsForRange.length - 1);
      const endDraw = allDrawsForRange[endDrawIndex];
      
      // Construir expiresAt como fecha/hora del último sorteo válido
      const expiresDate = new Date(endDraw.drawDate);
      const [hours, minutes] = endDraw.drawTime.split(':');
      expiresDate.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // Solo incluir si el sorteo actual está dentro del rango
      const currentDrawIndex = allDrawsForRange.findIndex(d => d.id === draw.id);
      if (currentDrawIndex >= startDrawIndex && currentDrawIndex <= endDrawIndex) {
        externalTripletas.push({
          id: ticket.id,
          gameId: draw.gameId,
          item1Id: sortedDetails[0]?.gameItemId,
          item2Id: sortedDetails[1]?.gameItemId,
          item3Id: sortedDetails[2]?.gameItemId,
          amount: ticket.totalAmount,
          multiplier: sortedDetails[0]?.multiplier || 50,
          status: 'ACTIVE',
          startDrawId: ticket.drawId,
          expiresAt: expiresDate,
          drawsCount: tripletaDrawsCount,
          source: 'EXTERNAL_API'
        });
      }
    }

    // Combinar ambas listas
    const activeTripletas = [...localTripletas, ...externalTripletas];
    
    logger.info(`  📊 Tripletas activas: ${localTripletas.length} locales + ${externalTripletas.length} externas = ${activeTripletas.length} total`);

    // Cargar datos de Terminal vinculado (para evaluar pago combinado)
    let terminalContext = null;
    if (draw.game.type === 'TRIPLE') {
      terminalContext = await this.loadTerminalContext(draw);
    }

    // Obtener items usados hoy
    const usedItemsToday = await this.getUsedItemsToday(draw.gameId, draw.drawDate);

    // Obtener centenas usadas hoy (solo para TRIPLE)
    const usedCentenasToday = draw.game.type === 'TRIPLE'
      ? await this.getUsedCentenasToday(draw.gameId, draw.drawDate)
      : new Set();

    // Obtener items usados en los últimos 7 días
    const usedItemsLast7Days = await this.getUsedItemsLast7Days(draw.gameId, draw.drawDate);

    // Obtener terminales usadas hoy y recientemente (para diversidad de últimos 2 dígitos)
    let usedTerminalsToday = new Set();
    let recentTerminals = [];
    if (draw.game.type === 'TRIPLE') {
      const terminalHistory = await this.getTerminalHistory(draw.gameId, draw.drawDate);
      usedTerminalsToday = terminalHistory.usedToday;
      recentTerminals = terminalHistory.recent;
    }

    return {
      draw,
      game: draw.game,
      gameItems,
      tickets,
      totalSales,
      salesByItem,
      activeTripletas,
      usedItemsToday,
      usedCentenasToday,
      usedItemsLast7Days,
      usedTerminalsToday,
      recentTerminals,
      terminalContext
    };
  }

  /**
   * Cargar contexto de Terminal vinculado para evaluar pago combinado
   * @param {Object} draw - Sorteo Triple con game incluido
   * @returns {Object|null} { terminalGame, terminalDraw, salesByTerminalNumber }
   */
  async loadTerminalContext(draw) {
    try {
      // Buscar juegos TERMINAL vinculados
      const terminalGames = await prisma.game.findMany({
        where: { linkedGameId: draw.gameId, type: 'TERMINAL', isActive: true }
      });

      if (terminalGames.length === 0) return null;

      const results = [];
      for (const tg of terminalGames) {
        // Buscar sorteo Terminal para misma fecha/hora
        const terminalDraw = await prisma.draw.findFirst({
          where: {
            gameId: tg.id,
            drawDate: draw.drawDate,
            drawTime: draw.drawTime,
            status: 'SCHEDULED'
          },
          include: {
            tickets: { include: { details: { include: { gameItem: true } } } }
          }
        });

        if (!terminalDraw) continue;

        // Agrupar ventas por número terminal (2 dígitos)
        const salesByNumber = new Map();
        for (const ticket of terminalDraw.tickets) {
          for (const detail of ticket.details) {
            const num = detail.gameItem.number; // "00"-"99"
            const existing = salesByNumber.get(num) || 0;
            salesByNumber.set(num, existing + parseFloat(detail.amount));
          }
        }

        // Cargar multiplicador de un item para referencia
        const sampleItem = await prisma.gameItem.findFirst({
          where: { gameId: tg.id }
        });
        const multiplier = sampleItem ? parseFloat(sampleItem.multiplier) : 50;

        results.push({ terminalGame: tg, terminalDraw, salesByNumber, multiplier });
      }

      return results.length > 0 ? results : null;
    } catch (error) {
      logger.warn(`[OPTIMIZER] Error cargando Terminal context: ${error.message}`);
      return null;
    }
  }

  /**
   * Calcular pago Terminal para un número Triple dado
   * @param {Array} terminalContexts - Array de contextos Terminal
   * @param {string} tripleNumber - Número Triple (e.g. "123")
   * @returns {number} Pago total Terminal
   */
  calculateTerminalPayout(terminalContexts, tripleNumber) {
    if (!terminalContexts) return 0;
    const terminalNumber = tripleNumber.slice(-2); // "123" → "23"
    let totalPayout = 0;
    for (const ctx of terminalContexts) {
      const sales = ctx.salesByNumber.get(terminalNumber) || 0;
      totalPayout += sales * ctx.multiplier;
    }
    return totalPayout;
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
    const { game, totalSales, terminalContext } = context;
    const config = game.config || {};

    // Incluir ventas Terminal en el total combinado
    let terminalSales = 0;
    if (terminalContext) {
      for (const ctx of terminalContext) {
        for (const amount of ctx.salesByNumber.values()) {
          terminalSales += amount;
        }
      }
    }
    const combinedSales = totalSales + terminalSales;

    // Monto máximo a repartir
    // Prioridad: 1) maxPayoutFixed, 2) percentageToDistribute de ventas
    let maxPayout;

    if (config.maxPayoutFixed && config.maxPayoutFixed > 0) {
      // Monto fijo configurado en el juego
      maxPayout = parseFloat(config.maxPayoutFixed);
    } else {
      // Porcentaje de las ventas combinadas (Triple + Terminal)
      const percentage = config.percentageToDistribute || PrewinnerOptimizerService.DEFAULTS.MAX_PAYOUT_PERCENTAGE;
      maxPayout = (combinedSales * percentage) / 100;
    }

    // Nunca pagar más de lo que se vendió (combinado)
    maxPayout = Math.min(maxPayout, combinedSales);

    return {
      maxPayout,
      maxPayoutSource: config.maxPayoutFixed ? 'fixed' : 'percentage',
      totalSales: combinedSales,
      tripleSales: totalSales,
      terminalSales,
      gameType: game.type
    };
  }

  /**
   * Obtener historial de sorteos para detectar patrones
   * v2: Incluye ganadores de ayer para secuencias inter-día
   */
  async getDrawHistory(context) {
    const { draw, game } = context;
    
    // Obtener últimos N sorteos ejecutados del mismo juego
    const recentDraws = await prisma.draw.findMany({
      where: {
        gameId: game.id,
        status: 'DRAWN',
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
      take: 50, // Aumentado para mejor historial
      include: {
        winnerItem: true
      }
    });

    // Extraer números ganadores recientes con más info
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

    // v2: Obtener ganadores de AYER para secuencias inter-día
    const yesterday = new Date(draw.drawDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDraws = recentDraws.filter(d => 
      d.drawDate.getTime() === yesterday.getTime()
    );

    // Crear mapa de última victoria por item (usando historial real)
    const lastWinByItemId = new Map();
    for (const d of recentDraws) {
      if (!lastWinByItemId.has(d.winnerItemId)) {
        lastWinByItemId.set(d.winnerItemId, {
          date: d.drawDate,
          time: d.drawTime
        });
      }
    }

    return {
      recentWinners,
      recentDraws,
      todayWinners: todayDraws.map(d => parseInt(d.winnerItem.number)),
      yesterdayWinners: yesterdayDraws.map(d => ({
        number: parseInt(d.winnerItem.number),
        time: d.drawTime
      })),
      lastWinByItemId,
      totalRecentDraws: recentDraws.length
    };
  }

  /**
   * Evaluar todos los items candidatos
   */
  async evaluateCandidates(context, constraints, history) {
    const { gameItems, salesByItem, usedItemsToday, usedCentenasToday, usedItemsLast7Days, activeTripletas, draw, terminalContext, usedTerminalsToday, recentTerminals } = context;

    // Ventas combinadas (Triple + Terminal) para verificar pérdidas
    let combinedSales = context.totalSales;
    if (terminalContext) {
      for (const ctx of terminalContext) {
        for (const amount of ctx.salesByNumber.values()) {
          combinedSales += amount;
        }
      }
    }
    const candidates = [];

    for (const item of gameItems) {
      // === RESTRICCIONES DURAS ===

      // 1. No puede haber sido usado hoy
      if (usedItemsToday.has(item.id)) {
        continue;
      }

      // 2. Para TRIPLE PANTERA: No puede haber salido en los últimos 7 días
      if (context.game.type === 'TRIPLE' && usedItemsLast7Days.has(item.id)) {
        continue;
      }

      // 3. Para TRIPLE PANTERA: centena no puede haber sido usada hoy
      if (context.game.type === 'TRIPLE') {
        const centena = Math.floor(parseInt(item.number) / 100);
        if (usedCentenasToday.has(centena)) {
          continue;
        }
      }

      // 3b. Para TRIPLE PANTERA: centena no puede ser adyacente a la última usada hoy
      if (context.game.type === 'TRIPLE' && usedCentenasToday.size > 0) {
        const centena = Math.floor(parseInt(item.number) / 100);
        let tooClose = false;
        for (const usedCentena of usedCentenasToday) {
          if (Math.abs(centena - usedCentena) < PrewinnerOptimizerService.DEFAULTS.MIN_CENTENA_SEPARATION) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
      }

      // 3c. Para TRIPLE: terminal (últimos 2 dígitos) no debe repetirse en últimos N sorteos
      if (context.game.type === 'TRIPLE' && recentTerminals && recentTerminals.length > 0) {
        const terminal = parseInt(item.number) % 100;
        const cooldownDraws = PrewinnerOptimizerService.DEFAULTS.TERMINAL_COOLDOWN_DRAWS;
        const recentSlice = recentTerminals.slice(0, cooldownDraws);
        if (recentSlice.includes(terminal)) {
          continue;
        }
      }

      // Obtener datos de ventas para este item
      const sales = salesByItem.get(item.id) || { amount: 0, count: 0 };
      const potentialPayout = parseFloat(sales.amount) * parseFloat(item.multiplier);

      // 4. Calcular impacto de tripletas
      const tripletaImpact = await this.calculateTripletaImpact(
        context.game.id,
        item.id,
        draw.id,
        activeTripletas
      );

      // Pago Terminal vinculado (últimos 2 dígitos)
      const terminalPayout = this.calculateTerminalPayout(terminalContext, item.number);

      // Pago total incluyendo tripletas + Terminal
      const totalPayout = potentialPayout + tripletaImpact.totalPrize + terminalPayout;

      // 5. No puede exceder el máximo a pagar
      if (totalPayout > constraints.maxPayout) {
        continue;
      }

      // 6. No puede causar pérdidas (pagar más de lo vendido combinado Triple+Terminal)
      if (totalPayout > combinedSales) {
        continue;
      }

      // 7. RESTRICCIÓN DURA DE TRIPLETAS: Si completaría AL MENOS 1 tripleta, BLOQUEAR
      if (tripletaImpact.completedCount > 0) {
        logger.debug(`  ❌ Bloqueado ${item.number}: completaría ${tripletaImpact.completedCount} tripleta(s) por $${tripletaImpact.totalPrize.toFixed(2)}`);
        continue;
      }

      // === PASÓ TODAS LAS RESTRICCIONES - CALCULAR SCORES ===

      // Días desde última victoria usando HISTORIAL REAL
      const lastWinInfo = history.lastWinByItemId.get(item.id);
      const daysSinceWin = lastWinInfo
        ? differenceInDays(draw.drawDate, new Date(lastWinInfo.date))
        : 365;

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
        terminalPayout,
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
   * v4: Terminal diversity + centena spread + improved variety
   */
  calculateScores(item, sales, totalPayout, tripletaImpact, daysSinceWin, history, constraints, context) {
    const scores = {};
    const cooldownDays = PrewinnerOptimizerService.DEFAULTS.COOLDOWN_DAYS;

    // 1. TICKET_COUNT - Maximizar cantidad de tickets ganadores
    const maxTickets = Math.max(...Array.from(context.salesByItem.values()).map(s => s.count), 1);
    scores.ticketCount = sales.count / maxTickets;

    // 2. DAYS_SINCE_WIN - Preferir items que no han ganado hace más tiempo
    const maxDays = PrewinnerOptimizerService.DEFAULTS.MAX_DAYS_BONUS;
    scores.daysSinceWin = Math.min(daysSinceWin / maxDays, 1);

    // 3. SEQUENTIAL_PENALTY - Penalizar números sucesivos (incluyendo ayer)
    scores.sequential = this.calculateSequentialScore(item, history);

    // 4. RECENCY_PENALTY - Penalizar ganadores muy recientes (cooldown suave)
    if (daysSinceWin < cooldownDays && daysSinceWin < 365) {
      scores.recency = 0.05 + (daysSinceWin / cooldownDays) * 0.1;
    } else if (daysSinceWin < cooldownDays + 3) {
      scores.recency = 0.3 + ((daysSinceWin - cooldownDays) / 3) * 0.3;
    } else {
      scores.recency = Math.min(1, 0.6 + (daysSinceWin - cooldownDays - 3) / 10);
    }

    // 5. TRIPLETA_RISK - Penalizar items en tripletas parciales
    let tripletaScore = 1.0;
    if (tripletaImpact.completedCount > 0) {
      const tripletaRatio = tripletaImpact.totalPrize / (constraints.maxPayout || 1);
      tripletaScore = Math.max(0, 1 - tripletaRatio * 2);
    } else if (tripletaImpact.count > 0) {
      const partialPenalty = PrewinnerOptimizerService.DEFAULTS.TRIPLETA_PARTIAL_PENALTY;
      const highRiskPartials = tripletaImpact.details.filter(d => d.remainingNumbers === 2).length;
      const mediumRiskPartials = tripletaImpact.details.filter(d => d.remainingNumbers === 1).length;
      const partialPenaltyAmount = (mediumRiskPartials * partialPenalty * 2) + (highRiskPartials * partialPenalty);
      tripletaScore = Math.max(0.2, 1 - Math.min(partialPenaltyAmount, 0.8));
    }
    scores.tripletaRisk = tripletaScore;

    // 6. TERMINAL_DIVERSITY - Diversidad de terminales (últimos 2 dígitos)
    // Penalizar si el terminal (últimos 2 dígitos) es similar a los recientes
    if (context.game.type === 'TRIPLE' && context.recentTerminals && context.recentTerminals.length > 0) {
      const terminal = parseInt(item.number) % 100;
      const decena = Math.floor(terminal / 10); // 0-9 decenas

      // Penalizar si decena ya fue usada hoy (ej: 05 y 04 están en decena 0)
      const recentDecenas = context.recentTerminals.map(t => Math.floor(t / 10));
      const todayDecenas = [...(context.usedTerminalsToday || [])].map(t => Math.floor(t / 10));
      const decenasUsedToday = new Set(todayDecenas);

      let terminalScore = 1.0;

      // Fuerte penalización si misma decena ya salió hoy
      if (decenasUsedToday.has(decena)) {
        terminalScore -= 0.5;
      }

      // Penalización por proximidad a terminales recientes
      for (let i = 0; i < Math.min(context.recentTerminals.length, 5); i++) {
        const diff = Math.abs(terminal - context.recentTerminals[i]);
        const weight = 1 / (i + 1); // Más peso a los más recientes
        if (diff === 0) {
          terminalScore -= 0.4 * weight; // Mismo terminal
        } else if (diff <= 3) {
          terminalScore -= 0.2 * weight; // Terminal muy cercano
        } else if (diff <= 10) {
          terminalScore -= 0.05 * weight; // Terminal cercano
        }
      }

      // Bonus por distancia al terminal más reciente
      if (context.recentTerminals.length > 0) {
        const lastTerminal = context.recentTerminals[0];
        const distance = Math.abs(terminal - lastTerminal);
        // Normalizar: máxima distancia posible es ~50 (en un rango de 00-99)
        terminalScore += Math.min(distance / 50, 0.3);
      }

      scores.terminalDiversity = Math.max(0, Math.min(1, terminalScore));
    } else {
      scores.terminalDiversity = 0.5; // Neutral si no aplica
    }

    // 7. CENTENA_SPREAD - Diversidad de centenas
    if (context.game.type === 'TRIPLE' && context.usedCentenasToday.size > 0) {
      const centena = Math.floor(parseInt(item.number) / 100);
      // Calcular distancia mínima a cualquier centena usada hoy
      let minDistance = 10; // Max possible
      for (const usedCentena of context.usedCentenasToday) {
        minDistance = Math.min(minDistance, Math.abs(centena - usedCentena));
      }
      // Normalizar: distancia 0=0, distancia 5+=1
      scores.centenaSpread = Math.min(minDistance / 5, 1);
    } else {
      scores.centenaSpread = 0.5; // Neutral
    }

    return scores;
  }

  /**
   * Calcular score de secuencialidad (evitar 01, 02, 03)
   * v2: Incluye ganadores de ayer para evitar secuencias inter-día
   */
  calculateSequentialScore(item, history) {
    const itemNumber = parseInt(item.number);
    const { todayWinners, yesterdayWinners, recentWinners } = history;

    let sequentialPenalty = 0;

    // Revisar ganadores de HOY para detectar secuencias
    for (const winnerNum of todayWinners) {
      const diff = Math.abs(itemNumber - winnerNum);
      if (diff === 1) {
        sequentialPenalty += 0.5; // Número consecutivo directo - penalización fuerte
      } else if (diff === 2) {
        sequentialPenalty += 0.25; // Casi consecutivo
      }
    }

    // v2: Revisar ÚLTIMO ganador de AYER para evitar secuencias inter-día
    // (ej: ayer terminó con 35, hoy no debería empezar con 34 o 36)
    if (yesterdayWinners && yesterdayWinners.length > 0) {
      // Ordenar por hora para obtener el último
      const sortedYesterday = [...yesterdayWinners].sort((a, b) => 
        (b.time || '').localeCompare(a.time || '')
      );
      const lastYesterday = sortedYesterday[0];
      
      if (lastYesterday) {
        const diff = Math.abs(itemNumber - lastYesterday.number);
        if (diff === 1) {
          sequentialPenalty += 0.4; // Consecutivo al último de ayer
        }
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
   * v4: Incluye terminal diversity y centena spread
   */
  calculateFinalScore(scores) {
    const weights = PrewinnerOptimizerService.WEIGHTS;

    return (
      (scores.daysSinceWin * weights.DAYS_SINCE_WIN) +
      (scores.sequential * weights.SEQUENTIAL_PENALTY) +
      (scores.recency * weights.RECENCY_PENALTY) +
      (scores.ticketCount * weights.TICKET_COUNT) +
      (scores.tripletaRisk * weights.TRIPLETA_RISK) +
      (scores.terminalDiversity * weights.TERMINAL_DIVERSITY) +
      (scores.centenaSpread * weights.CENTENA_SPREAD)
    );
  }

  /**
   * Selección ponderada del pool de candidatos
   * Los candidatos con mayor score tienen más probabilidad pero no es determinístico
   * Esto introduce variedad natural sin sacrificar la calidad de selección
   */
  weightedRandomSelect(pool) {
    if (pool.length === 1) return pool[0];

    // Usar scores como pesos, elevados al cuadrado para favorecer top scores
    // pero sin hacerlo determinístico
    const minScore = Math.min(...pool.map(c => c.finalScore));
    const weights = pool.map(c => Math.pow(c.finalScore - minScore + 0.01, 2));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const rand = Math.random() * totalWeight;
    let cumulative = 0;
    for (let i = 0; i < pool.length; i++) {
      cumulative += weights[i];
      if (rand <= cumulative) {
        return pool[i];
      }
    }

    return pool[0]; // Fallback
  }

  /**
   * Calcular impacto en tripletas si un item gana
   * v3: Maneja tanto tripletas locales (TripleBet) como externas (SRQ)
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

      // Obtener el sorteo actual para referencia de fecha
      const currentDraw = await prisma.draw.findUnique({
        where: { id: drawId }
      });

      for (const tripleta of relevantTripletas) {
        const prize = parseFloat(tripleta.amount) * parseFloat(tripleta.multiplier);
        const itemIds = [tripleta.item1Id, tripleta.item2Id, tripleta.item3Id];

        // AMBAS tripletas (locales y externas) tienen rango de sorteos definido
        const startDraw = await prisma.draw.findUnique({
          where: { id: tripleta.startDrawId }
        });

        if (!startDraw) continue;

        // Calcular fecha de expiración
        const expiresDate = tripleta.expiresAt 
          ? new Date(tripleta.expiresAt).toISOString().split('T')[0] + 'T00:00:00.000Z'
          : currentDraw.drawDate.toISOString().split('T')[0] + 'T23:59:59.999Z';
        
        // Obtener sorteos ejecutados en el rango de la tripleta
        const executedDraws = await prisma.draw.findMany({
          where: {
            gameId,
            OR: [
              { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
              { drawDate: { gt: startDraw.drawDate, lte: expiresDate } }
            ],
            status: 'DRAWN',
            winnerItemId: { not: null }
          },
          select: { id: true, winnerItemId: true }
        });
        
        const winnerItemIds = executedDraws.map(d => d.winnerItemId);

        // Verificar si este item es el que falta para completar
        const otherItems = itemIds.filter(id => id !== itemId);
        const otherItemsWon = otherItems.every(id => winnerItemIds.includes(id));

        // Si los otros 2 ya salieron, este item completaría la tripleta
        const wouldComplete = otherItemsWon && !winnerItemIds.includes(itemId);

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
          remainingNumbers: 3 - numbersHit,
          source: tripleta.source || 'LOCAL'
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
   * Obtener items usados en los últimos 7 días (preseleccionados o ganadores)
   */
  async getUsedItemsLast7Days(gameId, referenceDate) {
    // Calcular fecha de hace 7 días
    const sevenDaysAgo = new Date(referenceDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const drawsLast7Days = await prisma.draw.findMany({
      where: {
        gameId,
        drawDate: {
          gte: sevenDaysAgo,
          lte: referenceDate
        },
        OR: [
          { preselectedItemId: { not: null } },
          { winnerItemId: { not: null } }
        ]
      },
      select: {
        preselectedItemId: true,
        winnerItemId: true,
        drawDate: true
      }
    });

    const usedItems = new Set();
    for (const draw of drawsLast7Days) {
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
   * Obtener historial de terminales (últimos 2 dígitos) usados hoy y recientemente
   * Se usa para el juego TRIPLE para asegurar diversidad en los terminales que cascadan a TERMINAL
   */
  async getTerminalHistory(gameId, referenceDate) {
    // Obtener sorteos de hoy con ganador/preseleccionado
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
      },
      orderBy: { drawTime: 'asc' }
    });

    const usedToday = new Set();
    const recent = []; // Ordered list of recent terminal numbers

    for (const draw of drawsToday) {
      const item = draw.winnerItem || draw.preselectedItem;
      if (item) {
        const terminal = parseInt(item.number) % 100;
        usedToday.add(terminal);
        recent.push(terminal);
      }
    }

    // Also get last 3 days for broader terminal diversity
    const threeDaysAgo = new Date(referenceDate);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const recentDraws = await prisma.draw.findMany({
      where: {
        gameId,
        drawDate: { gte: threeDaysAgo, lt: referenceDate },
        winnerItemId: { not: null }
      },
      include: { winnerItem: true },
      orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }]
    });

    for (const draw of recentDraws) {
      if (draw.winnerItem) {
        recent.push(parseInt(draw.winnerItem.number) % 100);
      }
    }

    return { usedToday, recent };
  }

  /**
   * Selección aleatoria inteligente (cuando no hay ventas)
   * v2: Usa historial real y aplica cooldown
   */
  async selectRandomIntelligent(context) {
    const { gameItems, usedItemsToday, usedCentenasToday, usedItemsLast7Days, recentTerminals, game, draw } = context;
    const history = await this.getDrawHistory(context);
    const cooldownDays = PrewinnerOptimizerService.DEFAULTS.COOLDOWN_DAYS;

    // Filtrar items válidos
    let validItems = gameItems.filter(item => {
      // No usado hoy
      if (usedItemsToday.has(item.id)) return false;

      // No usado en últimos 7 días
      if (usedItemsLast7Days && usedItemsLast7Days.has(item.id)) return false;

      // Para TRIPLE, centena no usada y no adyacente
      if (game.type === 'TRIPLE') {
        const centena = Math.floor(parseInt(item.number) / 100);
        if (usedCentenasToday.has(centena)) return false;
        for (const usedCentena of usedCentenasToday) {
          if (Math.abs(centena - usedCentena) < PrewinnerOptimizerService.DEFAULTS.MIN_CENTENA_SEPARATION) return false;
        }
      }

      // Para TRIPLE, terminal no repetido en últimos N sorteos
      if (game.type === 'TRIPLE' && recentTerminals && recentTerminals.length > 0) {
        const terminal = parseInt(item.number) % 100;
        const cooldownDraws = PrewinnerOptimizerService.DEFAULTS.TERMINAL_COOLDOWN_DRAWS;
        if (recentTerminals.slice(0, cooldownDraws).includes(terminal)) return false;
      }

      return true;
    });

    if (validItems.length === 0) {
      validItems = gameItems;
    }

    // v2: Calcular días sin ganar usando historial real
    const itemsWithDays = validItems.map(item => {
      const lastWinInfo = history.lastWinByItemId.get(item.id);
      const daysSinceWin = lastWinInfo 
        ? differenceInDays(draw.drawDate, new Date(lastWinInfo.date))
        : 999;
      return { item, daysSinceWin };
    });

    // v2: Filtrar items en cooldown (ganaron hace menos de N días)
    const outOfCooldown = itemsWithDays.filter(x => x.daysSinceWin >= cooldownDays);
    const itemsToUse = outOfCooldown.length >= 5 ? outOfCooldown : itemsWithDays;

    // Filtrar los que serían sucesivos
    const nonSequential = itemsToUse.filter(x => {
      const itemNumber = parseInt(x.item.number);
      for (const winnerNum of history.todayWinners) {
        if (Math.abs(itemNumber - winnerNum) <= 1) return false;
      }
      // v2: También verificar último de ayer
      if (history.yesterdayWinners && history.yesterdayWinners.length > 0) {
        const sortedYesterday = [...history.yesterdayWinners].sort((a, b) => 
          (b.time || '').localeCompare(a.time || '')
        );
        const lastYesterday = sortedYesterday[0];
        if (lastYesterday && Math.abs(itemNumber - lastYesterday.number) <= 1) {
          return false;
        }
      }
      return true;
    });

    // Si hay suficientes items no sucesivos, usar esos
    const itemsToSort = nonSequential.length >= 5 ? nonSequential : itemsToUse;

    // Ordenar por días sin ganar (más tiempo = primero)
    itemsToSort.sort((a, b) => b.daysSinceWin - a.daysSinceWin);

    // Tomar del top 30%
    const topCount = Math.max(Math.floor(itemsToSort.length * 0.3), 5);
    const topItems = itemsToSort.slice(0, topCount);
    
    // Selección ponderada por días sin ganar
    const totalDays = topItems.reduce((sum, x) => sum + x.daysSinceWin, 0);
    let random = Math.random() * totalDays;
    
    for (const x of topItems) {
      random -= x.daysSinceWin;
      if (random <= 0) {
        return x.item;
      }
    }
    
    return topItems[0].item;
  }

  /**
   * Selección de fallback cuando no hay candidatos válidos
   * v2: Usa historial real y aplica cooldown suave
   * v3: Verifica tripletas para evitar seleccionar números que las completarían
   */
  async selectFallback(context, constraints) {
    const { gameItems, usedItemsToday, game, draw, activeTripletas } = context;
    const history = await this.getDrawHistory(context);
    const cooldownDays = PrewinnerOptimizerService.DEFAULTS.COOLDOWN_DAYS;
    
    // Solo mantener restricción de no usado hoy
    let validItems = gameItems.filter(item => !usedItemsToday.has(item.id));
    
    if (validItems.length === 0) {
      validItems = gameItems;
    }

    // v2: Calcular días sin ganar usando historial real
    const itemsWithDays = validItems.map(item => {
      const lastWinInfo = history.lastWinByItemId.get(item.id);
      const daysSinceWin = lastWinInfo 
        ? differenceInDays(draw.drawDate, new Date(lastWinInfo.date))
        : 999;
      return { item, daysSinceWin };
    });

    // Filtrar números sucesivos con los ganadores de hoy
    const nonSequential = itemsWithDays.filter(x => {
      const itemNumber = parseInt(x.item.number);
      for (const winnerNum of history.todayWinners) {
        if (Math.abs(itemNumber - winnerNum) <= 1) return false;
      }
      return true;
    });

    // Si hay items no sucesivos, usar esos
    let candidatePool = nonSequential.length > 0 ? nonSequential : itemsWithDays;

    // v3: CRÍTICO - Filtrar números que completarían tripletas
    const candidatesWithoutTripletaRisk = [];
    for (const candidate of candidatePool) {
      const tripletaImpact = await this.calculateTripletaImpact(
        game.id,
        candidate.item.id,
        draw.id,
        activeTripletas
      );
      
      // Solo incluir si NO completaría tripletas
      if (tripletaImpact.completedCount === 0) {
        candidatesWithoutTripletaRisk.push(candidate);
      } else {
        logger.debug(`  ⚠️ Fallback: Descartando ${candidate.item.number} - completaría ${tripletaImpact.completedCount} tripleta(s) por $${tripletaImpact.totalPrize.toFixed(2)}`);
      }
    }

    // Si hay candidatos sin riesgo de tripleta, usar esos
    if (candidatesWithoutTripletaRisk.length > 0) {
      candidatePool = candidatesWithoutTripletaRisk;
      logger.info(`  ✅ Fallback: ${candidatePool.length} candidatos sin riesgo de tripleta`);
    } else {
      logger.warn(`  ⚠️ Fallback: TODOS los candidatos completarían tripletas - usando el de menor riesgo`);
      // Si todos completan tripletas, ordenar por menor riesgo
      const candidatesWithRisk = [];
      for (const candidate of candidatePool) {
        const tripletaImpact = await this.calculateTripletaImpact(
          game.id,
          candidate.item.id,
          draw.id,
          activeTripletas
        );
        candidatesWithRisk.push({ ...candidate, tripletaImpact });
      }
      candidatesWithRisk.sort((a, b) => a.tripletaImpact.totalPrize - b.tripletaImpact.totalPrize);
      candidatePool = candidatesWithRisk;
    }

    // v2: Preferir items fuera de cooldown y con más días sin ganar
    candidatePool.sort((a, b) => {
      // Primero: fuera de cooldown antes que dentro
      const aInCooldown = a.daysSinceWin < cooldownDays && a.daysSinceWin < 999;
      const bInCooldown = b.daysSinceWin < cooldownDays && b.daysSinceWin < 999;
      if (aInCooldown !== bInCooldown) return aInCooldown ? 1 : -1;
      
      // Segundo: más días sin ganar
      return b.daysSinceWin - a.daysSinceWin;
    });

    // Tomar el top 30%
    const topCount = Math.max(Math.floor(candidatePool.length * 0.3), 3);
    const topItems = candidatePool.slice(0, topCount);
    
    // Selección aleatoria del pool
    const randomIndex = Math.floor(Math.random() * topItems.length);
    return topItems[randomIndex].item;
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
            status: 'DRAWN'
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
