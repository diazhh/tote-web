import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = { draw: { findUnique: jest.fn() } };
const mockSelector = { selectPrewinner: jest.fn() };

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../services/prewinner-selection.service.js', () => ({
  default: mockSelector,
}));

describe('preselectWorker', () => {
  let preselectWorker;

  beforeAll(async () => {
    ({ preselectWorker } = await import('../queue/workers/preselect.worker.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('CLOSED + no preselect → calls selectPrewinner', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      status: 'CLOSED', preselectedItemId: null,
      drawTime: '10:00:00', game: { name: 'TRIPLE PANTERA' },
    });
    mockSelector.selectPrewinner.mockResolvedValue({ number: '42', name: 'CARNERO' });
    const r = await preselectWorker({ data: { drawId: 'd-1' } });
    expect(mockSelector.selectPrewinner).toHaveBeenCalledWith('d-1');
    expect(r.preselected).toBe('42');
  });

  test('CLOSED + preselect already set → skip', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      status: 'CLOSED', preselectedItemId: 'it-9',
      drawTime: '10:00:00', game: { name: 'TRIPLE' },
    });
    const r = await preselectWorker({ data: { drawId: 'd-1' } });
    expect(mockSelector.selectPrewinner).not.toHaveBeenCalled();
    expect(r.skipped).toBe('already_preselected');
  });

  test('SCHEDULED (not yet closed) → skip', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      status: 'SCHEDULED', preselectedItemId: null,
      drawTime: '10:00:00', game: { name: 'TRIPLE' },
    });
    const r = await preselectWorker({ data: { drawId: 'd-1' } });
    expect(mockSelector.selectPrewinner).not.toHaveBeenCalled();
    expect(r.skipped).toMatch(/status_is_SCHEDULED/);
  });

  test('draw not found → skip', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue(null);
    const r = await preselectWorker({ data: { drawId: 'd-x' } });
    expect(r.skipped).toBe('draw_not_found');
  });

  test('selectPrewinner returns null → log + skip', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      status: 'CLOSED', preselectedItemId: null,
      drawTime: '10:00:00', game: { name: 'TRIPLE' },
    });
    mockSelector.selectPrewinner.mockResolvedValue(null);
    const r = await preselectWorker({ data: { drawId: 'd-1' } });
    expect(r.skipped).toBe('optimizer_returned_null');
  });
});
