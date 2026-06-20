import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: {} }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../admin-telegram-bot.service.js', () => ({
  default: { notifyGameAdmins: jest.fn() },
}));

let service;
beforeAll(async () => { service = (await import('../admin-notification.service.js')).default; });
beforeEach(() => jest.clearAllMocks());

const caidaResult = {
  game: 'lotoanimalito',
  previousDraw: { drawTime: '12:00:00', winner: { number: '13', name: 'MONO' } },
  preselectedEnCaidas: true,
  caidas: [
    { number: '31', name: 'LAPA', reason: 'espejo', sorteosSinSalir: 0, diasSinSalir: 0, ventaActual: 100, premioPotencial: 3000, utilidadSobreVenta: -12, riesgo: 'ALTO' },
    { number: '08', name: 'RATÓN', reason: 'familia:roedores', sorteosSinSalir: 9, diasSinSalir: 2, ventaActual: 15, premioPotencial: 450, utilidadSobreVenta: 88, riesgo: 'BAJO' },
  ],
};

test('formatCaidasBlock renders previous winner, rows and risk', () => {
  const out = service.formatCaidasBlock(caidaResult);
  expect(out).toContain('MONO');
  expect(out).toContain('13');
  expect(out).toContain('31');
  expect(out).toContain('LAPA');
  expect(out).toContain('ALTO');
  expect(out).toContain('preseleccionado'); // marca de coincidencia
});

test('formatCaidasBlock returns empty string for null', () => {
  expect(service.formatCaidasBlock(null)).toBe('');
  expect(service.formatCaidasBlock({ caidas: [] })).toBe('');
});

test('formatPrewinnerMessage includes caidas block when provided', () => {
  const msg = service.formatPrewinnerMessage({
    game: { name: 'LOTOANIMALITO', config: {} },
    drawDate: new Date('2026-06-20T00:00:00Z'),
    drawTime: '13:00:00',
    prewinnerItem: { number: '31', name: 'LAPA', multiplier: '30' },
    totalSales: 110, maxPayout: 77, potentialPayout: 3000,
    salesByItem: {}, tripletaRiskTop5: [],
    caidas: caidaResult,
  });
  expect(msg).toContain('Caídas del anterior');
  expect(msg).toContain('LAPA');
});
