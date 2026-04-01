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
