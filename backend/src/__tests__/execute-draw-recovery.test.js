/**
 * Unit test for the inline recovery helper used by execute-draw-sweep.
 * Originally lived in jobs/execute-draw.job.js; extracted to
 * services/draw-recovery.service.js as part of the post-migration cleanup.
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  draw: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockSelector = { selectPrewinner: jest.fn() };

const noopLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: noopLogger,
  whatsappLogger: noopLogger,
  telegramLogger: noopLogger,
}));
jest.unstable_mockModule('../services/prewinner-selection.service.js', () => ({
  default: mockSelector,
}));

describe('draw-recovery service', () => {
  let recoverPreselectIfMissing;

  beforeAll(async () => {
    ({ recoverPreselectIfMissing } = await import('../services/draw-recovery.service.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('CLOSED + preselectedItemId=null → calls selectPrewinner inline', async () => {
    mockSelector.selectPrewinner.mockResolvedValue({ id: 'it-1', number: '42' });
    mockPrisma.draw.findUnique.mockResolvedValue({
      id: 'd-1', status: 'CLOSED', preselectedItemId: 'it-1',
      preselectedItem: { id: 'it-1', number: '42', name: 'CARNERO' },
      game: { name: 'TRIPLE' }, drawTime: '10:00:00', drawDate: new Date(),
    });
    const out = await recoverPreselectIfMissing({
      id: 'd-1', status: 'CLOSED', preselectedItemId: null,
    });
    expect(mockSelector.selectPrewinner).toHaveBeenCalledWith('d-1');
    expect(out.preselectedItemId).toBe('it-1');
  });

  test('CLOSED + preselectedItemId set → no-op, returns input', async () => {
    const draw = { id: 'd-1', status: 'CLOSED', preselectedItemId: 'it-9' };
    const out = await recoverPreselectIfMissing(draw);
    expect(mockSelector.selectPrewinner).not.toHaveBeenCalled();
    expect(out).toBe(draw);
  });

  test('DRAWN → no-op, returns input', async () => {
    const draw = { id: 'd-1', status: 'DRAWN', preselectedItemId: 'it-9' };
    const out = await recoverPreselectIfMissing(draw);
    expect(mockSelector.selectPrewinner).not.toHaveBeenCalled();
    expect(out).toBe(draw);
  });

  test('CLOSED + selectPrewinner throws → returns input unchanged', async () => {
    mockSelector.selectPrewinner.mockRejectedValue(new Error('optimizer crashed'));
    const draw = { id: 'd-1', status: 'CLOSED', preselectedItemId: null };
    const out = await recoverPreselectIfMissing(draw);
    expect(out).toBe(draw);
  });
});
