import { jest } from '@jest/globals';

const mockService = {
  getMe: jest.fn(),
  listTickets: jest.fn(),
  getTicket: jest.fn(),
  listDraws: jest.fn(),
  getDraw: jest.fn(),
};
jest.unstable_mockModule('../../services/portal.service.js', () => ({ default: mockService }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { default: portalController } = await import('../portal.controller.js');

function mockReq(overrides = {}) {
  return {
    apiSystemId: 'sys-1',
    user: { id: 'u1', username: 'uuu', apiSystemId: 'sys-1', role: 'PROVIDER' },
    params: {},
    query: {},
    ...overrides,
  };
}
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => Object.values(mockService).forEach(fn => fn.mockReset()));

test('getMe returns 200 with service result', async () => {
  mockService.getMe.mockResolvedValue({ apiSystem: { id: 'sys-1' }, user: { username: 'uuu' } });
  const req = mockReq();
  const res = mockRes();
  await portalController.getMe(req, res);
  expect(mockService.getMe).toHaveBeenCalledWith({ apiSystemId: 'sys-1', user: req.user });
  expect(res.json).toHaveBeenCalledWith({ apiSystem: { id: 'sys-1' }, user: { username: 'uuu' } });
});

test('getTicket returns 404 when service returns null', async () => {
  mockService.getTicket.mockResolvedValue(null);
  const req = mockReq({ params: { id: 'wrong' } });
  const res = mockRes();
  await portalController.getTicket(req, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test('getDraw returns 404 when service returns null', async () => {
  mockService.getDraw.mockResolvedValue(null);
  const req = mockReq({ params: { id: 'd-wrong' } });
  const res = mockRes();
  await portalController.getDraw(req, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test('listTickets passes query filters to service', async () => {
  mockService.listTickets.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25 });
  const req = mockReq({ query: { gameId: 'g1', status: 'ACTIVE', page: '2', pageSize: '50' } });
  const res = mockRes();
  await portalController.listTickets(req, res);
  expect(mockService.listTickets).toHaveBeenCalledWith({
    apiSystemId: 'sys-1',
    filters: expect.objectContaining({ gameId: 'g1', status: 'ACTIVE' }),
    page: '2',
    pageSize: '50',
  });
});

test('listDraws passes query filters', async () => {
  mockService.listDraws.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25 });
  const req = mockReq({ query: { gameId: 'g1' } });
  const res = mockRes();
  await portalController.listDraws(req, res);
  expect(mockService.listDraws).toHaveBeenCalledWith(expect.objectContaining({
    apiSystemId: 'sys-1',
    filters: expect.objectContaining({ gameId: 'g1' }),
  }));
});
