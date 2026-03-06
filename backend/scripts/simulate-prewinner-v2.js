/**
 * Script de SIMULACIÓN del algoritmo de pre-ganador MEJORADO v2
 * NO MODIFICA NADA en la base de datos - solo lee y simula
 * 
 * MEJORAS:
 * 1. Usa historial REAL de sorteos en vez de lastWin (que está roto)
 * 2. Agrega restricción de ENFRIAMIENTO (no repetir en N días)
 * 3. Considera ganadores de AYER para secuencias
 * 4. Simula sorteo por sorteo en orden cronológico
 */

import { prisma } from '../src/lib/prisma.js';
import { differenceInDays } from 'date-fns';

// Configuración del algoritmo MEJORADO
const WEIGHTS = {
  DAYS_SINCE_WIN: 0.40,      // Más peso a tiempo sin ganar
  SEQUENTIAL_PENALTY: 0.30,  // Evitar secuencias (incluyendo día anterior)
  RECENCY_PENALTY: 0.20,     // Penalizar ganadores muy recientes
  DISTRIBUTION: 0.10         // Distribución uniforme
};

const CONFIG = {
  // Período de enfriamiento: NO seleccionar si ganó en estos días
  COOLDOWN_DAYS: 2,
  // Días máximos para normalizar score
  MAX_DAYS_BONUS: 15,
  // Penalización por secuencia
  SEQUENCE_PENALTIES: {
    SAME_NUMBER: 1.0,        // Mismo número = eliminado
    CONSECUTIVE: 0.8,        // Número consecutivo (diff=1)
    NEAR: 0.4,               // Número cercano (diff=2)
    YESTERDAY_CONSECUTIVE: 0.6 // Consecutivo al último de ayer
  }
};

/**
 * Obtener historial REAL de ganadores de un juego
 */
async function getRealWinnerHistory(gameId, daysBack = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  startDate.setUTCHours(0, 0, 0, 0);

  const draws = await prisma.draw.findMany({
    where: {
      gameId,
      status: 'DRAWN',
      winnerItemId: { not: null },
      drawDate: { gte: startDate }
    },
    include: { winnerItem: true },
    orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }]
  });

  // Crear mapa de último triunfo por item
  const lastWinByItem = new Map();
  const winCountByItem = new Map();

  for (const draw of draws) {
    const itemId = draw.winnerItemId;
    const itemNumber = draw.winnerItem.number;
    
    // Guardar la fecha más reciente
    if (!lastWinByItem.has(itemId)) {
      lastWinByItem.set(itemId, {
        date: draw.drawDate,
        time: draw.drawTime,
        number: itemNumber
      });
    }
    
    // Contar victorias
    winCountByItem.set(itemId, (winCountByItem.get(itemId) || 0) + 1);
  }

  return { draws, lastWinByItem, winCountByItem };
}

/**
 * Calcular días desde última victoria usando historial real
 */
function getDaysSinceWin(itemId, lastWinByItem, referenceDate) {
  const lastWin = lastWinByItem.get(itemId);
  if (!lastWin) return 999; // Nunca ganó
  
  const lastWinDate = new Date(lastWin.date);
  const refDate = new Date(referenceDate);
  return Math.max(0, differenceInDays(refDate, lastWinDate));
}

/**
 * Obtener ganadores de un día específico
 */
async function getWinnersForDate(gameId, date) {
  const draws = await prisma.draw.findMany({
    where: {
      gameId,
      drawDate: date,
      status: 'DRAWN',
      winnerItemId: { not: null }
    },
    include: { winnerItem: true },
    orderBy: { drawTime: 'asc' }
  });

  return draws.map(d => ({
    number: parseInt(d.winnerItem.number),
    itemId: d.winnerItemId,
    time: d.drawTime
  }));
}

/**
 * Calcular score de secuencia mejorado
 */
function calculateSequenceScore(itemNumber, todayWinners, yesterdayWinners) {
  let penalty = 0;
  const num = parseInt(itemNumber);

  // Penalizar secuencias con ganadores de HOY
  for (const winner of todayWinners) {
    const diff = Math.abs(num - winner.number);
    if (diff === 0) {
      penalty += CONFIG.SEQUENCE_PENALTIES.SAME_NUMBER;
    } else if (diff === 1) {
      penalty += CONFIG.SEQUENCE_PENALTIES.CONSECUTIVE;
    } else if (diff === 2) {
      penalty += CONFIG.SEQUENCE_PENALTIES.NEAR;
    }
  }

  // Penalizar secuencia con el ÚLTIMO ganador de AYER
  if (yesterdayWinners.length > 0) {
    const lastYesterday = yesterdayWinners[yesterdayWinners.length - 1];
    const diff = Math.abs(num - lastYesterday.number);
    if (diff === 1) {
      penalty += CONFIG.SEQUENCE_PENALTIES.YESTERDAY_CONSECUTIVE;
    }
  }

  // Convertir a score (1 = sin penalidad, 0 = máxima)
  return Math.max(0, 1 - Math.min(penalty, 1));
}

/**
 * Calcular score de recencia (penalizar ganadores muy recientes)
 */
