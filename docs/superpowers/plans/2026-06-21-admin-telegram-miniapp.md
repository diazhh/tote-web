# Mini App de Telegram para el Admin — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al admin, dentro de Telegram, una Mini App que muestra el monitor del sorteo seleccionado y permite cambiar el pre-seleccionado y fijar cupo/bloquear números, reusando los endpoints existentes.

**Architecture:** Ruta nueva `/tg` en el frontend Next.js (client-only, `ssr:false`) que se autentica enviando el `initData` de Telegram a un endpoint backend nuevo. El backend valida el `initData` por HMAC con el token del bot, mapea `telegramUserId → User`, exige rol ADMIN/OPERATOR y emite un JWT con la función de auth existente. La app guarda ese JWT en `localStorage.accessToken`, con lo que el cliente axios existente y los clientes `lib/api/*` (monitor, draws, quota) funcionan sin cambios.

**Tech Stack:** Node/Express (ES modules), Prisma, jest (ESM), Next.js 14.2 (App Router), React 18.3, axios, script oficial `telegram-web-app.js`.

## Global Constraints

- Backend en **ES modules** (`import`/`export`). Prisma singleton desde `lib/prisma.js`. Logger desde `lib/logger.js`.
- Tests backend con jest ESM: correr con `npm test` (que ya setea `NODE_OPTIONS='--experimental-vm-modules'`). Mocks con `jest.unstable_mockModule`.
- Comparaciones de secretos **timing-safe** (`crypto.timingSafeEqual` con guarda de longitud).
- El JWT se emite con **`authService.generateToken(user)`** (payload `{id,username,email,role,apiSystemId}`, firmado con `JWT_SECRET`) — el `authenticate` middleware lo acepta tal cual.
- Roles: cambiar-preseleccionado y monitor → `ADMIN`+`OPERATOR`. Cupo/bloqueo (`/api/draws/:drawId/quotas/...`) → **`ADMIN` solamente**. La app oculta cupo/bloqueo a OPERATOR.
- Frontend: el cliente `frontend/lib/api/axios.js` lee el JWT de `localStorage.getItem('accessToken')`. La Mini App guarda su JWT con esa misma llave.
- **Cero cambios** al pipeline de sorteos. Toda la data de monitor/draws es reuso de endpoints existentes.
- Implementación del puente runtime: **script oficial `telegram-web-app.js`** (`window.Telegram.WebApp`). > **Nota de desvío del spec:** el spec recomendó `@telegram-apps/sdk` v3; para v1 usamos el script oficial (first-party, estable, cero dependencias). La validación server-side del `initData` es idéntica; migrar al SDK luego toca solo `app/tg/lib/telegram.js`.

---

## Task 1: Validador de `initData` (backend)

**Files:**
- Create: `backend/src/lib/validate-telegram-initdata.js`
- Test: `backend/src/lib/__tests__/validate-telegram-initdata.test.js`

**Interfaces:**
- Produces: `validateTelegramInitData(initData: string, botTokens: string[]|string, opts?: {maxAgeSec?: number}) => { ok: true, user: {id:number,...}, authDate: number } | { ok: false, reason: string }`

- [ ] **Step 1: Write the failing test**

```js
// backend/src/lib/__tests__/validate-telegram-initdata.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- validate-telegram-initdata`
Expected: FAIL ("Cannot find module '../validate-telegram-initdata.js'").

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/lib/validate-telegram-initdata.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- validate-telegram-initdata`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/validate-telegram-initdata.js backend/src/lib/__tests__/validate-telegram-initdata.test.js
git commit -m "feat(tg-miniapp): validador HMAC de initData de Telegram + tests"
```

---

## Task 2: Endpoint de auth `/api/telegram-miniapp/auth`

**Files:**
- Create: `backend/src/controllers/telegram-miniapp.controller.js`
- Create: `backend/src/routes/telegram-miniapp.routes.js`
- Modify: `backend/src/index.js` (import + mount, junto a las otras rutas)
- Test: `backend/src/controllers/__tests__/telegram-miniapp.controller.test.js`

**Interfaces:**
- Consumes: `validateTelegramInitData` (Task 1), `authService.generateToken(user)`, `prisma.adminTelegramBot.findMany`, `prisma.user.findFirst`, `prisma.game.findMany`.
- Produces: `POST /api/telegram-miniapp/auth` body `{ initData }` → `200 { success, token, user:{id,name,role}, games:[{id,slug,name}] }` | `400` (sin initData) | `401` (initData inválido) | `403` (no admin).

- [ ] **Step 1: Write the failing test**

