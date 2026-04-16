import { jest } from '@jest/globals';

const mockPrisma = {
  apiSystem: { findUnique: jest.fn() },
  user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockBcrypt = { hash: jest.fn(async () => 'hashed-pw') };
jest.unstable_mockModule('bcrypt', () => ({ default: mockBcrypt }));

// Also mock node:fs/promises (already mocked in provider.controller.test.js)
const mockAccess = jest.fn();
jest.unstable_mockModule('node:fs/promises', () => ({ access: mockAccess }));

const { default: providerController } = await import('../provider.controller.js');

function mockReq(params = {}, body = {}) { return { params, body }; }
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  mockPrisma.apiSystem.findUnique.mockReset();
  mockPrisma.user.findUnique.mockReset();
  mockPrisma.user.findFirst.mockReset();
  mockPrisma.user.create.mockReset();
  mockPrisma.user.update.mockReset();
  mockBcrypt.hash.mockClear();
});

test('createPortalUser rejects when ApiSystem is not PUSH', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PULL' });
  const req = mockReq({ id: 'sys1' }, { username: 'xxxxx', password: 'passwordlong' });
  const res = mockRes();
  await providerController.createPortalUser(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/PUSH/i) }));
});

test('createPortalUser rejects short passwords', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PUSH' });
  const req = mockReq({ id: 'sys1' }, { username: 'provider-x', password: 'short' });
  const res = mockRes();
  await providerController.createPortalUser(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test('createPortalUser creates new User with PROVIDER role + apiSystemId', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PUSH', slug: 'virtuales' });
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.create.mockResolvedValue({ id: 'u1', username: 'provider-x', role: 'PROVIDER', apiSystemId: 'sys1', createdAt: new Date() });

  const req = mockReq({ id: 'sys1' }, { username: 'provider-x', password: 'passwordlong' });
  const res = mockRes();
  await providerController.createPortalUser(req, res);

  expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      username: 'provider-x',
      email: 'portal-virtuales@internal.tote',
      role: 'PROVIDER',
      apiSystemId: 'sys1',
      password: 'hashed-pw',
    }),
  }));
  expect(res.status).toHaveBeenCalledWith(201);
});

test('createPortalUser returns 409 when username already exists', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PUSH', slug: 'virtuales' });
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });
  const req = mockReq({ id: 'sys1' }, { username: 'taken', password: 'passwordlong' });
  const res = mockRes();
  await providerController.createPortalUser(req, res);
  expect(res.status).toHaveBeenCalledWith(409);
});

test('createPortalUser returns 409 when apiSystem already has a portal user', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PUSH', slug: 'virtuales' });
  mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-portal' });
  const req = mockReq({ id: 'sys1' }, { username: 'provider-x', password: 'passwordlong' });
  const res = mockRes();
  await providerController.createPortalUser(req, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/ya tiene un usuario portal/i) }));
  expect(mockPrisma.user.create).not.toHaveBeenCalled();
});

test('createPortalUser returns 409 when prisma throws P2002 unique constraint', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PUSH', slug: 'virtuales' });
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.create.mockRejectedValue({ code: 'P2002' });
  const req = mockReq({ id: 'sys1' }, { username: 'provider-x', password: 'passwordlong' });
  const res = mockRes();
  await providerController.createPortalUser(req, res);
  expect(res.status).toHaveBeenCalledWith(409);
});

test('resetPortalUserPassword updates existing portal user', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PUSH' });
  mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', role: 'PROVIDER', apiSystemId: 'sys1' });
  mockPrisma.user.update.mockResolvedValue({ id: 'u1' });

  const req = mockReq({ id: 'sys1' }, { password: 'newpasswordlong' });
  const res = mockRes();
  await providerController.resetPortalUserPassword(req, res);

  expect(mockPrisma.user.update).toHaveBeenCalledWith({
    where: { id: 'u1' },
    data: { password: 'hashed-pw' },
  });
  expect(res.status).toHaveBeenCalledWith(200);
});

test('resetPortalUserPassword returns 404 when no portal user exists', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PUSH' });
  mockPrisma.user.findFirst.mockResolvedValue(null);
  const req = mockReq({ id: 'sys1' }, { password: 'newpasswordlong' });
  const res = mockRes();
  await providerController.resetPortalUserPassword(req, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test('getPortalUser returns { exists: false } when none', async () => {
  mockPrisma.user.findFirst.mockResolvedValue(null);
  const req = mockReq({ id: 'sys1' });
  const res = mockRes();
  await providerController.getPortalUser(req, res);
  expect(res.json).toHaveBeenCalledWith({ exists: false, user: null });
});

test('getPortalUser returns user data when exists', async () => {
  const now = new Date();
  mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', username: 'provider-x', isActive: true, createdAt: now });
  const req = mockReq({ id: 'sys1' });
  const res = mockRes();
  await providerController.getPortalUser(req, res);
  expect(res.json).toHaveBeenCalledWith({ exists: true, user: { id: 'u1', username: 'provider-x', isActive: true, createdAt: now } });
});
