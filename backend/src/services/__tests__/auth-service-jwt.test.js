import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// Set a deterministic test secret BEFORE importing auth.service.js — the
// service throws at import time if JWT_SECRET is missing or too short.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-must-be-at-least-32-characters-long';

jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: {} }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { default: authService } = await import('../auth.service.js');

test('generateToken includes apiSystemId when user is PROVIDER', () => {
  const token = authService.generateToken({
    id: 'u1',
    username: 'virtuales',
    email: null,
    role: 'PROVIDER',
    apiSystemId: 'sys-virtuales',
  });
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  expect(decoded.apiSystemId).toBe('sys-virtuales');
  expect(decoded.role).toBe('PROVIDER');
});

test('generateToken sets apiSystemId to null for non-provider users', () => {
  const token = authService.generateToken({
    id: 'u2',
    username: 'admin',
    email: 'a@a.com',
    role: 'ADMIN',
  });
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  expect(decoded.apiSystemId).toBeNull();
});
