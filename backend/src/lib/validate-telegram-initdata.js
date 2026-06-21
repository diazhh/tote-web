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

  // Data-check-strings candidatos. Telegram (Bot API 8.0+) agrega un campo
  // `signature` (validación Ed25519 de terceros). Para el HMAC del bot, los
  // clientes modernos INCLUYEN `signature` en el data-check-string, mientras
  // que clientes/libs antiguas lo excluyen. Probamos ambas variantes para ser
  // robustos entre versiones; aceptar cualquiera NO debilita la seguridad:
  // ambas requieren el token del bot como secreto para producir un hash válido.
  const buildDcs = (p) => [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const withSig = buildDcs(params);
  const noSigParams = new URLSearchParams(params.toString());
  noSigParams.delete('signature');
  const withoutSig = buildDcs(noSigParams);
  const candidates = withSig === withoutSig ? [withSig] : [withSig, withoutSig];

  const tokens = Array.isArray(botTokens) ? botTokens : [botTokens];

  let matched = false;
  for (const token of tokens) {
    if (!token) continue;
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    for (const dcs of candidates) {
      const computed = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
      if (timingSafeEqualStr(computed, hash)) { matched = true; break; }
    }
    if (matched) break;
  }
  if (!matched) return { ok: false, reason: 'bad_hash' };

  const authDate = Number(params.get('auth_date'));
  if (!authDate || (Date.now() / 1000) - authDate > maxAgeSec) return { ok: false, reason: 'stale' };

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { /* noop */ }
  if (!user || user.id == null) return { ok: false, reason: 'no_user' };

  return { ok: true, user, authDate };
}