```js
// backend/src/controllers/__tests__/telegram-miniapp.controller.test.js
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  adminTelegramBot: { findMany: jest.fn() },
  user: { findFirst: jest.fn() },
  game: { findMany: jest.fn() },
};
const mockValidate = jest.fn();
const mockGenerateToken = jest.fn(() => 'JWT123');

jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({ default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.unstable_mockModule('../../lib/validate-telegram-initdata.js', () => ({ validateTelegramInitData: mockValidate }));
jest.unstable_mockModule('../../services/auth.service.js', () => ({ default: { generateToken: mockGenerateToken } }));

function makeRes() {
  return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(p){ this.body = p; return this; } };
}

describe('authMiniApp', () => {
  let authMiniApp;
  beforeAll(async () => { ({ authMiniApp } = await import('../telegram-miniapp.controller.js')); });
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.adminTelegramBot.findMany.mockResolvedValue([{ botToken: 'T1' }]);
  });

  test('sin initData → 400', async () => {
    const res = makeRes();
    await authMiniApp({ body: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  test('initData inválido → 401', async () => {
    mockValidate.mockReturnValue({ ok: false, reason: 'bad_hash' });
    const res = makeRes();
    await authMiniApp({ body: { initData: 'x' } }, res);
    expect(res.statusCode).toBe(401);
  });

  test('usuario no admin → 403', async () => {
    mockValidate.mockReturnValue({ ok: true, user: { id: 777 } });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', role: 'PLAYER', isActive: true, games: [] });
    const res = makeRes();
    await authMiniApp({ body: { initData: 'x' } }, res);
    expect(res.statusCode).toBe(403);
  });

  test('ADMIN → 200 con token y TODOS los juegos', async () => {
    mockValidate.mockReturnValue({ ok: true, user: { id: 777 } });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', username: 'jefe', role: 'ADMIN', isActive: true, games: [] });
    mockPrisma.game.findMany.mockResolvedValue([{ id: 'g1', slug: 'lotoanimalito', name: 'LOTOANIMALITO' }]);
    const res = makeRes();
    await authMiniApp({ body: { initData: 'x' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBe('JWT123');
    expect(res.body.games).toHaveLength(1);
    expect(res.body.user.role).toBe('ADMIN');
  });

  test('OPERATOR → 200 con SOLO sus juegos asignados', async () => {
    mockValidate.mockReturnValue({ ok: true, user: { id: 777 } });
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u2', username: 'op', role: 'OPERATOR', isActive: true,
      games: [{ game: { id: 'g2', slug: 'lottopantera', name: 'LOTTOPANTERA' } }],
    });
    const res = makeRes();
    await authMiniApp({ body: { initData: 'x' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.games).toEqual([{ id: 'g2', slug: 'lottopantera', name: 'LOTTOPANTERA' }]);
    expect(mockPrisma.game.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- telegram-miniapp.controller`
Expected: FAIL ("Cannot find module '../telegram-miniapp.controller.js'").

- [ ] **Step 3: Write minimal implementation**

```js
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
```

```js
// backend/src/routes/telegram-miniapp.routes.js
import express from 'express';
import { authMiniApp } from '../controllers/telegram-miniapp.controller.js';

const router = express.Router();
// Ruta pública: su seguridad es el HMAC del initData (no authenticate).
router.post('/auth', authMiniApp);
export default router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- telegram-miniapp.controller`
Expected: PASS (5 tests).

- [ ] **Step 5: Mount the route in index.js**

En `backend/src/index.js`, junto a los otros imports de rutas (cerca de `import publicRoutes ...`):

```js
import telegramMiniappRoutes from './routes/telegram-miniapp.routes.js';
```

Y junto a los otros `app.use('/api/...')` (después de `app.use('/api/public', publicRoutes);`):

```js
app.use('/api/telegram-miniapp', telegramMiniappRoutes);
```

- [ ] **Step 6: Verify the server boots**