function calculateRecencyScore(daysSinceWin) {
  if (daysSinceWin <= CONFIG.COOLDOWN_DAYS) {
    // Dentro del período de enfriamiento - penalización fuerte
    return daysSinceWin / (CONFIG.COOLDOWN_DAYS + 1) * 0.3;
  }
  // Fuera del enfriamiento - score normal
  return Math.min(1, (daysSinceWin - CONFIG.COOLDOWN_DAYS) / 5);
}

/**
 * Seleccionar pre-ganador con algoritmo mejorado
 */
async function selectWithImprovedAlgorithm(gameId, gameSlug, drawDate, drawTime, gameItems, history, simulation) {
  const { lastWinByItem } = history;
  
  // Obtener ganadores de hoy (hasta este sorteo) y ayer
  const todayWinners = simulation.winnersToday || [];
  const yesterdayWinners = simulation.winnersYesterday || [];
  
  // Obtener items ya usados hoy
  const usedTodayIds = new Set(todayWinners.map(w => w.itemId));
  
  const candidates = [];
  
  for (const item of gameItems) {
    // RESTRICCIÓN DURA 1: No usado hoy
    if (usedTodayIds.has(item.id)) {
      continue;
    }
    
    const itemNumber = parseInt(item.number);
    const daysSinceWin = getDaysSinceWin(item.id, lastWinByItem, drawDate);
    
    // RESTRICCIÓN DURA 2: Período de enfriamiento
    // Pero NO eliminar, solo penalizar fuertemente
    
    // Calcular scores
    const daysSinceWinScore = Math.min(daysSinceWin / CONFIG.MAX_DAYS_BONUS, 1);
    const sequenceScore = calculateSequenceScore(itemNumber, todayWinners, yesterdayWinners);
    const recencyScore = calculateRecencyScore(daysSinceWin);
    
    // Score de distribución (preferir items con menos victorias recientes)
    const winCount = history.winCountByItem.get(item.id) || 0;
    const maxWins = Math.max(...Array.from(history.winCountByItem.values()), 1);
    const distributionScore = 1 - (winCount / maxWins);
    
    // Score final ponderado
    const finalScore = 
      (daysSinceWinScore * WEIGHTS.DAYS_SINCE_WIN) +
      (sequenceScore * WEIGHTS.SEQUENTIAL_PENALTY) +
      (recencyScore * WEIGHTS.RECENCY_PENALTY) +
      (distributionScore * WEIGHTS.DISTRIBUTION);
    
    candidates.push({
      item,
      itemNumber,
      daysSinceWin,
      winCount,
      scores: {
        daysSinceWin: daysSinceWinScore,
        sequence: sequenceScore,
        recency: recencyScore,
        distribution: distributionScore
      },
      finalScore,
      inCooldown: daysSinceWin <= CONFIG.COOLDOWN_DAYS
    });
  }
  
  // Ordenar por score
  candidates.sort((a, b) => b.finalScore - a.finalScore);
  
  return candidates;
}

