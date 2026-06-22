// backend/src/lib/marketing/resumen-runner.js
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../prisma.js';
import logger from '../logger.js';
import { renderTemplateToPng } from './html-renderer.js';
import { buildDailyFill } from './board-fill.js';
import { buildStoryVideo } from './video-renderer.js';
import { dateLabel } from './layout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../../../storage/results');

/**
 * Generate the daily "resultados del día" pieces:
 *  - feed  1080×1350 PNG
 *  - story 1080×1920 PNG
 *  - story-video 1080×1920 MP4 (best-effort; null if ffmpeg fails)
 * Returns feed `filename`/`path` (back-compat) plus story/video fields.
 */
export async function generateResumenImage({ slug, fileSlug, title, date: dateInput }) {
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

  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
  const base = fileSlug || slug;
  const dateText = dateLabel(date);

  // Feed 1080×1350
  const feed = buildDailyFill(slug, { dateText, slots, variant: 'feed' });
  const feedBuf = await renderTemplateToPng({ templatePath: feed.templatePath, fill: feed.fill, width: 1080, height: 1350 });
  const feedFilename = `resumen_${base}_${stamp}.png`;
  const feedPath = path.join(OUTPUT_PATH, feedFilename);
  await fs.writeFile(feedPath, feedBuf);

  // Story 1080×1920
  const story = buildDailyFill(slug, { dateText, slots, variant: 'story' });
  const storyBuf = await renderTemplateToPng({ templatePath: story.templatePath, fill: story.fill, width: 1080, height: 1920 });
  const storyFilename = `resumen_${base}_${stamp}_story.png`;
  const storyPath = path.join(OUTPUT_PATH, storyFilename);
  await fs.writeFile(storyPath, storyBuf);

  // Story-video 9:16 (best-effort — falls back to story image on failure)
  let videoFilename = `resumen_${base}_${stamp}_story.mp4`;
  try {
    await buildStoryVideo({ imagePath: storyPath, outPath: path.join(OUTPUT_PATH, videoFilename), durationSec: 6 });
  } catch (err) {
    logger.warn(`[resumen:${slug}] story-video falló (${err.message}); se publicará la story como imagen`);
    videoFilename = null;
  }

  logger.info(`[resumen:${slug}] Generado feed+story${videoFilename ? '+video' : ''}: ${feedPath}`);
  return {
    gameId: game.id,
    // back-compat (feed)
    filename: feedFilename, path: feedPath,
    feedFilename, feedPath,
    storyFilename, storyPath,
    videoFilename,
  };
}

export async function runResumenWorker({ slug, fileSlug, title, displayName, jobs }) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { date } = job.data;
  logger.info(`[resumen:${slug}] Generando resumen para ${date}`);
  const r = await generateResumenImage({ slug, fileSlug, title, date });

  const caption = `📋 Resumen ${displayName} - ${date}`;

  try {
    const adminBot = (await import('../../services/admin-telegram-bot.service.js')).default;
    await adminBot.sendImageToAdmins(r.feedPath, caption);
  } catch (err) {
    logger.warn(`[resumen:${slug}] Error enviando al admin: ${err.message}`);
  }
  try {
    const publicationService = (await import('../../services/publication.service.js')).default;
    // Feed → todos los canales activos (incluye Twitter/X)
    await publicationService.publishImageToChannels(r.gameId, r.feedPath, r.feedFilename, caption);
    // Story 9:16 → IG/FB story nativa (video con fallback a imagen) + TG/WA imagen
    await publicationService.publishStoryToChannels(r.gameId, r.storyPath, r.storyFilename, caption, { videoFilename: r.videoFilename });
  } catch (err) {
    logger.warn(`[resumen:${slug}] Error publicando en redes sociales: ${err.message}`);
  }
  return { success: true, ...r };
}