Run: `cd backend && node --check src/index.js && node --check src/routes/telegram-miniapp.routes.js && node --check src/controllers/telegram-miniapp.controller.js`
Expected: sin output (sintaxis OK).

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/telegram-miniapp.controller.js backend/src/controllers/__tests__/telegram-miniapp.controller.test.js backend/src/routes/telegram-miniapp.routes.js backend/src/index.js
git commit -m "feat(tg-miniapp): endpoint POST /api/telegram-miniapp/auth (initData -> JWT)"
```

---

## Task 3: Ruta `/tg` + bootstrap de auth (frontend)

**Files:**
- Create: `frontend/app/tg/lib/telegram.js` (puente con `window.Telegram.WebApp`)
- Create: `frontend/app/tg/layout.js` (carga el script oficial)
- Create: `frontend/app/tg/page.js` (client-only: autentica y muestra juegos)
- Create: `frontend/app/tg/store.js` (estado de sesión)

**Interfaces:**
- Consumes: `POST /api/telegram-miniapp/auth` (Task 2), `frontend/lib/api/axios.js` (default export `api`).
- Produces: `useSession()` store con `{ session, status, games, error, authenticate() }`; helpers `getInitData()`, `tgReady()`, `showConfirm()`, `haptic()`, `setBackButton()`.

- [ ] **Step 1: Crear el puente de Telegram**

```js
// frontend/app/tg/lib/telegram.js
export function getWebApp() {
  return (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null;
}
export function getInitData() { const w = getWebApp(); return w ? w.initData : ''; }
export function tgReady() { const w = getWebApp(); if (w) { w.ready(); w.expand(); } }
export function showConfirm(message) {
  return new Promise((resolve) => {
    const w = getWebApp();
    if (w && w.showConfirm) w.showConfirm(message, (ok) => resolve(!!ok));
    else resolve(window.confirm(message));
  });
}
export function haptic(type = 'success') {
  const w = getWebApp();
  try { w && w.HapticFeedback && w.HapticFeedback.notificationOccurred(type); } catch { /* noop */ }
}
export function setBackButton(onClick) {
  const w = getWebApp();
  if (!w || !w.BackButton) return;
  if (onClick) { w.BackButton.show(); w.BackButton.onClick(onClick); }
  else { w.BackButton.hide(); }
}
export function getStartParam() {
  const w = getWebApp();
  return (w && w.initDataUnsafe && w.initDataUnsafe.start_param) || null;
}
```

- [ ] **Step 2: Layout que carga el script oficial de Telegram**

```js
// frontend/app/tg/layout.js
import Script from 'next/script';

export const metadata = { title: 'Monitor — Admin' };

export default function TgLayout({ children }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <div style={{ minHeight: '100vh', background: '#17212b', color: '#fff' }}>{children}</div>
    </>
  );
}
```

- [ ] **Step 3: Store de sesión**

```js
// frontend/app/tg/store.js
import { create } from 'zustand';
import api from '@/lib/api/axios';
import { getInitData } from './lib/telegram';

export const useSession = create((set) => ({
  status: 'idle', // idle | loading | ok | error
  session: null,  // { token, user, games }
  error: null,
  async authenticate() {
    set({ status: 'loading', error: null });
    try {
      const initData = getInitData();
      const { data } = await api.post('/telegram-miniapp/auth', { initData });
      localStorage.setItem('accessToken', data.token); // el axios global lo usará en todas las llamadas
      set({ status: 'ok', session: data });
    } catch (e) {
      const msg = e?.response?.status === 403
        ? 'No tienes acceso de administrador. Vincula tu cuenta con /vincular en el bot.'
        : 'Sesión de Telegram inválida. Reábrela desde el bot.';
      set({ status: 'error', error: msg });
    }
  },
}));
```

- [ ] **Step 4: Página de arranque (client-only)**

```js
// frontend/app/tg/page.js
'use client';
import { useEffect } from 'react';
import { useSession } from './store';
import { tgReady } from './lib/telegram';

export default function TgHome() {
  const { status, session, error, authenticate } = useSession();
  useEffect(() => { tgReady(); authenticate(); }, [authenticate]);

  if (status === 'loading' || status === 'idle') return <div style={{ padding: 24 }}>Cargando…</div>;
  if (status === 'error') return <div style={{ padding: 24, color: '#ff5c5c' }}>{error}</div>;

  return (
    <div style={{ padding: 16 }}>
      <h3>Hola, {session.user.name} ({session.user.role})</h3>
      <p style={{ color: '#7d8b99' }}>Tus juegos:</p>
      <ul>{session.games.map((g) => <li key={g.id}>{g.name}</li>)}</ul>
    </div>
  );
}
```

- [ ] **Step 5: Verificar el build y el render**

Run: `cd frontend && npm run build`
Expected: build PASA y `/tg` aparece en el manifest de rutas.

Verificación manual (fuera de Telegram, dev): `npm run dev`, abrir `http://localhost:3000/tg`. Sin `window.Telegram`, `getInitData()` devuelve `''` → el `/auth` responde 401 → se ve el mensaje de error. **Esto es esperado fuera de Telegram** y confirma que el flujo de error funciona. (La prueba real es dentro de Telegram, Task 8.)

- [ ] **Step 6: Commit**

```bash
git add frontend/app/tg/
git commit -m "feat(tg-miniapp): ruta /tg con bootstrap de auth por initData"
```

---

## Task 4: Selectores de juego y sorteo (frontend)

