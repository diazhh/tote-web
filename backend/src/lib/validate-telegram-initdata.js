import crypto from 'crypto';

function timingSafeEqualStr(a, b) {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/**
 * Valida el initData de una Telegram Mini App (esquema HMAC-SHA256 oficial).
 * @param {string} initData query-string crudo de Telegram.WebApp.initData
 * @param {string[]|string} botTokens token(s) de bot a probar (multi-bot)
 * @param {{maxAgeSec?: number}} opts ventana de frescura de auth_date (def 24h)
 */
export function validateTelegramInitData(initData, botTokens, { maxAgeSec = 86400 } = {}) {
  const params = new URLSearchParams(initData || '');
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no_hash' };
  params.delete('hash');
  params.delete('signature'); // no es parte del data-check-string del esquema HMAC

  const dataCheckString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const tokens = Array.isArray(botTokens) ? botTokens : [botTokens];

  let matched = false;
  for (const token of tokens) {
    if (!token) continue;
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    if (timingSafeEqualStr(computed, hash)) { matched = true; break; }
  }
  if (!matched) return { ok: false, reason: 'bad_hash' };

  const authDate = Number(params.get('auth_date'));
  if (!authDate || (Date.now() / 1000) - authDate > maxAgeSec) return { ok: false, reason: 'stale' };

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { /* noop */ }
  if (!user || user.id == null) return { ok: false, reason: 'no_user' };

  return { ok: true, user, authDate };
}
