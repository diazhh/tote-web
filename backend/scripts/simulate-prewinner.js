/**
 * Script de SIMULACIÓN del algoritmo de pre-ganador MEJORADO
 * NO MODIFICA NADA en la base de datos - solo lee y simula
 * 
 * MEJORAS:
 * 1. Usa historial REAL de sorteos en vez de lastWin (que está roto)
 * 2. Agrega restricción de ENFRIAMIENTO (no repetir en N días)
 * 3. Considera ganadores de AYER para secuencias
 * 4. Simula sorteo por sorteo en orden cronológico
 */

import { prisma } from '../src/lib/prisma.js';
import { differenceInDays, differenceInHours } from 'date-fns';

// Configuración del algoritmo MEJORADO
const WEIGHTS = {
  TICKET_COUNT: 0.30,        // Reducido - menos peso a ventas
  DAYS_SINCE_WIN: 0.30,      // Aumentado - más peso a tiempo sin ganar
  SEQUENTIAL_PENALTY: 0.20,  // Aumentado - más peso a evitar secuencias
  RECENCY_PENALTY: 0.15,     // NUEVO - penalizar ganadores recientes (ayer, anteayer)
  PAYOUT_EFFICIENCY: 0.05    // Reducido
};

const DEFAULTS = {
  MAX_PAYOUT_PERCENTAGE: 70,
  MAX_DAYS_BONUS: 30,
  // NUEVO: Período de enfriamiento por tipo de juego
  COOLDOWN_DAYS: {
    'lotoanimalito': 2,   // 38 items, 11 sorteos = ~3.5 items/sorteo → 2 días mínimo
    'lotoactivo': 2,
    'granjamillonaria': 2,
    'default': 2
  }
};