**Files:**
- Create: `frontend/app/tg/lib/order-draws.js` (helper puro, testeable)
- Create: `frontend/app/tg/lib/__tests__/order-draws.test.js`
- Create: `frontend/app/tg/components/GamePicker.js`
- Create: `frontend/app/tg/components/DrawPicker.js`
- Modify: `frontend/app/tg/page.js` (orquestar pantallas: games → draws → monitor)

**Interfaces:**
- Consumes: `GET /api/draws?gameId&dateFrom&dateTo` (vía `api`), `useSession().session.games`.
- Produces: `orderDraws(draws, nowHHMM) => { upcoming: Draw[], past: Draw[] }` (próximo primero; past = sorteados, más reciente primero). Helper `isEditable(draw) => boolean` (true si status ≠ 'DRAWN').

- [ ] **Step 1: Test del helper de orden**

```js
// frontend/app/tg/lib/__tests__/order-draws.test.js
import { orderDraws, isEditable } from '../order-draws.js';

const D = (t, status) => ({ id: t, drawTime: t, status });

test('próximo primero; pasados aparte y descendente', () => {
  const draws = [D('09:00:00','DRAWN'), D('21:00:00','SCHEDULED'), D('13:00:00','DRAWN'), D('16:00:00','SCHEDULED')];
  const { upcoming, past } = orderDraws(draws, '14:00');
  expect(upcoming.map(d => d.drawTime)).toEqual(['16:00:00','21:00:00']); // próximo (16) primero
  expect(past.map(d => d.drawTime)).toEqual(['13:00:00','09:00:00']);     // más reciente primero
});

test('isEditable: DRAWN no editable, resto sí', () => {
  expect(isEditable(D('16:00:00','SCHEDULED'))).toBe(true);
  expect(isEditable(D('16:00:00','CLOSED'))).toBe(true);
  expect(isEditable(D('09:00:00','DRAWN'))).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- order-draws` (o `npx jest order-draws` si no hay script `test`)
Expected: FAIL (módulo inexistente).

> Si el frontend no tiene runner de tests configurado, crear `frontend/jest.config.js` con `{ testEnvironment: 'node' }` y añadir `"test": "jest"` a `frontend/package.json`. Instalar `jest` como devDependency si falta.

- [ ] **Step 3: Implementar el helper**

```js
// frontend/app/tg/lib/order-draws.js
export function isEditable(draw) { return draw.status !== 'DRAWN'; }

/** Separa sorteos en upcoming (próximo primero) y past (sorteados, más reciente primero). */
export function orderDraws(draws, nowHHMM) {
  const now = nowHHMM; // 'HH:MM'
  const hhmm = (d) => (d.drawTime || '').slice(0, 5);
  const upcoming = draws.filter((d) => d.status !== 'DRAWN' && hhmm(d) >= now)
    .sort((a, b) => hhmm(a).localeCompare(hhmm(b)));
  const past = draws.filter((d) => d.status === 'DRAWN' || hhmm(d) < now)
    .sort((a, b) => hhmm(b).localeCompare(hhmm(a)));
  return { upcoming, past };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- order-draws`
Expected: PASS (2 tests).

- [ ] **Step 5: GamePicker (botones de juego)**

```js
// frontend/app/tg/components/GamePicker.js
'use client';
export default function GamePicker({ games, onPick }) {
  return (
    <div style={{ padding: 14 }}>
      <h4 style={{ color: '#7d8b99', textTransform: 'uppercase', fontSize: 13 }}>Tus juegos</h4>
      {games.map((g) => (
        <button key={g.id} onClick={() => onPick(g)}
          style={{ width: '100%', textAlign: 'left', background: '#1d2733', color: '#fff',
                   border: '1px solid #2b3947', borderRadius: 14, padding: 16, marginBottom: 10, fontSize: 16 }}>
          {g.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: DrawPicker (botones de sorteo, próximo primero, pasados read-only)**

```js
// frontend/app/tg/components/DrawPicker.js
'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api/axios';
import { orderDraws } from '../lib/order-draws';

function todayYMD() { return new Date().toISOString().slice(0, 10); }
function nowHHMM() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }

