/**
 * Script de SIMULACIÓN del algoritmo de pre-ganador MEJORADO v3
 * NO MODIFICA NADA en la base de datos - solo lee y simula
 * 
 * v3: Simula sorteo por sorteo, actualizando el historial simulado
 *     para ver cómo se distribuirían los resultados
 */

import { prisma } from '../src/lib/prisma.js';
import { differenceInDays } from 'date-fns';

// Configuración del algoritmo MEJORADO
const WEIGHTS = {
  DAYS_SINCE_WIN: 0.35,      // Tiempo sin ganar (historial real)
  SEQUENTIAL_PENALTY: 0.25,  // Evitar secuencias
  RECENCY_PENALTY: 0.25,     // Penalizar ganadores muy recientes
  VARIETY: 0.15              // Variedad (no siempre el mismo)
};

const CONFIG = {
  COOLDOWN_DAYS: 2,          // No repetir en 2 días
  MAX_DAYS_BONUS: 10,        // Normalización de días
  VARIETY_POOL_SIZE: 5       // De los top N, seleccionar con peso
};

/**
 * Obtener historial REAL de ganadores
 */
async function getRealWinnerHistory(gameId, beforeDate = null) {
  const where = {
    gameId,
    status: 'DRAWN',
    winnerItemId: { not: null }
  };
  
  if (beforeDate) {
    where.OR = [
      { drawDate: { lt: beforeDate } },
      { drawDate: beforeDate }
    ];
  }

  const draws = await prisma.draw.findMany({
    where,
    include: { winnerItem: true },
    orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }],
    take: 100
  });

  return draws;
}

/**
 * Calcular días desde última victoria
 */
function getDaysSinceWin(itemId, historyDraws, referenceDate) {
  const lastWin = historyDraws.find(d => d.winnerItemId === itemId);
  if (!lastWin) return 999;
  
  return Math.max(0, differenceInDays(new Date(referenceDate), new Date(lastWin.drawDate)));
}

/**
 * Verificar si un item está en cooldown
 */
function isInCooldown(itemId, historyDraws, referenceDate, cooldownDays) {
  const days = getDaysSinceWin(itemId, historyDraws, referenceDate);
  return days < cooldownDays && days < 999;
}

/**
 * Seleccionar con algoritmo mejorado
 */
function selectImproved(gameItems, context) {
  const { 
    historyDraws, 
    simulatedWinnersToday, 
    simulatedWinnersYesterday,
    referenceDate,
    usedTodayIds
  } = context;

  const candidates = [];

  for (const item of gameItems) {
    // RESTRICCIÓN DURA: No usado hoy
    if (usedTodayIds.has(item.id)) continue;

    const itemNum = parseInt(item.number);
    const daysSinceWin = getDaysSinceWin(item.id, historyDraws, referenceDate);
    const inCooldown = daysSinceWin < CONFIG.COOLDOWN_DAYS && daysSinceWin < 999;

    // Score por días sin ganar (normalizado)
    const daysSinceScore = Math.min(daysSinceWin / CONFIG.MAX_DAYS_BONUS, 1);

    // Score de recencia (penalización fuerte si está en cooldown)
    let recencyScore;
    if (inCooldown) {
      recencyScore = 0.1 * (daysSinceWin / CONFIG.COOLDOWN_DAYS);
    } else {
      recencyScore = Math.min(1, 0.5 + (daysSinceWin - CONFIG.COOLDOWN_DAYS) / 10);
    }

    // Score de secuencia
    let seqPenalty = 0;
    
    // Penalizar consecutivos de hoy
    for (const prev of simulatedWinnersToday) {
      const diff = Math.abs(itemNum - prev.number);
      if (diff === 0) seqPenalty += 1.0;
      else if (diff === 1) seqPenalty += 0.6;
      else if (diff === 2) seqPenalty += 0.3;
    }

    // Penalizar consecutivo al último de ayer
    if (simulatedWinnersYesterday.length > 0) {
      const lastYesterday = simulatedWinnersYesterday[simulatedWinnersYesterday.length - 1];
      const diff = Math.abs(itemNum - lastYesterday.number);
      if (diff === 1) seqPenalty += 0.5;
    }

    const seqScore = Math.max(0, 1 - Math.min(seqPenalty, 1));

    // Score final
    const finalScore = 
      (daysSinceScore * WEIGHTS.DAYS_SINCE_WIN) +
      (recencyScore * WEIGHTS.RECENCY_PENALTY) +
      (seqScore * WEIGHTS.SEQUENTIAL_PENALTY) +
      (0.5 * WEIGHTS.VARIETY); // Base variety score

    candidates.push({
      item,
      itemNum,
      daysSinceWin,
      inCooldown,
      scores: { daysSince: daysSinceScore, recency: recencyScore, sequence: seqScore },
      finalScore
    });
  }

  // Ordenar por score
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  // Seleccionar del top N con peso (para variedad)
  const topN = candidates.slice(0, CONFIG.VARIETY_POOL_SIZE);
  if (topN.length === 0) return null;

  // Selección ponderada por score
  const totalScore = topN.reduce((sum, c) => sum + c.finalScore, 0);
  let random = Math.random() * totalScore;
  
  for (const candidate of topN) {
    random -= candidate.finalScore;
    if (random <= 0) {
      return { selected: candidate, allCandidates: candidates };
    }
  }

  return { selected: topN[0], allCandidates: candidates };
}

