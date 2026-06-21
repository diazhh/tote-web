// backend/src/controllers/telegram-miniapp.controller.js
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import authService from '../services/auth.service.js';
import { validateTelegramInitData } from '../lib/validate-telegram-initdata.js';

const MAX_AGE_SEC = Number(process.env.TG_INITDATA_MAX_AGE_SEC || 86400);

export async function authMiniApp(req, res) {
  const { initData } = req.body || {};
  if (!initData || typeof initData !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing initData' });
  }

  // Tokens de todos los bots admin activos + fallback de env.
  const bots = await prisma.adminTelegramBot.findMany({ where: { isActive: true }, select: { botToken: true } });
  const tokens = bots.map((b) => b.botToken).filter(Boolean);
  if (process.env.ADMIN_TELEGRAM_BOT_TOKEN) tokens.push(process.env.ADMIN_TELEGRAM_BOT_TOKEN);

  const result = validateTelegramInitData(initData, tokens, { maxAgeSec: MAX_AGE_SEC });
  if (!result.ok) {
    logger.warn(`[tg-miniapp] initData rechazado: ${result.reason}`);
    return res.status(401).json({ success: false, error: 'Invalid Telegram session' });
  }

  const telegramUserId = String(result.user.id);
  const user = await prisma.user.findFirst({
    where: { telegramUserId },
    include: { games: { include: { game: true } } },
  });
  if (!user || !user.isActive || !['ADMIN', 'OPERATOR'].includes(user.role)) {
    return res.status(403).json({ success: false, error: 'No autorizado (no admin)' });
  }

  let games;
  if (user.role === 'ADMIN') {
    games = await prisma.game.findMany({
      where: { isActive: true }, select: { id: true, slug: true, name: true }, orderBy: { name: 'asc' },
    });
  } else {
    games = user.games.map((ug) => ({ id: ug.game.id, slug: ug.game.slug, name: ug.game.name }));
  }

  const token = authService.generateToken(user);
  return res.json({ success: true, token, user: { id: user.id, name: user.username, role: user.role }, games });
}