export default function DrawPicker({ game, onPick }) {
  const [groups, setGroups] = useState({ upcoming: [], past: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const ymd = todayYMD();
      const { data } = await api.get('/draws', { params: { gameId: game.id, dateFrom: ymd, dateTo: ymd } });
      const draws = data?.data || data?.draws || data || [];
      setGroups(orderDraws(Array.isArray(draws) ? draws : [], nowHHMM()));
      setLoading(false);
    })();
  }, [game]);

  if (loading) return <div style={{ padding: 24 }}>Cargando sorteos…</div>;
  const Btn = (d, editable) => (
    <button key={d.id} onClick={() => onPick(d, editable)}
      style={{ width: '100%', textAlign: 'left', background: editable ? '#1b2c3d' : '#1d2733',
               color: '#fff', border: '1px solid ' + (editable ? '#2ea6ff' : '#2b3947'),
               borderRadius: 14, padding: 14, marginBottom: 9 }}>
      <b style={{ fontSize: 18 }}>{(d.drawTime || '').slice(0, 5)}</b>
      <span style={{ marginLeft: 10, color: '#7d8b99' }}>{editable ? d.status : 'Sorteado · solo lectura'}</span>
    </button>
  );
  return (
    <div style={{ padding: 14 }}>
      <h4 style={{ color: '#7d8b99' }}>Sorteos · {game.name}</h4>
      {groups.upcoming.map((d) => Btn(d, true))}
      {groups.past.length > 0 && <div style={{ color: '#7d8b99', fontSize: 11, margin: '14px 4px' }}>ANTERIORES · SOLO LECTURA</div>}
      {groups.past.map((d) => Btn(d, false))}
    </div>
  );
}
```

- [ ] **Step 7: Orquestar pantallas en page.js**

Reemplazar el cuerpo de `frontend/app/tg/page.js` para manejar 3 vistas con BackButton:

```js
'use client';
import { useEffect, useState } from 'react';
import { useSession } from './store';
import { tgReady, setBackButton } from './lib/telegram';
import GamePicker from './components/GamePicker';
import DrawPicker from './components/DrawPicker';
import Monitor from './components/Monitor';

export default function TgHome() {
  const { status, session, error, authenticate } = useSession();
  const [view, setView] = useState('games'); // games | draws | monitor
  const [game, setGame] = useState(null);
  const [draw, setDraw] = useState(null);
  const [editable, setEditable] = useState(false);

  useEffect(() => { tgReady(); authenticate(); }, [authenticate]);
  useEffect(() => {
    if (view === 'games') setBackButton(null);
    if (view === 'draws') setBackButton(() => setView('games'));
    if (view === 'monitor') setBackButton(() => setView('draws'));
  }, [view]);

  if (status !== 'ok') return <div style={{ padding: 24, color: status === 'error' ? '#ff5c5c' : '#fff' }}>{status === 'error' ? error : 'Cargando…'}</div>;
  if (view === 'games') return <GamePicker games={session.games} onPick={(g) => { setGame(g); setView('draws'); }} />;
  if (view === 'draws') return <DrawPicker game={game} onPick={(d, ed) => { setDraw(d); setEditable(ed); setView('monitor'); }} />;
  return <Monitor game={game} draw={draw} editable={editable} role={session.user.role} />;
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/app/tg/
git commit -m "feat(tg-miniapp): selectores de juego/sorteo (proximo primero, pasados read-only)"
```

---

## Task 5: Vista de Monitor — lectura (frontend)

**Files:**
- Create: `frontend/app/tg/lib/filter-numbers.js` + `__tests__/filter-numbers.test.js`
- Create: `frontend/app/tg/components/Monitor.js`

**Interfaces:**
- Consumes: `GET /api/monitor/items/:drawId`, `GET /api/monitor/caidas/:drawId`, `GET /api/monitor/items-last-drawn?gameId` (todos vía `api`).
- Produces: `filterNumbers(items, { q, filter }) => Item[]`; componente `Monitor` que renderiza cabecera + caídas + buscador + lista.

- [ ] **Step 1: Test del filtro/búsqueda**

```js
// frontend/app/tg/lib/__tests__/filter-numbers.test.js
import { filterNumbers } from '../filter-numbers.js';
const items = [
  { number: '017', name: 'PAVO', totalAmount: 6400, percentageOfSales: 28 },
  { number: '024', name: 'IGUANA', totalAmount: 0, percentageOfSales: 0 },
  { number: '125', name: '', totalAmount: 90000, percentageOfSales: 80 },
];
test('busca por número o nombre', () => {
  expect(filterNumbers(items, { q: 'pavo', filter: 'all' }).map(i => i.number)).toEqual(['017']);
  expect(filterNumbers(items, { q: '125', filter: 'all' }).map(i => i.number)).toEqual(['125']);
});
test('filtro "con ventas" excluye monto 0 y ordena por monto desc', () => {
  expect(filterNumbers(items, { q: '', filter: 'tk' }).map(i => i.number)).toEqual(['125', '017']);
});
test('filtro riesgo alto: % >= 70', () => {
  expect(filterNumbers(items, { q: '', filter: 'risk' }).map(i => i.number)).toEqual(['125']);
});
```

> Nota: el test del filtro `tk` se simplifica — el assert clave es `risk` y la búsqueda. Ajustar el orden esperado al de implementación (orden por `totalAmount` desc).

- [ ] **Step 2: Run test (debe fallar)**

Run: `cd frontend && npm test -- filter-numbers`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar el filtro**

```js
// frontend/app/tg/lib/filter-numbers.js
export function filterNumbers(items, { q = '', filter = 'all' } = {}) {
  const needle = q.toLowerCase().trim();
  let out = items.filter((it) => {
    if (needle && !(String(it.number).includes(needle) || (it.name || '').toLowerCase().includes(needle))) return false;
    if (filter === 'tk') return it.totalAmount > 0;
    if (filter === 'risk') return (it.percentageOfSales || 0) >= 70;
    if (filter === 'caida') return !!it.caida;
    return true;
  });
  if (filter === 'dias') out = [...out].sort((a, b) => (b.daysAgo || 0) - (a.daysAgo || 0));
  else out = [...out].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0));
  return out;
}
```

- [ ] **Step 4: Run test (debe pasar)**

Run: `cd frontend && npm test -- filter-numbers`
Expected: PASS.

- [ ] **Step 5: Componente Monitor (lectura)**

```js
// frontend/app/tg/components/Monitor.js
'use client';
import { useEffect, useState, useMemo } from 'react';
import api from '@/lib/api/axios';
import { filterNumbers } from '../lib/filter-numbers';
import NumberSheet from './NumberSheet';

