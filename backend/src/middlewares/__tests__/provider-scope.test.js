import { jest } from '@jest/globals';

const { requireProvider } = await import('../provider-scope.middleware.js');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

test('rejects when user is not present', () => {
  const req = {};
  const res = mockRes();
  const next = jest.fn();
  requireProvider(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});

test('rejects when role is not PROVIDER', () => {
  const req = { user: { role: 'ADMIN', apiSystemId: null } };
  const res = mockRes();
  const next = jest.fn();
  requireProvider(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
});

test('rejects when PROVIDER but missing apiSystemId', () => {
  const req = { user: { role: 'PROVIDER', apiSystemId: null } };
  const res = mockRes();
  const next = jest.fn();
  requireProvider(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
});

test('passes and sets req.apiSystemId when valid', () => {
  const req = { user: { role: 'PROVIDER', apiSystemId: 'sys-1' } };
  const res = mockRes();
  const next = jest.fn();
  requireProvider(req, res, next);
  expect(next).toHaveBeenCalled();
  expect(req.apiSystemId).toBe('sys-1');
});
