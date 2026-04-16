import { jest } from '@jest/globals';

const mockPrisma = {
  ticket: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  webhookLog: {
    findFirst: jest.fn(),
  },
  apiSystem: {
    findMany: jest.fn(),
  },
  $disconnect: jest.fn(),
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { backfill } = await import('../backfill-ticket-apisystem.js');

beforeEach(() => {
  Object.values(mockPrisma).forEach(m => {
    if (typeof m === 'object') Object.values(m).forEach(fn => fn.mockReset?.());
  });
});

test('assigns apiSystemId to WEBHOOK_PUSH tickets with no apiSystemId', async () => {
  mockPrisma.apiSystem.findMany.mockResolvedValue([
    { id: 'sys-virtuales', slug: 'virtuales' },
    { id: 'sys-premier', slug: 'premier' },
  ]);
  mockPrisma.ticket.findMany.mockResolvedValueOnce([
    { id: 't1', providerData: { providerSlug: 'virtuales' } },
    { id: 't2', providerData: { providerSlug: 'premier' } },
  ]).mockResolvedValueOnce([]);
  mockPrisma.ticket.update.mockResolvedValue({});

  const result = await backfill({ batchSize: 100 });

  expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
    where: { id: 't1' },
    data: { apiSystemId: 'sys-virtuales' },
  });
  expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
    where: { id: 't2' },
    data: { apiSystemId: 'sys-premier' },
  });
  expect(result.updated).toBe(2);
});

test('skips tickets when provider slug cannot be resolved', async () => {
  mockPrisma.apiSystem.findMany.mockResolvedValue([{ id: 'sys-v', slug: 'virtuales' }]);
  mockPrisma.ticket.findMany.mockResolvedValueOnce([
    { id: 't3', providerData: { providerSlug: 'unknown' } },
  ]).mockResolvedValueOnce([]);

  const result = await backfill({ batchSize: 100 });

  expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  expect(result.updated).toBe(0);
  expect(result.skipped).toBe(1);
});

test('falls back to webhookLog lookup when providerData lacks slug', async () => {
  mockPrisma.apiSystem.findMany.mockResolvedValue([{ id: 'sys-v', slug: 'virtuales' }]);
  mockPrisma.ticket.findMany.mockResolvedValueOnce([
    { id: 't4', providerData: {} },
  ]).mockResolvedValueOnce([]);
  mockPrisma.webhookLog.findFirst.mockResolvedValue({ apiSystemId: 'sys-v' });

  const result = await backfill({ batchSize: 100 });

  expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
    where: { id: 't4' },
    data: { apiSystemId: 'sys-v' },
  });
  expect(result.updated).toBe(1);
});
