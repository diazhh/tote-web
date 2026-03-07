import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, '../../../storage');
const BASES_PATH = path.join(STORAGE, 'bases/2');
const MIN_PATH = path.join(BASES_PATH, 'min');
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

// Circle positions (measured from resumen_base.png)
const CIRCLE_SIZE = 80;
const LEFT_COL_X = 370;
const RIGHT_COL_X = 860;
const FIRST_ROW_Y = 330;
const ROW_SPACING = 130;

export async function generateResumenLottopantera(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  // 1. Query draws for this date (LOTTOPANTERA = slug 'lottopantera')
  const game = await prisma.game.findFirst({ where: { slug: 'lottopantera' } });
  if (!game) throw new Error('Game lottopantera not found');

  const drawDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const draws = await prisma.draw.findMany({
    where: { gameId: game.id, drawDate, status: 'DRAWN', winnerItemId: { not: null } },
    include: { winnerItem: true },
    orderBy: { drawTime: 'asc' },
  });

  // Map draws by hour
  const drawsByHour = {};
  for (const draw of draws) {
    const hour = parseInt(draw.drawTime.split(':')[0]);
    drawsByHour[hour] = draw;
  }

  // 2. Load background
  const bgPath = path.join(BASES_PATH, 'resumen_base.png');

  // 3. Build composite layers
  const layers = [];

  for (const slot of TIME_SLOTS) {
    const draw = drawsByHour[slot.hour];
    if (!draw) continue;

    const cx = slot.col === 'left' ? LEFT_COL_X : RIGHT_COL_X;
    const cy = FIRST_ROW_Y + slot.row * ROW_SPACING;

    // Animal mini image: number → "01.png", "48.png", etc.
    const num = draw.winnerItem.number;
    const filename = num === '0' ? '0.png' : `${String(num).padStart(2, '0')}.png`;
    const animalPath = path.join(MIN_PATH, filename);

    try {
      await fs.access(animalPath);
      const resized = await sharp(animalPath)
        .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .resize(CIRCLE_SIZE, CIRCLE_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

      layers.push({
        input: resized,
        left: Math.round(cx - CIRCLE_SIZE / 2),
        top: Math.round(cy - CIRCLE_SIZE / 2),
      });
    } catch {
      // Skip if image missing
    }
  }

  // 4. Date text overlay
  const displayDate = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCFullYear()).slice(-2)}`;
  const fontPath = path.join(FONTS_PATH, 'Alphakind.ttf');
  const dateSvg = Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face { font-family: 'Alphakind'; src: url('file://${fontPath}'); }
      </style>
      <text x="430" y="205" font-family="Alphakind" font-size="32px" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${displayDate}</text>
    </svg>
  `);
  layers.push({ input: dateSvg, left: 0, top: 0 });

  // 5. Composite and save
  const outputFilename = `resumen_lottopantera_${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);

  await sharp(bgPath)
    .composite(layers)
    .toFile(outputPath);

  logger.info(`[resumen-lottopantera] Imagen generada: ${outputPath}`);
  return { filename: outputFilename, path: outputPath, gameId: game.id };
}

export async function resumenLottopanteraWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { date } = job.data;
  logger.info(`[resumen-lottopantera] Generando resumen para ${date}`);
  const result = await generateResumenLottopantera(date);

  try {
    const adminBot = (await import('../../services/admin-telegram-bot.service.js')).default;
    await adminBot.sendImageToAdmins(result.path, `📋 Resumen LOTTOPANTERA - ${date}`);
  } catch (err) {
    logger.warn(`[resumen-lottopantera] Error enviando al admin: ${err.message}`);
  }

  try {
    const publicationService = (await import('../../services/publication.service.js')).default;
    await publicationService.publishImageToChannels(
      result.gameId,
      result.path,
      result.filename,
      `📋 Resumen LOTTOPANTERA - ${date}`
    );
  } catch (err) {
    logger.warn(`[resumen-lottopantera] Error publicando en redes sociales: ${err.message}`);
  }

  return { success: true, ...result };
}
