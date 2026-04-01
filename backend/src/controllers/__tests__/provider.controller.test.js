// backend/src/controllers/__tests__/provider.controller.test.js
import { jest } from '@jest/globals';

// Mock prisma
const mockPrisma = {
  apiSystem: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  webhookLog: {
    findMany: jest.fn(),
    count: jest.fn(),
  }
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));

// Mock fs/promises
const mockAccess = jest.fn();
jest.unstable_mockModule('node:fs/promises', () => ({ access: mockAccess }));

// Mock logger
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

// Import AFTER mocks
const { default: providerController } = await import('../provider.controller.js');

function mockReq(params = {}, body = {}) {
  return { params, body };
}
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

// --- ADMIN-01 / ADMIN-02: createSystem ---
describe('createSystem', () => {
  test('creates system with slug and mode', async () => {
    mockPrisma.apiSystem.create.mockResolvedValue({ id: '1', name: 'Test', slug: 'test', mode: 'PUSH' });
    const req = mockReq({}, { name: 'Test', slug: 'test', mode: 'PUSH' });
    const res = mockRes();
    await providerController.createSystem(req, res);
    expect(mockPrisma.apiSystem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'test', mode: 'PUSH' }) })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('returns 400 when slug is missing', async () => {
    const req = mockReq({}, { name: 'Test' });
    const res = mockRes();
    await providerController.createSystem(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('returns 400 on duplicate slug (P2002)', async () => {
    const err = new Error('Unique constraint'); err.code = 'P2002';
    mockPrisma.apiSystem.create.mockRejectedValue(err);
    const req = mockReq({}, { name: 'Test', slug: 'dupe' });
    const res = mockRes();
    await providerController.createSystem(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'El slug ya está en uso' });
  });
});

// --- ADMIN-01 / ADMIN-02: updateSystem ---
describe('updateSystem', () => {
  test('updates slug, mode, isActive', async () => {
    mockPrisma.apiSystem.update.mockResolvedValue({ id: 'abc', name: 'X', slug: 'new-slug', mode: 'PUSH', isActive: false });
    const req = mockReq({ id: 'abc' }, { slug: 'new-slug', mode: 'PUSH', isActive: false });
    const res = mockRes();
    await providerController.updateSystem(req, res);
    expect(mockPrisma.apiSystem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'new-slug', mode: 'PUSH', isActive: false }) })
    );
    expect(res.json).toHaveBeenCalled();
  });

  test('returns 400 on duplicate slug (P2002)', async () => {
    const err = new Error('Unique constraint'); err.code = 'P2002';
    mockPrisma.apiSystem.update.mockRejectedValue(err);
    const req = mockReq({ id: 'abc' }, { slug: 'taken' });
    const res = mockRes();
    await providerController.updateSystem(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'El slug ya está en uso' });
  });
});

// --- ADMIN-03 / ADMIN-04: generateToken ---
describe('generateToken', () => {
  test('returns 64-char hex token and calls update', async () => {
    mockPrisma.apiSystem.update.mockResolvedValue({ id: 'abc', name: 'X', webhookToken: 'stored' });
    const req = mockReq({ id: 'abc' });
    const res = mockRes();
    await providerController.generateToken(req, res);
    expect(mockPrisma.apiSystem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ webhookToken: expect.stringMatching(/^[a-f0-9]{64}$/) }) })
    );
    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.webhookToken).toMatch(/^[a-f0-9]{64}$/);
    expect(jsonCall.systemId).toBe('abc');
  });
});

// --- ADMIN-05: getAllSystems excludes webhookToken ---
describe('getAllSystems', () => {
  test('response does not include webhookToken field', async () => {
    mockPrisma.apiSystem.findMany.mockResolvedValue([
      { id: '1', name: 'SRQ', mode: 'PULL', configurations: [] }
    ]);
    const req = mockReq();
    const res = mockRes();
    await providerController.getAllSystems(req, res);
    const systems = res.json.mock.calls[0][0];
    expect(systems[0]).not.toHaveProperty('webhookToken');
  });
});

