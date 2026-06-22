// backend/src/lib/marketing/resumen-runner.js
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../prisma.js';
import logger from '../logger.js';
import { renderResultsBoard } from './renderer.js';
import { dateLabel } from './layout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../../../storage/results');

export async function generateResumenImage({ slug, fileSlug, title, date: dateInput, canvasName = 'portrait' }) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  const game = await prisma.game.findFirst({ where: { slug } });
  if (!game) throw new Error(`Game ${slug} not found`);

  const drawDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const draws = await prisma.draw.findMany({
    where: { gameId: game.id, drawDate, status: 'DRAWN', winnerItemId: { not: null } },
    include: { winnerItem: true },
    orderBy: { drawTime: 'asc' },
  });

  const slots = {};
  for (const draw of draws) {
    const hour = parseInt(draw.drawTime.split(':')[0], 10);
    slots[hour] = { number: String(draw.winnerItem.number), name: draw.winnerItem.name || '' };
  }

  const buffer = await renderResultsBoard({ slug, canvasName, title, dateText: dateLabel(date), slots });

  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
  const filename = `resumen_${fileSlug || slug}_${stamp}.png`;
  const outputPath = path.join(OUTPUT_PATH, filename);
  await fs.writeFile(outputPath, buffer);

  logger.info(`[resumen:${slug}] Imagen generada: ${outputPath}`);
  return { filename, path: outputPath, gameId: game.id };
}

export async function runResumenWorker({ slug, fileSlug, title, displayName, jobs }) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { date } = job.data;
  logger.info(`[resumen:${slug}] Generando resumen para ${date}`);
  const result = await generateResumenImage({ slug, fileSlug, title, date });

  try {
    const adminBot = (await import('../../services/admin-telegram-bot.service.js')).default;
    await adminBot.sendImageToAdmins(result.path, `📋 Resumen ${displayName} - ${date}`);
  } catch (err) {
    logger.warn(`[resumen:${slug}] Error enviando al admin: ${err.message}`);
  }
  try {
    const publicationService = (await import('../../services/publication.service.js')).default;
    await publicationService.publishImageToChannels(result.gameId, result.path, result.filename, `📋 Resumen ${displayName} - ${date}`);
  } catch (err) {
    logger.warn(`[resumen:${slug}] Error publicando en redes sociales: ${err.message}`);
  }
  return { success: true, ...result };
}
