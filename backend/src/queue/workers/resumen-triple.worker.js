import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, '../../../storage');
const NUMEROS_PATH = path.join(STORAGE, 'bases/3/numeros');
const FONTS_PATH = path.join(STORAGE, 'fonts');
const OUTPUT_PATH = path.join(STORAGE, 'results');

// Time slots: left column 08-13, right column 14-19
const TIME_SLOTS = [
  { hour: 8,  col: 'left',  row: 0 },
  { hour: 9,  col: 'left',  row: 1 },
  { hour: 10, col: 'left',  row: 2 },
  { hour: 11, col: 'left',  row: 3 },
  { hour: 12, col: 'left',  row: 4 },
  { hour: 13, col: 'left',  row: 5 },
  { hour: 14, col: 'right', row: 0 },
  { hour: 15, col: 'right', row: 1 },
  { hour: 16, col: 'right', row: 2 },
  { hour: 17, col: 'right', row: 3 },
  { hour: 18, col: 'right', row: 4 },
  { hour: 19, col: 'right', row: 5 },
];

const LEFT_COL_X = 357;
const RIGHT_COL_X = 859;
const FIRST_ROW_Y = 340;
const ROW_SPACING = 117;

export async function generateResumenTriple(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  // 1. Query draws for this date
  const game = await prisma.game.findFirst({ where: { slug: 'triple-pantera' } });
  if (!game) throw new Error('Game triple-pantera not found');

  const drawDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const draws = await prisma.draw.findMany({
    where: { gameId: game.id, drawDate, status: 'DRAWN', winnerItemId: { not: null } },
    include: { winnerItem: true },
    orderBy: { drawTime: 'asc' },
  });

  const drawsByHour = {};
  for (const draw of draws) {
    const hour = parseInt(draw.drawTime.split(':')[0]);
    drawsByHour[hour] = draw;
  }

  // 2. Build composite layers
  const layers = [];
  const fontPath = path.join(FONTS_PATH, 'Alphakind.ttf');

  // SVG for all number texts
  let numbersSvg = `<svg width="1080" height="1080">
    <style>
      @font-face { font-family: 'Alphakind'; src: url('file://${fontPath}'); font-weight: bold; }
    </style>`;

  for (const slot of TIME_SLOTS) {
    const draw = drawsByHour[slot.hour];
    if (!draw) continue;

    const cx = slot.col === 'left' ? LEFT_COL_X : RIGHT_COL_X;
    const cy = FIRST_ROW_Y + slot.row * ROW_SPACING;

    const num = String(draw.winnerItem.number).padStart(3, '0');
    numbersSvg += `
      <text x="${cx}" y="${cy + 12}"
        font-family="Alphakind"
        font-size="48px"
        font-weight="bold"
        fill="#4A0E4E"
        text-anchor="middle"
        letter-spacing="17">${num}</text>`;
  }

  numbersSvg += '</svg>';
  layers.push({ input: Buffer.from(numbersSvg), left: 0, top: 0 });

  // 4. Date text overlay
  const displayDate = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCFullYear()).slice(-2)}`;
  const dateSvg = Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face { font-family: 'Alphakind'; src: url('file://${fontPath}'); font-weight: bold; }
      </style>
      <text x="425" y="210" font-family="Alphakind" font-size="34px" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${displayDate}</text>
    </svg>
  `);
  layers.push({ input: dateSvg, left: 0, top: 0 });

  // 5. Composite and save
  const bgPath = path.join(NUMEROS_PATH, 'resumen.png');
  const outputFilename = `resumen_triple_${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);

  await sharp(bgPath)
    .composite(layers)
    .toFile(outputPath);

  logger.info(`[resumen-triple] Imagen generada: ${outputPath}`);
  return { filename: outputFilename, path: outputPath, gameId: game.id };
}

export async function resumenTripleWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { date } = job.data;
  logger.info(`[resumen-triple] Generando resumen para ${date}`);
  const result = await generateResumenTriple(date);

  try {
    const adminBot = (await import('../../services/admin-telegram-bot.service.js')).default;
    await adminBot.sendImageToAdmins(result.path, `📋 Resumen TRIPLE - ${date}`);
  } catch (err) {
    logger.warn(`[resumen-triple] Error enviando al admin: ${err.message}`);
  }

  try {
    const publicationService = (await import('../../services/publication.service.js')).default;
    await publicationService.publishImageToChannels(
      result.gameId,
      result.path,
      result.filename,
      `📋 Resumen TRIPLE PANTERA - ${date}`
    );
  } catch (err) {
    logger.warn(`[resumen-triple] Error publicando en redes sociales: ${err.message}`);
  }

  return { success: true, ...result };
}