async function main() {
  console.log('='.repeat(80));
  console.log('SIMULACIÓN COMPLETA v3 - CON HISTORIAL ACTUALIZADO');
  console.log('='.repeat(80));

  // Fechas
  const now = new Date();
  const venezuelaOffset = -4 * 60;
  const localOffset = now.getTimezoneOffset();
  const venezuelaNow = new Date(now.getTime() + (localOffset + venezuelaOffset) * 60 * 1000);

  const today = new Date(venezuelaNow);
  today.setUTCHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  console.log(`\nFecha Venezuela: ${venezuelaNow.toISOString().split('T')[0]}`);

  // Obtener juego
  const game = await prisma.game.findFirst({ where: { slug: 'lotoanimalito' } });
  if (!game) {
    console.log('Juego no encontrado');
    await prisma.$disconnect();
    return;
  }

  // Obtener items
  const gameItems = await prisma.gameItem.findMany({
    where: { gameId: game.id, isActive: true },
    orderBy: { number: 'asc' }
  });

  console.log(`\n${game.name}: ${gameItems.length} items`);

  // Obtener sorteos de ayer y hoy hasta las 12pm
  const draws = await prisma.draw.findMany({
    where: {
      gameId: game.id,
      OR: [
        { drawDate: yesterday },
        { drawDate: today, drawTime: { lte: '12:00:00' } }
      ]
    },
    include: { winnerItem: true, preselectedItem: true },
    orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }]
  });

  console.log(`Sorteos a simular: ${draws.length}`);

  // Obtener historial ANTES de ayer
  const twoDaysAgo = new Date(yesterday);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 1);
  
  const baseHistory = await getRealWinnerHistory(game.id, twoDaysAgo);
  console.log(`Historial base (antes de ayer): ${baseHistory.length} sorteos`);

  // Simular sorteo por sorteo
  console.log('\n' + '='.repeat(80));
  console.log('SIMULACIÓN SORTEO POR SORTEO');
  console.log('='.repeat(80));

  let currentDate = null;
  const simulatedHistory = [...baseHistory]; // Copia del historial
  let simulatedWinnersToday = [];
  let simulatedWinnersYesterday = [];

  const results = [];

  for (const draw of draws) {
    const dateStr = draw.drawDate.toISOString().split('T')[0];

    // Si cambió el día
    if (currentDate !== dateStr) {
      if (currentDate !== null) {
        simulatedWinnersYesterday = [...simulatedWinnersToday];
      }
      simulatedWinnersToday = [];
      currentDate = dateStr;
    }

    // IDs usados hoy (simulados)
    const usedTodayIds = new Set(simulatedWinnersToday.map(w => w.itemId));

    // Resultado ACTUAL
    const actualWinner = draw.winnerItem || draw.preselectedItem;
    const actualNum = actualWinner?.number || 'N/A';

    // Selección con algoritmo MEJORADO
    const context = {
      historyDraws: simulatedHistory,
      simulatedWinnersToday,
      simulatedWinnersYesterday,
      referenceDate: draw.drawDate,
      usedTodayIds
    };

    const result = selectImproved(gameItems, context);
    const improvedWinner = result?.selected;

    // Calcular métricas del resultado actual
    const actualDaysSince = actualWinner 
      ? getDaysSinceWin(actualWinner.id, simulatedHistory, draw.drawDate)
      : 999;
    const actualInCooldown = actualDaysSince < CONFIG.COOLDOWN_DAYS && actualDaysSince < 999;

    // Verificar secuencia del actual
    let actualIsSeq = false;
    if (actualWinner) {
      const aNum = parseInt(actualWinner.number);
      for (const prev of simulatedWinnersToday) {
        if (Math.abs(aNum - prev.number) <= 1) {
          actualIsSeq = true;
          break;
        }
      }
    }

    // Problemas
    const problems = [];
    if (actualInCooldown) problems.push(`COOLDOWN(${actualDaysSince}d)`);
    if (actualIsSeq) problems.push('SECUENCIA');

    // Mostrar
    const icon = problems.length > 0 ? '🔴' : '✅';
    console.log(`\n${icon} ${dateStr} ${draw.drawTime}`);
    console.log(
      `   ACTUAL:   ${actualNum.toString().padStart(2)} (${actualWinner?.name?.padEnd(12) || '?'}) | ` +
      `DíasSin: ${actualDaysSince.toString().padStart(3)} ${problems.length > 0 ? '⚠️ ' + problems.join(' ') : ''}`
    );

    if (improvedWinner) {
      console.log(
        `   MEJORADO: ${improvedWinner.item.number.toString().padStart(2)} (${improvedWinner.item.name.padEnd(12)}) | ` +
        `DíasSin: ${improvedWinner.daysSinceWin.toString().padStart(3)} | ` +
        `Score: ${improvedWinner.finalScore.toFixed(3)}`
      );

      // Mostrar top 3
      const top3 = result.allCandidates.slice(0, 3);
      console.log('   Top 3: ' + top3.map(c => 
        `${c.item.number}(${c.daysSinceWin}d,${c.finalScore.toFixed(2)})`
      ).join(' | '));
    }

    // Guardar resultado
    results.push({
      date: dateStr,
      time: draw.drawTime,
      actual: actualNum,
      actualDaysSince,
      actualProblems: problems,
      improved: improvedWinner?.item.number || 'N/A',
      improvedDaysSince: improvedWinner?.daysSinceWin || 0
    });

    // IMPORTANTE: Agregar el resultado SIMULADO al historial
    // (no el actual, sino lo que habría seleccionado el mejorado)
    if (improvedWinner) {
      // Crear un draw simulado
      const simulatedDraw = {
        id: `sim-${draw.id}`,
        winnerItemId: improvedWinner.item.id,
        winnerItem: improvedWinner.item,
        drawDate: draw.drawDate,
        drawTime: draw.drawTime
      };
      simulatedHistory.unshift(simulatedDraw); // Al inicio (más reciente)

      simulatedWinnersToday.push({
        number: improvedWinner.itemNum,
        itemId: improvedWinner.item.id,
        time: draw.drawTime
      });
    }
  }

  // Resumen
  console.log('\n' + '='.repeat(80));
  console.log('RESUMEN COMPARATIVO');
  console.log('='.repeat(80));

  // Contar problemas
  const problemCount = results.filter(r => r.actualProblems.length > 0).length;
  console.log(`\nSorteos con problemas (actual): ${problemCount}/${results.length}`);

  // Distribución de resultados actuales
  const actualWinners = results.map(r => r.actual).filter(n => n !== 'N/A');
  const actualUnique = new Set(actualWinners);
  console.log(`Números únicos (actual): ${actualUnique.size}`);

  // Distribución de resultados simulados
  const improvedWinners = results.map(r => r.improved).filter(n => n !== 'N/A');
  const improvedUnique = new Set(improvedWinners);
  console.log(`Números únicos (mejorado): ${improvedUnique.size}`);

  // Mostrar distribución
  console.log('\n📊 DISTRIBUCIÓN DE RESULTADOS SIMULADOS (mejorado):');
  const improvedCounts = {};
  for (const num of improvedWinners) {
    improvedCounts[num] = (improvedCounts[num] || 0) + 1;
  }
  const sorted = Object.entries(improvedCounts).sort((a, b) => b[1] - a[1]);
  for (const [num, count] of sorted) {
    const item = gameItems.find(i => i.number === num);
    const bar = '█'.repeat(count);
    console.log(`  ${num.padStart(2)} (${item?.name?.padEnd(12) || '?'}): ${bar} (${count})`);
  }

  // Verificar que no hay repeticiones consecutivas
  console.log('\n📋 SECUENCIA DE RESULTADOS SIMULADOS:');
  let simSeqIssues = 0;
  for (let i = 0; i < improvedWinners.length; i++) {
    const curr = parseInt(improvedWinners[i]);
    const prev = i > 0 ? parseInt(improvedWinners[i-1]) : null;
    const isSeq = prev !== null && Math.abs(curr - prev) <= 1;
    if (isSeq) simSeqIssues++;
    
    const mark = isSeq ? '⚠️' : '  ';
    console.log(`  ${mark} ${results[i].date} ${results[i].time}: ${improvedWinners[i]}`);
  }
  
  console.log(`\nSecuencias en simulación mejorada: ${simSeqIssues}`);
  console.log(`Secuencias/problemas en actual: ${problemCount}`);

  await prisma.$disconnect();
}

main().catch(console.error);