async function main() {
  console.log('='.repeat(80));
  console.log('SIMULACIÓN DE PRE-GANADOR MEJORADO v2');
  console.log('Usando historial REAL + restricción de enfriamiento');
  console.log('='.repeat(80));
  
  // Obtener fechas
  const now = new Date();
  const venezuelaOffset = -4 * 60;
  const localOffset = now.getTimezoneOffset();
  const venezuelaNow = new Date(now.getTime() + (localOffset + venezuelaOffset) * 60 * 1000);
  
  const today = new Date(venezuelaNow);
  today.setUTCHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  console.log(`\nFecha Venezuela: ${venezuelaNow.toISOString()}`);
  console.log(`Ayer: ${yesterday.toISOString().split('T')[0]}`);
  console.log(`Hoy: ${today.toISOString().split('T')[0]}`);
  
  // Obtener LotoAnimalito
  const game = await prisma.game.findFirst({
    where: { slug: 'lotoanimalito' }
  });
  
  if (!game) {
    console.log('Juego LotoAnimalito no encontrado');
    await prisma.$disconnect();
    return;
  }
  
  // Obtener items del juego
  const gameItems = await prisma.gameItem.findMany({
    where: { gameId: game.id, isActive: true },
    orderBy: { number: 'asc' }
  });
  
  console.log(`\n📊 ${game.name}: ${gameItems.length} items`);
  
  // Obtener historial real
  const history = await getRealWinnerHistory(game.id, 7);
  console.log(`Historial: ${history.draws.length} sorteos en últimos 7 días`);
  
  // Obtener sorteos de ayer y hoy hasta las 12pm
  const draws = await prisma.draw.findMany({
    where: {
      gameId: game.id,
      OR: [
        { drawDate: yesterday },
        { drawDate: today, drawTime: { lte: '12:00:00' } }
      ]
    },
    include: {
      winnerItem: true,
      preselectedItem: true
    },
    orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }]
  });
  
  console.log(`Sorteos a simular: ${draws.length}`);
  
  // Obtener ganadores de ayer (para secuencias)
  const yesterdayWinners = await getWinnersForDate(game.id, yesterday);
  
  // Simular cada sorteo
  console.log('\n' + '='.repeat(80));
  console.log('COMPARACIÓN: ALGORITMO ACTUAL vs MEJORADO');
  console.log('='.repeat(80));
  
  const simulation = {
    winnersToday: [],
    winnersYesterday: yesterdayWinners
  };
  
  let currentDate = null;
  let matchCount = 0;
  let improvedBetterCount = 0;
  
  for (const draw of draws) {
    const dateStr = draw.drawDate.toISOString().split('T')[0];
    
    // Si cambió el día, reiniciar ganadores de hoy
    if (currentDate !== dateStr) {
      if (currentDate !== null) {
        // El día anterior se convierte en "ayer"
        simulation.winnersYesterday = [...simulation.winnersToday];
      }
      simulation.winnersToday = [];
      currentDate = dateStr;
    }
    
    // Obtener el resultado REAL del algoritmo actual
    const actualWinner = draw.winnerItem || draw.preselectedItem;
    const actualNumber = actualWinner?.number || 'N/A';
    
    // Simular con algoritmo mejorado
    const candidates = await selectWithImprovedAlgorithm(
      game.id, game.slug, draw.drawDate, draw.drawTime,
      gameItems, history, simulation
    );
    
    const improvedTop = candidates[0];
    const improvedNumber = improvedTop?.item.number || 'N/A';
    
    // Verificar si el actual está en cooldown
    const actualDaysSince = actualWinner 
      ? getDaysSinceWin(actualWinner.id, history.lastWinByItem, draw.drawDate)
      : 999;
    const actualInCooldown = actualDaysSince <= CONFIG.COOLDOWN_DAYS;
    
    // Verificar si el actual es secuencial
    let actualIsSequential = false;
    if (actualWinner) {
      const actualNum = parseInt(actualWinner.number);
      // Verificar con ganadores previos de hoy
      for (const prev of simulation.winnersToday) {
        if (Math.abs(actualNum - prev.number) <= 1) {
          actualIsSequential = true;
          break;
        }
      }
    }
    
    // Marcadores de problemas
    const problems = [];
    if (actualInCooldown && actualDaysSince < 999) {
      problems.push(`⚠️ COOLDOWN(${actualDaysSince}d)`);
    }
    if (actualIsSequential) {
      problems.push('⚠️ SECUENCIA');
    }
    
    // Comparar
    const match = actualNumber === improvedNumber;
    if (match) matchCount++;
    
    // El mejorado es mejor si el actual tiene problemas
    const improvedBetter = problems.length > 0;
    if (improvedBetter) improvedBetterCount++;
    
    // Mostrar resultado
    const statusIcon = problems.length > 0 ? '🔴' : '✅';
    console.log(
      `\n${statusIcon} ${dateStr} ${draw.drawTime} | ${draw.status.padEnd(9)}`
    );
    console.log(
      `   ACTUAL:   ${actualNumber.toString().padStart(2)} (${actualWinner?.name || '?'.padEnd(12)}) | ` +
      `DíasSinGanar: ${actualDaysSince.toString().padStart(3)} ${problems.join(' ')}`
    );
    console.log(
      `   MEJORADO: ${improvedNumber.toString().padStart(2)} (${improvedTop?.item.name.padEnd(12) || '?'}) | ` +
      `DíasSinGanar: ${improvedTop?.daysSinceWin.toString().padStart(3) || '?'} | ` +
      `Score: ${improvedTop?.finalScore.toFixed(4) || '?'}`
    );
    
    // Mostrar top 5 candidatos del algoritmo mejorado
    if (candidates.length > 0) {
      console.log('   Top 5 mejorado:');
      for (const c of candidates.slice(0, 5)) {
        const cooldownMark = c.inCooldown ? '❄️' : '  ';
        console.log(
          `     ${cooldownMark} ${c.item.number.padStart(2)} (${c.item.name.padEnd(12)}) | ` +
          `Score: ${c.finalScore.toFixed(4)} | ` +
          `Días: ${c.daysSinceWin.toString().padStart(3)} | ` +
          `Seq: ${c.scores.sequence.toFixed(2)}`
        );
      }
    }
    
    // Agregar a ganadores de hoy (simular que este fue el ganador)
    if (actualWinner) {
      simulation.winnersToday.push({
        number: parseInt(actualWinner.number),
        itemId: actualWinner.id,
        time: draw.drawTime
      });
    }
  }
  
  // Resumen
  console.log('\n' + '='.repeat(80));
  console.log('RESUMEN DE SIMULACIÓN');
  console.log('='.repeat(80));
  console.log(`Sorteos analizados: ${draws.length}`);
  console.log(`Coincidencias (actual = mejorado): ${matchCount}`);
  console.log(`Sorteos donde mejorado sería mejor: ${improvedBetterCount}`);
  console.log(`\nProblemas del algoritmo actual:`);
  console.log(`  - Selecciona items en período de enfriamiento (ganaron hace <${CONFIG.COOLDOWN_DAYS} días)`);
  console.log(`  - No considera secuencias con el día anterior`);
  console.log(`  - lastWin está NULL, no se usa correctamente`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
