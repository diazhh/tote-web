import logger from '../../lib/logger.js';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';

export async function stepGenerateImageWorker(job) {
  const { drawId } = job.data;
  logger.info(`[step-generate-image] Generando imagen para draw ${drawId}`);

  let imagePath = null;
  let imageError = null;

  // Paso no-crítico: capturar error para no bloquear pipeline
  try {
    const { generateDrawImage } = await import('../../services/imageService.js');
    const imageResult = await generateDrawImage(drawId);
    if (imageResult && imageResult.filename) {
      imagePath = `./storage/results/${imageResult.filename}`;
      logger.info(`[step-generate-image] Imagen generada: ${imagePath}`);
    }
  } catch (err) {
    imageError = err.message;
    logger.error(`[step-generate-image] Error generando imagen: ${err.message}`);
  }

  // Enviar imagen al admin Telegram (siempre, independiente de DISABLE_SOCIAL_CHANNELS)
  if (imagePath) {
    try {
      const { prisma } = await import('../../lib/prisma.js');
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: { game: true, winnerItem: true },
      });
      const adminBot = (await import('../../services/admin-telegram-bot.service.js')).default;
      const caption = draw
        ? `📸 ${draw.game.name} - ${draw.drawTime}\n🏆 ${draw.winnerItem?.name || draw.winnerItem?.number || ''}`
        : `📸 Draw ${drawId}`;
      await adminBot.sendImageToAdmins(imagePath, caption);
    } catch (err) {
      logger.warn(`[step-generate-image] Error enviando imagen al admin: ${err.message}`);
    }
  }

  // Siempre encolar siguiente paso (pipeline continúa aunque la imagen falle)
  const boss = getBoss();
  await boss.send(QUEUES.STEP_NOTIFY_ADMINS, { drawId, imagePath, imageError }, {
    singletonKey: `notify-${drawId}`,
    ...QUEUE_CONFIGS[QUEUES.STEP_NOTIFY_ADMINS],
  });

  return { success: true, drawId, imagePath, imageError };
}
