import { jest, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  draw: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  gameItem: { findMany: jest.fn() },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../../lib/drawDetailsLoader.js', () => ({
  loadDrawTicketDetails: jest.fn(),
  sumDetailsAmount: (details) => details.reduce((s, d) => s + parseFloat(d.amount), 0),
}));

let getCaidasForDraw, loadDrawTicketDetails;

beforeAll(async () => {
  ({ loadDrawTicketDetails } = await import('../../lib/drawDetailsLoader.js'));
  ({ getCaidasForDraw } = await import('../caida.service.js'));
});
beforeEach(() => jest.clearAllMocks());

const baseDraw = {
  id: 'd2', gameId: 'g1', drawDate: new Date('2026-06-20T00:00:00Z'),
  drawTime: '13:00:00', preselectedItemId: 'it31', winnerItemId: null,
  game: { slug: 'lotoanimalito', config: { percentageToDistribute: 70 } },
};

test('returns null for game without caidas table', async () => {
  mockPrisma.draw.findUnique.mockResolvedValue({ ...baseDraw, game: { slug: 'triple-pantera', config: {} } });
  expect(await getCaidasForDraw('d2')).toBeNull();
});

test('returns null when there is no previous draw the same day', async () => {
  mockPrisma.draw.findUnique.mockResolvedValue(baseDraw);
  mockPrisma.draw.findFirst.mockResolvedValue(null); // no previous winner today
  expect(await getCaidasForDraw('d2')).toBeNull();
});

test('builds enriched caidas from previous winner (MONO 13) and flags preselected', async () => {
  mockPrisma.draw.findUnique.mockResolvedValue(baseDraw);
  // previous draw winner = MONO (13)
  mockPrisma.draw.findFirst.mockResolvedValue({
    id: 'd1', drawTime: '12:00:00', winnerItem: { number: '13', name: 'MONO' },
  });
  // caidas of 13 (animalito) include 31 (LAPA) which is the preselected
  // gameItems for caida numbers + the preselected item
  mockPrisma.gameItem.findMany.mockResolvedValue([
    { id: 'it31', number: '31', name: 'LAPA', multiplier: '30' },
    { id: 'it16', number: '16', name: 'OSO', multiplier: '30' },
    { id: 'it29', number: '29', name: 'ELEFANTE', multiplier: '30' },
    { id: 'it32', number: '32', name: 'ARDILLA', multiplier: '30' },
    { id: 'it35', number: '35', name: 'JIRAFA', multiplier: '30' },
    { id: 'it08', number: '08', name: 'RATÓN', multiplier: '30' },
  ]);
  // current-draw details: 100 bet on LAPA (31), 10 on OSO (16)
  loadDrawTicketDetails.mockResolvedValue([
    { gameItemId: 'it31', amount: '100' },
    { gameItemId: 'it16', amount: '10' },
  ]);
  // executed draws before current (for tiempo sin salir): LAPA won 1 draw ago
  mockPrisma.draw.findMany.mockResolvedValue([
    { winnerItemId: 'it31', drawDate: new Date('2026-06-20T00:00:00Z'), drawTime: '12:00:00' },
    { winnerItemId: 'it99', drawDate: new Date('2026-06-19T00:00:00Z'), drawTime: '20:00:00' },
  ]);

  const res = await getCaidasForDraw('d2');
  expect(res.game).toBe('lotoanimalito');
  expect(res.previousDraw.winner.number).toBe('13');
  expect(res.preselectedEnCaidas).toBe(true); // 31 is a caida of 13
  const lapa = res.caidas.find((c) => c.number === '31');
  expect(lapa.ventaActual).toBe(100);
  expect(lapa.premioPotencial).toBe(3000); // 100 * 30
  expect(lapa.sorteosSinSalir).toBe(0);     // won the immediately previous executed draw
  expect(lapa.diasSinSalir).toBe(0);        // LAPA won same drawDate as current
  expect(lapa.utilidadSobreVenta).toBeCloseTo((110 - 3000) / 110 * 100, 2);
  // totalSales = 110, maxPayout = 77 -> premio 3000 >= maxPayout -> ALTO
  expect(lapa.riesgo).toBe('ALTO');
  const oso = res.caidas.find((c) => c.number === '16');
  expect(oso.sorteosSinSalir).toBeNull(); // never won in the executed list
  expect(oso.riesgo).toBe('ALTO');        // OSO premio 300 >= maxPayout 77
});
