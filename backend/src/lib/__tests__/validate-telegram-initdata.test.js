import { describe, test, expect } from '@jest/globals';
import crypto from 'crypto';
import { validateTelegramInitData } from '../validate-telegram-initdata.js';

const TOKEN = '123456:FAKE_BOT_TOKEN_FOR_TESTS';

// Firma un initData válido para un token dado (réplica del esquema de Telegram).
function signInitData(token, fields) {
  const params = new URLSearchParams(fields);
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  params.append('hash', hash);
  return params.toString();
}
const now = () => Math.floor(Date.now() / 1000);
const userJson = JSON.stringify({ id: 777, first_name: 'Admin', username: 'jefe' });

describe('validateTelegramInitData', () => {
  test('initData válido → ok con user', () => {
    const initData = signInitData(TOKEN, { auth_date: String(now()), user: userJson, query_id: 'AAA' });
    const r = validateTelegramInitData(initData, [TOKEN]);
    expect(r.ok).toBe(true);
    expect(r.user.id).toBe(777);
  });

  test('hash inválido → ok=false bad_hash', () => {
    const initData = signInitData(TOKEN, { auth_date: String(now()), user: userJson });
    const r = validateTelegramInitData(initData.replace(/hash=[a-f0-9]+/, 'hash=' + 'd'.repeat(64)), [TOKEN]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('bad_hash');
  });

  test('auth_date viejo → ok=false stale', () => {
    const initData = signInitData(TOKEN, { auth_date: String(now() - 100000), user: userJson });
    const r = validateTelegramInitData(initData, [TOKEN], { maxAgeSec: 3600 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('stale');
  });

  test('firmado por otro bot → ok=false bad_hash', () => {
    const initData = signInitData('999:OTHER', { auth_date: String(now()), user: userJson });
    const r = validateTelegramInitData(initData, [TOKEN]);
    expect(r.ok).toBe(false);
  });

  test('multi-bot: valida si CUALQUIER token cuadra', () => {
    const initData = signInitData(TOKEN, { auth_date: String(now()), user: userJson });
    const r = validateTelegramInitData(initData, ['111:NOPE', TOKEN, '222:NOPE']);
    expect(r.ok).toBe(true);
  });

  test('sin hash → ok=false no_hash', () => {
    const r = validateTelegramInitData('auth_date=123&user=%7B%7D', [TOKEN]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_hash');
  });
});
