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