// --- ADMIN-06: getAdapterStatus ---
describe('getAdapterStatus', () => {
  test('returns adapterReady: false when adapter file does not exist', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'abc', slug: 'missing-provider', mode: 'PUSH' });
    mockAccess.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const req = mockReq({ id: 'abc' });
    const res = mockRes();
    await providerController.getAdapterStatus(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ adapterReady: false, slug: 'missing-provider' }));
  });

  test('returns adapterReady: true when adapter file exists', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'abc', slug: 'srq', mode: 'PUSH' });
    mockAccess.mockResolvedValue(undefined);
    const req = mockReq({ id: 'abc' });
    const res = mockRes();
    await providerController.getAdapterStatus(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ adapterReady: true, slug: 'srq' }));
  });

  test('returns 404 when system not found', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue(null);
    const req = mockReq({ id: 'nope' });
    const res = mockRes();
    await providerController.getAdapterStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// --- LOGS-01 / LOGS-02 / LOGS-03 / LOGS-04: getWebhookLogs ---
describe('getWebhookLogs', () => {
  const fakeLogs = [
    {
      id: 'log-1',
      apiSystemId: 'sys-1',
      rawPayload: '{"ticket":"abc"}',
      headers: { 'x-webhook-token': '***', host: 'example.com' },
      status: 'PROCESSED',
      errorMessage: null,
      createdAt: new Date('2026-04-01T10:00:00Z'),
      apiSystem: { id: 'sys-1', name: 'Proveedor A', slug: 'proveedor-a' }
    },
    {
      id: 'log-2',
      apiSystemId: 'sys-1',
      rawPayload: 'malformed-not-json',
      headers: null,
      status: 'FAILED',
      errorMessage: 'adapter error',
      createdAt: new Date('2026-04-01T09:00:00Z'),
      apiSystem: { id: 'sys-1', name: 'Proveedor A', slug: 'proveedor-a' }
    }
  ];

  test('LOGS-01: returns paginated list with apiSystem relation', async () => {
    mockPrisma.webhookLog.findMany.mockResolvedValue(fakeLogs);
    mockPrisma.webhookLog.count.mockResolvedValue(2);
    const req = { query: {} };
    const res = mockRes();
    await providerController.getWebhookLogs(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: fakeLogs,
      pagination: expect.objectContaining({
        page: 1,
        limit: 50,
        total: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
      })
    }));
  });

  test('LOGS-02: filters by apiSystemId when provided', async () => {
    mockPrisma.webhookLog.findMany.mockResolvedValue([]);
    mockPrisma.webhookLog.count.mockResolvedValue(0);
    const req = { query: { apiSystemId: 'sys-1' } };
    const res = mockRes();
    await providerController.getWebhookLogs(req, res);
    expect(mockPrisma.webhookLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ apiSystemId: 'sys-1' }) })
    );
  });

  test('LOGS-02: filters by status when provided', async () => {
    mockPrisma.webhookLog.findMany.mockResolvedValue([]);
    mockPrisma.webhookLog.count.mockResolvedValue(0);
    const req = { query: { status: 'FAILED' } };
    const res = mockRes();
    await providerController.getWebhookLogs(req, res);
    expect(mockPrisma.webhookLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  test('LOGS-03: rawPayload returned as string (not parsed)', async () => {
    mockPrisma.webhookLog.findMany.mockResolvedValue([fakeLogs[0]]);
    mockPrisma.webhookLog.count.mockResolvedValue(1);
    const req = { query: {} };
    const res = mockRes();
    await providerController.getWebhookLogs(req, res);
    const { data } = res.json.mock.calls[0][0];
    expect(typeof data[0].rawPayload).toBe('string');
  });

  test('LOGS-04: headers field included (null or object)', async () => {
    mockPrisma.webhookLog.findMany.mockResolvedValue(fakeLogs);
    mockPrisma.webhookLog.count.mockResolvedValue(2);
    const req = { query: {} };
    const res = mockRes();
    await providerController.getWebhookLogs(req, res);
    const { data } = res.json.mock.calls[0][0];
    // First log has headers object
    expect(data[0]).toHaveProperty('headers');
    // Second log has headers: null
    expect(data[1].headers).toBeNull();
  });

  test('returns 500 on prisma error', async () => {
    mockPrisma.webhookLog.findMany.mockRejectedValue(new Error('DB error'));
    mockPrisma.webhookLog.count.mockResolvedValue(0);
    const req = { query: {} };
    const res = mockRes();
    await providerController.getWebhookLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Error al obtener logs' });
  });
});
