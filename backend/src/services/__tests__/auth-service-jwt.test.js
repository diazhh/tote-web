import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

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
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key-change-in-production');
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
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key-change-in-production');
  expect(decoded.apiSystemId).toBeNull();
});
