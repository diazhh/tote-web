import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, '../../../storage');
const RECOMENDACIONES_PATH = path.join(STORAGE, 'bases/3/recomendaciones');
const FONTS_PATH = path.join(STORAGE, 'fonts');
const OUTPUT_PATH = path.join(STORAGE, 'results');

/**
 * Generate recommended numbers based on historical draw analysis.
 * Analyzes last 50 TRIPLE PANTERA draws to find frequency patterns.
 */
async function generateRecommendedNumbers(gameId) {
  const draws = await prisma.draw.findMany({
    where: { gameId, status: 'DRAWN', winnerItemId: { not: null } },
    include: { winnerItem: true },
    orderBy: { drawnAt: 'desc' },
    take: 50,
  });

  if (draws.length < 5) {
    // Not enough data — return date-based fallback
    const now = new Date();
    const seed = now.getUTCDate() * 100 + now.getUTCMonth() * 10 + now.getUTCDay();
    const r = (n) => String((seed * (n + 1) * 7 + 13) % 1000).padStart(3, '0');
    return {
      permuta: r(1).split(''),
      favorito1: r(2),
      favorito2: r(3),
      explosivo1: r(4),
      explosivo2: r(5),
    };
  }

  // Count digit frequency per position (A=hundreds, B=tens, C=units)
  const freq = [Array(10).fill(0), Array(10).fill(0), Array(10).fill(0)];
  const numberCounts = {};

  for (const draw of draws) {
    const num = String(draw.winnerItem.number).padStart(3, '0');
    freq[0][parseInt(num[0])]++;
    freq[1][parseInt(num[1])]++;
    freq[2][parseInt(num[2])]++;
    numberCounts[num] = (numberCounts[num] || 0) + 1;
  }

  // Permuta: most frequent digit per position
  const permuta = freq.map(pos => {
    let maxIdx = 0;
    for (let i = 1; i < 10; i++) {
      if (pos[i] > pos[maxIdx]) maxIdx = i;
    }
    return String(maxIdx);
  });

  // Favoritos: top 2 most frequent full numbers
  const sorted = Object.entries(numberCounts).sort((a, b) => b[1] - a[1]);
  const favorito1 = sorted[0] ? sorted[0][0] : '000';
  const favorito2 = sorted[1] ? sorted[1][0] : '000';

  // Explosivos: 2 least frequent (cold numbers likely to appear)
  const explosivo1 = sorted[sorted.length - 1] ? sorted[sorted.length - 1][0] : '999';
  const explosivo2 = sorted[sorted.length - 2] ? sorted[sorted.length - 2][0] : '888';

  return { permuta, favorito1, favorito2, explosivo1, explosivo2 };
}

export async function generateRecomendacionesTriple(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  // 1. Find TRIPLE PANTERA game
  const game = await prisma.game.findFirst({ where: { slug: 'triple-pantera' } });
  if (!game) throw new Error('Game triplepantera not found');

  // 2. Generate recommendations
  const recs = await generateRecommendedNumbers(game.id);

  // 3. Build composite layers on base
  const bgPath = path.join(RECOMENDACIONES_PATH, 'base.png');
  const layers = [];

  // 4. Permuta digit overlays (pre-positioned 1080x1080 layers)
  for (let i = 0; i < 3; i++) {
    const pos = ['A', 'B', 'C'][i];
    const digitFile = `${recs.permuta[i]}.${pos}.png`;
    const digitPath = path.join(RECOMENDACIONES_PATH, digitFile);
    try {
      await fs.access(digitPath);
      layers.push({ input: digitPath, left: 0, top: 0 });
    } catch {
      // Skip if missing
    }
  }

  // 5. Date text overlay
  const displayDate = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCFullYear()).slice(-2)}`;
  const fontPath = path.join(FONTS_PATH, 'Alphakind.ttf');

  const dateSvg = Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face { font-family: 'Alphakind'; src: url('file://${fontPath}'); font-weight: bold; }
      </style>
      <text x="540" y="250" font-family="Alphakind" font-size="50px" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${displayDate}</text>
    </svg>
  `);
  layers.push({ input: dateSvg, left: 0, top: 0 });

  // 6. Favoritos text (black)
  const favoritosSvg = Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face { font-family: 'Alphakind'; src: url('file://${fontPath}'); font-weight: bold; }
      </style>
      <text x="60" y="785" font-family="Alphakind" font-size="65px" font-weight="bold" fill="#000000">${recs.favorito1}</text>
      <text x="295" y="785" font-family="Alphakind" font-size="65px" font-weight="bold" fill="#000000">${recs.favorito2}</text>
    </svg>
  `);
  layers.push({ input: favoritosSvg, left: 0, top: 0 });

  // 7. Explosivos text (red)
  const explosivosSvg = Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face { font-family: 'Alphakind'; src: url('file://${fontPath}'); font-weight: bold; }
      </style>
      <text x="570" y="915" font-family="Alphakind" font-size="65px" font-weight="bold" fill="#FF0000">${recs.explosivo1}</text>
      <text x="830" y="915" font-family="Alphakind" font-size="65px" font-weight="bold" fill="#FF0000">${recs.explosivo2}</text>
    </svg>
  `);
  layers.push({ input: explosivosSvg, left: 0, top: 0 });

  // 8. Composite and save
  const outputFilename = `recomendaciones_triple_${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);

  await sharp(bgPath)
    .composite(layers)
    .toFile(outputPath);

  logger.info(`[recomendaciones-triple] Imagen generada: ${outputPath}`);
  return { filename: outputFilename, path: outputPath };
}

export async function recomendacionesTripleWorker(job) {
  const { date } = job.data;
  logger.info(`[recomendaciones-triple] Generando recomendaciones para ${date}`);
  const result = await generateRecomendacionesTriple(date);

  try {
    const adminBot = (await import('../../services/admin-telegram-bot.service.js')).default;
    await adminBot.sendImageToAdmins(result.path, `💡 Recomendaciones TRIPLE - ${date}`);
  } catch (err) {
    logger.warn(`[recomendaciones-triple] Error enviando al admin: ${err.message}`);
  }

  return { success: true, ...result };
}
