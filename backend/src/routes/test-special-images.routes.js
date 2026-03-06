import { Router } from 'express';
import fs from 'fs';
import logger from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

const TEST_DATES = [
  { date: '2026-03-06', label: 'Dia normal (viernes)' },
  { date: '2026-02-16', label: 'Carnaval - Lunes' },
  { date: '2026-04-02', label: 'Jueves Santo 2026' },
  { date: '2026-07-05', label: 'Efemeride - Independencia' },
  { date: '2026-10-31', label: 'Halloween' },
  { date: '2026-12-15', label: 'Navidad (temporada)' },
];

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function sendTelegramPhoto(botToken, chatId, filePath, caption) {
  const FormData = (await import('form-data')).default;
  const fetch = (await import('node-fetch')).default;

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('photo', fs.createReadStream(filePath));
  form.append('caption', caption);

  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  return resp.json();
}

router.get('/test/special-images', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_ENDPOINTS !== 'true') {
    return res.status(403).json({ error: 'Test endpoints disabled in production' });
  }

  const type = req.query.type || 'all';
  res.json({ ok: true, message: `Generando imagenes (${type})... Revisa Telegram.` });

  // Get active bot token
  const activeBot = await prisma.adminBot.findFirst({ where: { isActive: true } });
  if (!activeBot) {
    logger.error('[test-special-images] No active admin bot found');
    return;
  }
  const botToken = activeBot.token;
  const chatId = '5279866729';

  try {
    const { generatePiramideLottopantera } = await import('../queue/workers/piramide-lottopantera.worker.js');
    const { generatePiramideLotoanimalito } = await import('../queue/workers/piramide-lotoanimalito.worker.js');

    for (const { date, label } of TEST_DATES) {
      const dateObj = new Date(`${date}T12:00:00Z`);

      if (type === 'all' || type === 'piramide-lottopantera') {
        try {
          const result = await generatePiramideLottopantera(dateObj);
          await sendTelegramPhoto(botToken, chatId, result.path, `LOTTOPANTERA ${label}\n${date}`);
          logger.info(`[test-special-images] Sent LOTTOPANTERA ${label}`);
          await delay(1500);
        } catch (e) {
          logger.error(`[test-special-images] Error LOTTOPANTERA ${label}:`, e.message);
        }
      }

      if (type === 'all' || type === 'piramide-lotoanimalito') {
        try {
          const result = await generatePiramideLotoanimalito(dateObj);
          await sendTelegramPhoto(botToken, chatId, result.path, `LOTOANIMALITO ${label}\n${date}`);
          logger.info(`[test-special-images] Sent LOTOANIMALITO ${label}`);
          await delay(1500);
        } catch (e) {
          logger.error(`[test-special-images] Error LOTOANIMALITO ${label}:`, e.message);
        }
      }
    }

    logger.info('[test-special-images] Todas las imagenes enviadas');
  } catch (error) {
    logger.error('[test-special-images] Error general:', error);
  }
});

export default router;