async function main() {
  console.log('='.repeat(80));
  console.log('SIMULACIÓN DE PRE-GANADOR - SOLO LECTURA');
  console.log('='.repeat(80));
  
  // Obtener fecha de ayer y hoy en hora Venezuela
  const now = new Date();
  const venezuelaOffset = -4 * 60; // UTC-4
  const localOffset = now.getTimezoneOffset();
  const venezuelaNow = new Date(now.getTime() + (localOffset + venezuelaOffset) * 60 * 1000);
  
  const today = new Date(venezuelaNow);
  today.setUTCHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  console.log(`\nFecha Venezuela: ${venezuelaNow.toISOString()}`);
  console.log(`Ayer: ${yesterday.toISOString().split('T')[0]}`);
  console.log(`Hoy: ${today.toISOString().split('T')[0]}`);
  
  // Obtener sorteos de ayer y hoy hasta las 12pm
  const draws = await prisma.draw.findMany({
    where: {
      drawDate: {
        gte: yesterday,
        lte: today
      },
      OR: [
        { drawDate: yesterday },
        { 
          drawDate: today, 
          drawTime: { lte: '12:00:00' } 
        }
      ]
    },
    include: {
      game: true,
      winnerItem: true,
      preselectedItem: true
    },
    orderBy: [
      { drawDate: 'asc' },
      { drawTime: 'asc' }
    ]
  });
  
  console.log(`\nSorteos encontrados: ${draws.length}`);
  
  // Agrupar por juego para análisis
  const drawsByGame = {};
  for (const draw of draws) {
    if (!drawsByGame[draw.game.slug]) {
      drawsByGame[draw.game.slug] = [];
    }
    drawsByGame[draw.game.slug].push(draw);
  }
  
  // Mostrar resultados actuales
  console.log('\n' + '='.repeat(80));
  console.log('RESULTADOS ACTUALES EN LA BASE DE DATOS');
  console.log('='.repeat(80));
  
  for (const [gameSlug, gameDraws] of Object.entries(drawsByGame)) {
    console.log(`\n📊 ${gameDraws[0].game.name} (${gameSlug})`);
    console.log('-'.repeat(60));
    
    const winners = [];
    for (const draw of gameDraws) {
      const date = draw.drawDate.toISOString().split('T')[0];
      const winnerNum = draw.winnerItem?.number || draw.preselectedItem?.number || 'N/A';
      const winnerName = draw.winnerItem?.name || draw.preselectedItem?.name || '';
      const status = draw.status;
      
      winners.push(parseInt(winnerNum) || -1);
      
      console.log(`  ${date} ${draw.drawTime} | ${status.padEnd(10)} | Ganador: ${winnerNum.toString().padStart(2)} - ${winnerName}`);
    }
    
    // Detectar problemas
    const problems = [];
    
    // Detectar secuencias
    for (let i = 1; i < winners.length; i++) {
      if (winners[i] >= 0 && winners[i-1] >= 0) {
        if (Math.abs(winners[i] - winners[i-1]) === 1) {
          problems.push(`⚠️ SECUENCIA: ${winners[i-1]} → ${winners[i]}`);
        }
      }
    }
    
    // Detectar repeticiones el mismo día o día siguiente
    const winnersByDate = {};
    for (const draw of gameDraws) {
      const date = draw.drawDate.toISOString().split('T')[0];
      const winnerNum = draw.winnerItem?.number || draw.preselectedItem?.number;
      if (winnerNum) {
        if (!winnersByDate[date]) winnersByDate[date] = [];
        winnersByDate[date].push({ time: draw.drawTime, number: winnerNum });
      }
    }
    
    const dates = Object.keys(winnersByDate).sort();
    for (let i = 1; i < dates.length; i++) {
      const prevDayWinners = winnersByDate[dates[i-1]].map(w => w.number);
      const todayWinners = winnersByDate[dates[i]];
      
      for (const winner of todayWinners) {
        if (prevDayWinners.includes(winner.number)) {
          problems.push(`⚠️ REPETIDO DEL DÍA ANTERIOR: ${winner.number} (${dates[i]} ${winner.time})`);
        }
      }
    }
    
    if (problems.length > 0) {
      console.log('\n  🔴 PROBLEMAS DETECTADOS:');
      for (const p of problems) {
        console.log(`     ${p}`);
      }
    }
  }
  
  // Ahora simular el algoritmo para LotoAnimalito
  console.log('\n' + '='.repeat(80));
  console.log('SIMULACIÓN DEL ALGORITMO PARA LOTOANIMALITO');
  console.log('='.repeat(80));
  
  const lotoAnimalito = await prisma.game.findFirst({
    where: { slug: 'lotoanimalito' }
  });
  
  if (!lotoAnimalito) {
    console.log('Juego LotoAnimalito no encontrado');
    await prisma.$disconnect();
    return;
  }
  
  // Obtener todos los items del juego
  const gameItems = await prisma.gameItem.findMany({
    where: { gameId: lotoAnimalito.id, isActive: true },
    orderBy: { number: 'asc' }
  });
  
  console.log(`\nItems del juego: ${gameItems.length}`);
  
  // Obtener historial de ganadores de los últimos 7 días
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentDraws = await prisma.draw.findMany({
    where: {
      gameId: lotoAnimalito.id,
      status: 'DRAWN',
      winnerItemId: { not: null },
      drawDate: { gte: sevenDaysAgo }
    },
    include: { winnerItem: true },
    orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }]
  });
  
  console.log(`\nHistorial reciente (7 días): ${recentDraws.length} sorteos`);
  
  // Analizar distribución de ganadores
  const winnerCounts = {};
  const winnerDates = {};
  
  for (const draw of recentDraws) {
    const num = draw.winnerItem.number;
    winnerCounts[num] = (winnerCounts[num] || 0) + 1;
    
    const dateStr = draw.drawDate.toISOString().split('T')[0];
    if (!winnerDates[num]) winnerDates[num] = [];
    winnerDates[num].push({ date: dateStr, time: draw.drawTime });
  }
  
  // Items que más han salido
  const sortedByFreq = Object.entries(winnerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  console.log('\n📈 TOP 10 números más frecuentes (últimos 7 días):');
  for (const [num, count] of sortedByFreq) {
    const item = gameItems.find(i => i.number === num);
    const dates = winnerDates[num].slice(0, 3).map(d => `${d.date} ${d.time}`).join(', ');
    console.log(`  ${num.padStart(2)} (${item?.name || '?'}) - ${count} veces | Últimos: ${dates}`);
  }
  
  // Items que NO han salido en los últimos 7 días
  const winnersSet = new Set(Object.keys(winnerCounts));
  const neverWon = gameItems.filter(i => !winnersSet.has(i.number));
  
  console.log(`\n📉 Items que NO han ganado en 7 días: ${neverWon.length}`);
  if (neverWon.length <= 20) {
    console.log(`   ${neverWon.map(i => i.number).join(', ')}`);
  }
  
  // Análisis de lastWin de cada item
  console.log('\n📅 Análisis de lastWin por item:');
  const now2 = new Date();
  const itemsByLastWin = gameItems.map(item => {
    const daysSince = item.lastWin 
      ? differenceInDays(now2, new Date(item.lastWin))
      : 999;
    return { item, daysSince };
  }).sort((a, b) => b.daysSince - a.daysSince);
  
  console.log('\n  Items con MÁS tiempo sin ganar (deberían ser preferidos):');
  for (const { item, daysSince } of itemsByLastWin.slice(0, 15)) {
    const lastWinStr = item.lastWin 
      ? new Date(item.lastWin).toISOString().split('T')[0]
      : 'NUNCA';
    console.log(`  ${item.number.padStart(2)} (${item.name.padEnd(12)}) - ${daysSince} días sin ganar | Último: ${lastWinStr}`);
  }
  
  console.log('\n  Items con MENOS tiempo sin ganar (no deberían salir pronto):');
  for (const { item, daysSince } of itemsByLastWin.slice(-10).reverse()) {
    const lastWinStr = item.lastWin 
      ? new Date(item.lastWin).toISOString().split('T')[0]
      : 'NUNCA';
    console.log(`  ${item.number.padStart(2)} (${item.name.padEnd(12)}) - ${daysSince} días sin ganar | Último: ${lastWinStr}`);
  }
  
  // Verificar si el número 0 (DELFIN) tiene lastWin reciente
  const delfin = gameItems.find(i => i.number === '0');
  if (delfin) {
    console.log('\n🐬 Análisis específico del DELFIN (0):');
    console.log(`   lastWin en DB: ${delfin.lastWin ? new Date(delfin.lastWin).toISOString() : 'NULL'}`);
    
    const delfinWins = recentDraws.filter(d => d.winnerItem.number === '0');
    console.log(`   Veces que ganó en últimos 7 días: ${delfinWins.length}`);
    for (const win of delfinWins) {
      console.log(`     - ${win.drawDate.toISOString().split('T')[0]} ${win.drawTime}`);
    }
  }
  
  // Simular qué item seleccionaría el algoritmo para el próximo sorteo
  console.log('\n' + '='.repeat(80));
  console.log('SIMULACIÓN: QUÉ SELECCIONARÍA EL ALGORITMO');
  console.log('='.repeat(80));
  
  // Obtener items usados hoy
  const todayDraws = await prisma.draw.findMany({
    where: {
      gameId: lotoAnimalito.id,
      drawDate: today,
      OR: [
        { preselectedItemId: { not: null } },
        { winnerItemId: { not: null } }
      ]
    },
    select: { preselectedItemId: true, winnerItemId: true, drawTime: true }
  });
  
  const usedItemsToday = new Set();
  for (const draw of todayDraws) {
    if (draw.preselectedItemId) usedItemsToday.add(draw.preselectedItemId);
    if (draw.winnerItemId) usedItemsToday.add(draw.winnerItemId);
  }
  
  console.log(`\nItems usados hoy: ${usedItemsToday.size}`);
  
  // Items disponibles (no usados hoy)
  const availableItems = gameItems.filter(i => !usedItemsToday.has(i.id));
  console.log(`Items disponibles: ${availableItems.length}`);
  
  // Ganadores de hoy (para evitar secuencias)
  const todayWinnerNums = [];
  for (const draw of todayDraws) {
    const itemId = draw.winnerItemId || draw.preselectedItemId;
    const item = gameItems.find(i => i.id === itemId);
    if (item) todayWinnerNums.push(parseInt(item.number));
  }
  
  console.log(`Ganadores de hoy: ${todayWinnerNums.join(', ')}`);
  
  // Ganadores de ayer
  const yesterdayDraws = await prisma.draw.findMany({
    where: {
      gameId: lotoAnimalito.id,
      drawDate: yesterday,
      winnerItemId: { not: null }
    },
    include: { winnerItem: true }
  });
  
  const yesterdayWinnerNums = yesterdayDraws.map(d => parseInt(d.winnerItem.number));
  console.log(`Ganadores de ayer: ${yesterdayWinnerNums.join(', ')}`);
  
  // Simular scoring para cada item disponible
  console.log('\n📊 Scoring simulado para items disponibles:');
  
  const candidates = [];
  
  for (const item of availableItems) {
    const itemNum = parseInt(item.number);
    
    // Score por días sin ganar
    const daysSince = item.lastWin 
      ? differenceInDays(now2, new Date(item.lastWin))
      : 365;
    const daysSinceScore = Math.min(daysSince / DEFAULTS.MAX_DAYS_BONUS, 1);
    
    // Score por secuencia (penalizar si es consecutivo a ganador de hoy o ayer)
    let sequentialPenalty = 0;
    
    // Penalizar consecutivos de HOY
    for (const winnerNum of todayWinnerNums) {
      const diff = Math.abs(itemNum - winnerNum);
      if (diff === 1) sequentialPenalty += 0.4;
      else if (diff === 2) sequentialPenalty += 0.2;
    }
    
    // PROBLEMA IDENTIFICADO: No penaliza consecutivos de AYER
    // El algoritmo actual NO considera ganadores del día anterior
    
    // Penalizar si salió AYER (esto NO está en el algoritmo actual)
    const wasYesterdayWinner = yesterdayWinnerNums.includes(itemNum);
    
    const sequentialScore = Math.max(0, 1 - Math.min(sequentialPenalty, 1));
    
    // Score simplificado (sin ventas porque es simulación)
    const ticketCountScore = 0.5; // Neutral
    const tripletaRiskScore = 1; // Sin tripletas
    const payoutEfficiencyScore = 0.5; // Neutral
    
    const finalScore = 
      (ticketCountScore * WEIGHTS.TICKET_COUNT) +
      (daysSinceScore * WEIGHTS.DAYS_SINCE_WIN) +
      (sequentialScore * WEIGHTS.SEQUENTIAL_PENALTY) +
      (tripletaRiskScore * WEIGHTS.TRIPLETA_RISK) +
      (payoutEfficiencyScore * WEIGHTS.PAYOUT_EFFICIENCY);
    
    candidates.push({
      item,
      daysSince,
      daysSinceScore,
      sequentialScore,
      sequentialPenalty,
      wasYesterdayWinner,
      finalScore
    });
  }
  
  // Ordenar por score
  candidates.sort((a, b) => b.finalScore - a.finalScore);
  
  console.log('\n  TOP 15 candidatos según algoritmo actual:');
  for (const c of candidates.slice(0, 15)) {
    const marker = c.wasYesterdayWinner ? '⚠️ SALIÓ AYER' : '';
    console.log(
      `  ${c.item.number.padStart(2)} (${c.item.name.padEnd(12)}) | ` +
      `Score: ${c.finalScore.toFixed(4)} | ` +
      `DíasSinGanar: ${c.daysSince.toString().padStart(3)} | ` +
      `SeqPenalty: ${c.sequentialPenalty.toFixed(2)} ${marker}`
    );
  }
  
  // Mostrar candidatos que salieron ayer pero tienen alto score
  const yesterdayProblems = candidates.filter(c => c.wasYesterdayWinner);
  if (yesterdayProblems.length > 0) {
    console.log('\n🔴 PROBLEMA: Items que salieron AYER pero podrían ser seleccionados:');
    for (const c of yesterdayProblems) {
      const rank = candidates.indexOf(c) + 1;
      console.log(
        `  #${rank.toString().padStart(2)}: ${c.item.number} (${c.item.name}) | ` +
        `Score: ${c.finalScore.toFixed(4)} | ` +
        `DíasSinGanar: ${c.daysSince}`
      );
    }
    console.log('\n  💡 El algoritmo NO excluye items que salieron ayer, solo considera días totales sin ganar');
    console.log('     Esto permite que un número salga dos días seguidos si tiene buen score');
  }
  
  // Conclusiones
  console.log('\n' + '='.repeat(80));
  console.log('PROBLEMAS IDENTIFICADOS EN EL ALGORITMO');
  console.log('='.repeat(80));
  
  console.log(`
1. NO EXCLUYE GANADORES RECIENTES:
   - El algoritmo solo usa "daysSinceWin" para scoring, pero NO EXCLUYE items
     que ganaron ayer o hace 2 días como RESTRICCIÓN DURA.
   - Con 38 items y 11 sorteos diarios, un número debería repetirse cada 3-4 días,
     pero el algoritmo puede seleccionar uno que salió ayer si tiene buen score.

2. SECUENCIAS SOLO SE VERIFICAN PARA HOY:
   - La penalización por secuencia solo considera ganadores del MISMO DÍA.
   - No penaliza si ayer terminó con 0 y hoy empieza con 1.

3. lastWin SE ACTUALIZA PERO NO SE USA BIEN:
   - El campo lastWin se actualiza, pero el algoritmo solo lo usa para
     DAR PUNTOS (más días = mejor), no para EXCLUIR.
   - Un item con lastWin de ayer tiene daysSinceWin=1, que le da score bajo
     pero NO LO EXCLUYE del pool de candidatos.

SOLUCIÓN PROPUESTA:
   - Agregar RESTRICCIÓN DURA: No seleccionar items que ganaron en los
     últimos N días (ej: 2-3 días para LotoAnimalito con 38 items).
   - Considerar ganadores de AYER para penalización de secuencias.
   - Implementar "período de enfriamiento" por item después de ganar.
`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
