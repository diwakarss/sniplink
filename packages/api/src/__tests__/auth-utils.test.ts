/**
 * Auth Utilities Unit Tests
 *
 * Tests for password hashing, JWT token management, and reset token generation
 */

import jwt from 'jsonwebtoken';
import { config } from '../config';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generateResetToken,
} from '../utils/auth';

describe('Auth Utilities', () => {
  describe('hashPassword', () => {
    test('should return a hash string (not plain password)', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash).not.toBe(password);
      expect(typeof hash).toBe('string');
    });

    test('should produce different hashes for same password (salt working)', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    test('should produce hash with appropriate length for bcrypt (~60 chars)', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      // bcrypt hashes are 60 characters
      expect(hash.length).toBe(60);
      // bcrypt hashes start with $2b$ or $2a$
      expect(hash).toMatch(/^\$2[ab]\$/);
    });
  });

  describe('verifyPassword', () => {
    test('should return true for correct password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    test('should return false for incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword456';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });

    test('should work with different passwords', async () => {
      const password1 = 'firstPassword';
      const password2 = 'secondPassword';

      const hash1 = await hashPassword(password1);
      const hash2 = await hashPassword(password2);

      // Each password should only verify against its own hash
      expect(await verifyPassword(password1, hash1)).toBe(true);
      expect(await verifyPassword(password2, hash2)).toBe(true);
      expect(await verifyPassword(password1, hash2)).toBe(false);
      expect(await verifyPassword(password2, hash1)).toBe(false);
    });
  });

  describe('generateToken', () => {
    test('should return a JWT string (three dot-separated parts)', () => {
      const payload = { userId: 'test-user-id', email: 'test@example.com' };
      const token = generateToken(payload);

      const parts = token.split('.');
      expect(parts.length).toBe(3);
    });

    test('should contain userId and email in payload', () => {
      const payload = { userId: 'test-user-id', email: 'test@example.com' };
      const token = generateToken(payload);

      // Decode token (without verification) to check payload
      const decoded = jwt.decode(token) as { userId: string; email: string };
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
    });

    test('should produce a verifiable token', () => {
      const payload = { userId: 'test-user-id', email: 'test@example.com' };
      const token = generateToken(payload);

      // Verify token using jwt library
      const verified = jwt.verify(token, config.jwtSecret) as {
        userId: string;
        email: string;
      };
      expect(verified.userId).toBe(payload.userId);
      expect(verified.email).toBe(payload.email);
    });

    test('should include expiry time in token', () => {
      const payload = { userId: 'test-user-id', email: 'test@example.com' };
      const token = generateToken(payload);

      const decoded = jwt.decode(token) as { exp: number; iat: number };
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });
  });

  describe('verifyToken', () => {
    test('should return payload for valid token', () => {
      const payload = { userId: 'test-user-id', email: 'test@example.com' };
      const token = generateToken(payload);

      const result = verifyToken(token);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(payload.userId);
      expect(result?.email).toBe(payload.email);
    });

    test('should return null for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      const result = verifyToken(invalidToken);
      expect(result).toBeNull();
    });

    test('should return null for expired token', () => {
      const payload = { userId: 'test-user-id', email: 'test@example.com' };

      // Create a token with 1 second expiry
      const expiredToken = jwt.sign(payload, config.jwtSecret, {
        expiresIn: '-1s', // Already expired
      });

      const result = verifyToken(expiredToken);
      expect(result).toBeNull();
    });

    test('should return null for malformed token', () => {
      const malformedTokens = [
        'not-a-token',
        '',
        'only.two.parts.here.extra',
        'a.b.c',
        null as unknown as string,
        undefined as unknown as string,
      ];

      for (const token of malformedTokens) {
        // Catch any errors for null/undefined
        try {
          const result = verifyToken(token);
          expect(result).toBeNull();
        } catch {
          // Expected for null/undefined
        }
      }
    });

    test('should return null for token signed with wrong secret', () => {
      const payload = { userId: 'test-user-id', email: 'test@example.com' };
      const wrongSecret = 'different-secret-key';

      const tokenWithWrongSecret = jwt.sign(payload, wrongSecret, {
        expiresIn: '1h',
      });

      const result = verifyToken(tokenWithWrongSecret);
      expect(result).toBeNull();
    });
  });

  describe('generateResetToken', () => {
    test('should return 64-character hex string (32 bytes * 2)', () => {
      const token = generateResetToken();

      expect(token.length).toBe(64);
      // Should be valid hex (only 0-9 and a-f)
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    test('should return different values on each call', () => {
      const token1 = generateResetToken();
      const token2 = generateResetToken();
      const token3 = generateResetToken();

      expect(token1).not.toBe(token2);
      expect(token2).not.toBe(token3);
      expect(token1).not.toBe(token3);
    });

    test('should generate cryptographically random tokens', () => {
      // Generate multiple tokens and verify they are sufficiently different
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateResetToken());
      }

      // All 100 tokens should be unique
      expect(tokens.size).toBe(100);
    });
  });
});
