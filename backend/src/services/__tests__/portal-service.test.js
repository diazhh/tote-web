import { jest } from '@jest/globals';

const mockPrisma = {
  ticket: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  draw: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  apiSystem: { findUnique: jest.fn() },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { default: portalService } = await import('../portal.service.js');

beforeEach(() => {
  Object.values(mockPrisma).forEach(m => Object.values(m).forEach(fn => fn.mockReset()));
});

test('listTickets forces apiSystemId in where, ignores hostile filters', async () => {
  mockPrisma.ticket.findMany.mockResolvedValue([]);
  mockPrisma.ticket.count.mockResolvedValue(0);

  await portalService.listTickets({
    apiSystemId: 'sys-ok',
    filters: { apiSystemId: 'sys-attacker', gameId: 'g1' },
    page: 1,
    pageSize: 25,
  });

  const call = mockPrisma.ticket.findMany.mock.calls[0][0];
  expect(call.where.apiSystemId).toBe('sys-ok');
  expect(call.where.source).toBe('WEBHOOK_PUSH');
  expect(call.where.gameId).toBe('g1');
});

test('listTickets applies default date range of last 7 days', async () => {
  mockPrisma.ticket.findMany.mockResolvedValue([]);
  mockPrisma.ticket.count.mockResolvedValue(0);

  await portalService.listTickets({ apiSystemId: 'sys-ok', filters: {}, page: 1, pageSize: 25 });

  const call = mockPrisma.ticket.findMany.mock.calls[0][0];
  expect(call.where.createdAt.gte).toBeInstanceOf(Date);
  expect(call.where.createdAt.lte).toBeInstanceOf(Date);
  const spanDays = (call.where.createdAt.lte - call.where.createdAt.gte) / 86400000;
  expect(spanDays).toBeGreaterThanOrEqual(6.9);
  expect(spanDays).toBeLessThanOrEqual(7.1);
});

test('listTickets caps pageSize at 100', async () => {
  mockPrisma.ticket.findMany.mockResolvedValue([]);
  mockPrisma.ticket.count.mockResolvedValue(0);
  await portalService.listTickets({ apiSystemId: 'sys', filters: {}, page: 1, pageSize: 5000 });
  expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
});

test('getTicket queries with forced apiSystemId', async () => {
  mockPrisma.ticket.findFirst.mockResolvedValue(null);
  const result = await portalService.getTicket({ apiSystemId: 'sys-a', ticketId: 't1' });
  expect(result).toBeNull();
  expect(mockPrisma.ticket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 't1', apiSystemId: 'sys-a', source: 'WEBHOOK_PUSH' },
  }));
});

test('getMe returns apiSystem info', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({
    id: 'sys-1', name: 'Virtuales', slug: 'virtuales', mode: 'PUSH',
  });
  const result = await portalService.getMe({ apiSystemId: 'sys-1', user: { username: 'u1' } });
  expect(result).toEqual({
    apiSystem: { id: 'sys-1', name: 'Virtuales', slug: 'virtuales', mode: 'PUSH' },
    user: { username: 'u1' },
  });
});

test('listDraws filters by provider via ticket relation', async () => {
  mockPrisma.draw.findMany.mockResolvedValue([]);
  mockPrisma.draw.count.mockResolvedValue(0);
  await portalService.listDraws({ apiSystemId: 'sys-ok', filters: {}, page: 1, pageSize: 25 });
  const call = mockPrisma.draw.findMany.mock.calls[0][0];
  // scope must reach the inner ticket filter
  expect(JSON.stringify(call.where)).toContain('sys-ok');
  expect(JSON.stringify(call.where)).toContain('WEBHOOK_PUSH');
});

test('getDraw returns null when provider has no tickets in that draw', async () => {
  mockPrisma.draw.findFirst.mockResolvedValue({ id: 'd1', drawTime: new Date(), status: 'DRAWN', winnerItem: { number: '42' }, game: { id: 'g1', name: 'X' } });
  mockPrisma.ticket.findMany.mockResolvedValue([]);
  const result = await portalService.getDraw({ apiSystemId: 'sys-a', drawId: 'd1' });
  expect(result).toBeNull();
});
