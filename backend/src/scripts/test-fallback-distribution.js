/**
 * Test de distribución del fallback corregido.
 *
 * Simula 1000 ejecuciones de la lógica nueva de selectFallback con un
 * contexto vacío de TRIPLE PANTERA (1000 items, 0 ventas, 0 ganadores hoy)
 * y reporta la distribución por centena.
 *
 * Ejecutar: node src/scripts/test-fallback-distribution.js
 */

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Simulación de la nueva lógica del fallback
function selectFallbackSim() {
  // 1000 items numerados 000-999, multiplicador 600, sin ventas
  const items = Array.from({ length: 1000 }, (_, i) => ({
    item: { number: String(i).padStart(3, '0'), multiplier: 600 },
    daysSinceWin: 999,
    potentialPayout: 0,
  }));

  // Shuffle Fisher-Yates antes de cualquier sort
  shuffleInPlace(items);

  // Ordenar por potentialPayout asc (todos en 0 → orden preservado del shuffle)
  items.sort((a, b) => a.potentialPayout - b.potentialPayout);

  // Top 50%
  const safePool = items.slice(0, Math.max(Math.floor(items.length * 0.5), 10));

  // Re-shuffle del subset
  shuffleInPlace(safePool);

  return parseInt(safePool[Math.floor(Math.random() * safePool.length)].item.number);
}

// Simulación de la lógica VIEJA (sesgada)
function selectFallbackOld() {
  const items = Array.from({ length: 1000 }, (_, i) => ({
    item: { number: String(i).padStart(3, '0') },
    daysSinceWin: 999,
  }));

  // Sort estable por daysSinceWin desc (todos tied en 999) → preserva orden ascendente
  items.sort((a, b) => b.daysSinceWin - a.daysSinceWin);

  // Top 30%
  const topItems = items.slice(0, Math.max(Math.floor(items.length * 0.3), 3));
  return parseInt(topItems[Math.floor(Math.random() * topItems.length)].item.number);
}

function distribution(picker, n = 10000) {
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < n; i++) {
    const pick = picker();
    buckets[Math.floor(pick / 100)]++;
  }
  return buckets;
}

function chiSquare(observed, expected) {
  let chi = 0;
  for (let i = 0; i < observed.length; i++) {
    chi += Math.pow(observed[i] - expected, 2) / expected;
  }
  return chi;
}

console.log('=== Test de distribución del fallback ===\n');

const N = 10000;
const expectedPerBucket = N / 10;

console.log('LÓGICA VIEJA (sesgada):');
const oldDist = distribution(selectFallbackOld, N);
oldDist.forEach((count, i) => {
  const range = `${i * 100}-${(i + 1) * 100 - 1}`.padEnd(8);
  const pct = ((count / N) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(count / N * 100));
  console.log(`  ${range}: ${count.toString().padStart(5)} (${pct}%) ${bar}`);
});
console.log(`  Chi-square (df=9, esperado < 16.92 para p>0.05): ${chiSquare(oldDist, expectedPerBucket).toFixed(2)}\n`);

console.log('LÓGICA NUEVA (anti-sesgo):');
const newDist = distribution(selectFallbackSim, N);
newDist.forEach((count, i) => {
  const range = `${i * 100}-${(i + 1) * 100 - 1}`.padEnd(8);
  const pct = ((count / N) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(count / N * 100));
  console.log(`  ${range}: ${count.toString().padStart(5)} (${pct}%) ${bar}`);
});
const newChi = chiSquare(newDist, expectedPerBucket);
console.log(`  Chi-square (df=9, esperado < 16.92 para p>0.05): ${newChi.toFixed(2)}`);
console.log(`  ${newChi < 16.92 ? '✅ PASA' : '❌ FALLA'} test de uniformidad\n`);