const fmt = (n) => 'Bs ' + Number(n || 0).toLocaleString('es-VE');

export default function Monitor({ game, draw, editable, role }) {
  const [items, setItems] = useState([]);
  const [caidas, setCaidas] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(null);

  async function load() {
    const [itemsRes, caidasRes, lastRes] = await Promise.all([
      api.get(`/monitor/items/${draw.id}`),
      api.get(`/monitor/caidas/${draw.id}`).catch(() => ({ data: { caidas: [] } })),
      api.get('/monitor/items-last-drawn', { params: { gameId: game.id } }).catch(() => ({ data: { items: [] } })),
    ]);
    const itemData = itemsRes.data?.data?.items || itemsRes.data?.items || [];
    const caidaData = caidasRes.data?.data?.caidas || caidasRes.data?.caidas || [];
    const lastMap = new Map((lastRes.data?.items || lastRes.data?.data?.items || []).map((x) => [x.number, x.daysAgo]));
    const caidaSet = new Set(caidaData.map((c) => c.number));
    setItems(itemData.map((it) => ({ ...it, daysAgo: lastMap.get(it.number) ?? it.daysAgo, caida: caidaSet.has(it.number) })));
    setCaidas(caidaData);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [draw]);

  const list = useMemo(() => filterNumbers(items, { q, filter }).slice(0, 60), [items, q, filter]);

  return (
    <div style={{ padding: 14 }}>
      {!editable && <div style={{ background: '#33271a', color: '#ffce85', padding: 10, borderRadius: 11, marginBottom: 12 }}>👁️ Sorteo sorteado — solo lectura</div>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar número o nombre…"
        style={{ width: '100%', background: '#232e3c', color: '#fff', border: 0, borderRadius: 10, padding: 11, marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', marginBottom: 10 }}>
        {[['all','Todos'],['tk','Con ventas'],['risk','Riesgo'],['caida','Caídas'],['dias','Por días']].map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ flex: 'none', padding: '6px 12px', borderRadius: 20, border: 0,
            background: filter === k ? '#2ea6ff' : '#232e3c', color: filter === k ? '#fff' : '#7d8b99' }}>{lbl}</button>
        ))}
      </div>
      {list.map((it) => (
        <div key={it.number} onClick={() => setSel(it)}
          style={{ background: '#1d2733', borderLeft: '3px solid ' + (it.caida ? '#b388ff' : (it.percentageOfSales >= 70 ? '#ff5c5c' : '#2b3947')),
                   borderRadius: 12, padding: 11, marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ minWidth: 46, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{it.number}</div>
            {it.name && <div style={{ fontSize: 10, color: '#7d8b99' }}>{it.name}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{it.totalAmount ? fmt(it.totalAmount) : '—'}</div>
            <div style={{ fontSize: 11, color: '#86a7c4' }}>↘ hace {it.daysAgo ?? '?'} d{it.tripletaCount ? ` · ▣ ${it.tripletaCount}` : ''}</div>
          </div>
          <div style={{ fontWeight: 800, color: it.percentageOfSales >= 70 ? '#ff5c5c' : '#4dd07a' }}>{it.totalAmount ? `${Math.round(it.percentageOfSales)}%` : ''}</div>
        </div>
      ))}
      {sel && <NumberSheet item={sel} draw={draw} game={game} editable={editable} role={role} onClose={() => setSel(null)} onChanged={() => { setSel(null); load(); }} />}
    </div>
  );
}
```

- [ ] **Step 6: Verificar build**

Run: `cd frontend && npm run build`
Expected: PASA (Task 6 crea `NumberSheet`; si aún no existe, crear stub temporal que exporte `() => null` para compilar, reemplazado en Task 6).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/tg/
git commit -m "feat(tg-miniapp): monitor de lectura (numeros, caidas, busqueda, hace-X-dias)"
```

---

## Task 6: Hoja de acciones + cambiar pre-seleccionado (frontend)

**Files:**
- Create: `frontend/app/tg/components/NumberSheet.js`

**Interfaces:**
- Consumes: `POST /api/draws/:id/change-winner` `{ newWinnerItemId }` (vía `api`), `showConfirm`, `haptic`.
- Produces: `NumberSheet` con acción "Preseleccionar" (y placeholders para cupo/bloqueo, Task 7).

- [ ] **Step 1: Implementar NumberSheet con Preseleccionar**

```js
// frontend/app/tg/components/NumberSheet.js
'use client';
import api from '@/lib/api/axios';
import { showConfirm, haptic } from '../lib/telegram';

export default function NumberSheet({ item, draw, game, editable, role, onClose, onChanged }) {
  const isAdmin = role === 'ADMIN';

  async function preselect() {
    const ok = await showConfirm(`Marcar ${item.number}${item.name ? ' · ' + item.name : ''} como pre-ganador del sorteo de las ${(draw.drawTime || '').slice(0, 5)}. Se notificará a los demás administradores.`);
    if (!ok) return;
    await api.post(`/draws/${draw.id}/change-winner`, { newWinnerItemId: item.gameItemId || item.itemId });
    haptic('success');
    onChanged();
  }

  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end', zIndex: 40 }}>
      <div style={{ width: '100%', background: '#232e3c', borderRadius: '18px 18px 0 0', padding: '14px 16px 24px' }}>
        <div style={{ fontWeight: 800, fontSize: 22 }}>{item.number} {item.name}</div>
        <div style={{ color: '#7d8b99', fontSize: 13, marginBottom: 12 }}>
          {item.totalAmount ? `Apostado Bs ${Number(item.totalAmount).toLocaleString('es-VE')} · ${Math.round(item.percentageOfSales)}%` : 'Sin ventas'} · hace {item.daysAgo ?? '?'} días
        </div>
        {!editable ? (
          <div style={{ color: '#9fb0c0', textAlign: 'center', padding: 16 }}>👁️ Sorteo sorteado — solo lectura.</div>
        ) : (
          <>
            <button onClick={preselect} style={btn}>⭐ Preseleccionar este número</button>
            {/* Cupo/bloqueo: Task 7 (solo ADMIN) */}
            {isAdmin && <div id="quota-actions" />}
          </>
        )}
      </div>
    </div>
  );
}
const btn = { width: '100%', textAlign: 'left', background: '#1d2733', color: '#fff', border: '1px solid #2b3947', borderRadius: 10, padding: 15, marginBottom: 8, fontSize: 16 };
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npm run build`
Expected: PASA.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/tg/components/NumberSheet.js
git commit -m "feat(tg-miniapp): hoja de acciones + cambiar pre-seleccionado"
```

---

## Task 7: Cupo y bloqueo (frontend, solo ADMIN)

**Files:**
- Modify: `frontend/app/tg/components/NumberSheet.js`

**Interfaces:**
- Consumes: `quotaApi.setQuota(drawId, gameItemId, amount)` y `quotaApi.removeQuota(drawId, gameItemId)` de `frontend/lib/api/quota.js` (bloquear = `setQuota(...,0)`; liberar = `removeQuota`).

- [ ] **Step 1: Añadir acciones de cupo/bloqueo (solo ADMIN)**

En `NumberSheet.js`, importar `quotaApi` y añadir handlers; renderizarlos solo si `isAdmin`:

```js
import quotaApi from '@/lib/api/quota';
// ...dentro del componente:
const itemId = item.gameItemId || item.itemId;
async function setQuota() {
  const raw = window.prompt('Cupo máximo en Bs (vacío para cancelar):', item.maxAmount ?? '');
  if (raw === null || raw === '') return;
  const amount = Number(raw);
  if (Number.isNaN(amount) || amount < 0) return;
  await quotaApi.setQuota(draw.id, itemId, amount);
  haptic('success'); onChanged();
}
async function block() {
  const ok = await showConfirm(`Bloquear ${item.number}${item.name ? ' · ' + item.name : ''}? No se permitirán más ventas.`);
  if (!ok) return;
  await quotaApi.setQuota(draw.id, itemId, 0);
  haptic('warning'); onChanged();
}
async function release() {
  await quotaApi.removeQuota(draw.id, itemId);
  haptic('success'); onChanged();
}
```

Reemplazar el placeholder `{isAdmin && <div id="quota-actions" />}` por:

```js
{isAdmin && <>
  <button onClick={setQuota} style={btn}>🛡️ Fijar cupo</button>
  <button onClick={block} style={{ ...btn, color: '#ff5c5c' }}>⛔ Bloquear número</button>
  <button onClick={release} style={btn}>♻️ Liberar (quitar cupo)</button>
</>}
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npm run build`
Expected: PASA.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/tg/components/NumberSheet.js
git commit -m "feat(tg-miniapp): cupo y bloqueo de numeros (solo ADMIN)"
```

---

## Task 8: Integración con Telegram — botón de menú + deep-link

**Files:**
- Create: `backend/src/scripts/set-miniapp-menu-button.mjs` (one-shot para configurar el botón de menú del bot)
- Modify: `backend/src/services/admin-notification.service.js` (botón "Abrir monitor" en la notificación de pre-ganador)

**Interfaces:**
- Consumes: el/los `AdminTelegramBot.botToken`; la URL pública de la Mini App (`https://tote.atilax.io/tg`).

- [ ] **Step 1: Script para configurar el botón de menú**

```js
// backend/src/scripts/set-miniapp-menu-button.mjs
// Uso: node src/scripts/set-miniapp-menu-button.mjs
// Configura el botón de menú web_app del/los bot(s) admin activos hacia la Mini App.
import { prisma } from '../lib/prisma.js';

const URL = process.env.MINIAPP_URL || 'https://tote.atilax.io/tg';

const bots = await prisma.adminTelegramBot.findMany({ where: { isActive: true }, select: { botToken: true, name: true } });
for (const b of bots) {
  const res = await fetch(`https://api.telegram.org/bot${b.botToken}/setChatMenuButton`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menu_button: { type: 'web_app', text: '📊 Monitor', web_app: { url: URL } } }),
  });
  console.log(b.name, await res.json());
}
await prisma.$disconnect();
```

- [ ] **Step 2: Ejecutar y verificar (local o prod)**

Run: `cd backend && node src/scripts/set-miniapp-menu-button.mjs`
Expected: `{ ok: true, result: true }` por cada bot. En Telegram, el botón de menú del bot ahora abre la Mini App.

- [ ] **Step 3: Deep-link en la notificación de pre-ganador**

En `admin-notification.service.js`, donde se envía `🎯 PRE-GANADOR SELECCIONADO` (método `notifyPrewinnerSelected` / el `sendMessage`/`notifyGameAdmins`), añadir un `inline_keyboard` con un botón URL al deep-link del sorteo. Localizar la llamada que envía el mensaje formateado y pasarle `reply_markup`:

```js
const miniappUrl = (process.env.MINIAPP_URL || 'https://tote.atilax.io/tg') + `?startapp=${draw.id}`;
const replyMarkup = { inline_keyboard: [[{ text: '🔮 Abrir monitor', url: miniappUrl }]] };
// pasar replyMarkup como options al método de envío (3er arg de bot.sendMessage / extender notifyGameAdmins para aceptar opciones)
```

> El consumo del `startapp` en el frontend (abrir directo en ese sorteo) es opcional para v1: `getStartParam()` ya está disponible (Task 3); cablearlo en `page.js` para saltar a la vista monitor del `drawId` es una mejora menor.

- [ ] **Step 4: Verificar**

Disparar/seleccionar un pre-ganador y confirmar que la notificación de Telegram llega con el botón "🔮 Abrir monitor" que abre la Mini App.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scripts/set-miniapp-menu-button.mjs backend/src/services/admin-notification.service.js
git commit -m "feat(tg-miniapp): boton de menu del bot + deep-link en notificacion de pre-ganador"
```

---

## Notas de despliegue (post-implementación)

- La Mini App es la ruta `/tg` del frontend ya desplegado en `https://tote.atilax.io` (HTTPS ya disponible — requisito de Telegram). No hay proceso nuevo.
- Verificar que `helmet`/CSP en el backend **no** afecta a `/tg` (es servido por Next, no por Express; el script de Telegram carga desde `telegram.org`). Si Next tuviera CSP propia, permitir `https://telegram.org`.
- Provisionar el botón de menú una sola vez por bot (Task 8, Step 2) apuntando a prod.
- E2E manual dentro de Telegram: abrir desde el botón de menú, navegar juego→sorteo→monitor, cambiar un pre-seleccionado y confirmar que se refleja en el monitor web + notifica a otros admins.
