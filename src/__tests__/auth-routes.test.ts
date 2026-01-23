/**
 * Auth Routes Integration Tests
 *
 * Integration tests for authentication endpoints:
 * - POST /api/auth/register
 * - POST /api/auth/login
 * - POST /api/auth/forgot-password
 * - POST /api/auth/reset-password
 * - Auth middleware
 */

import request from 'supertest';
import { app } from '../index';
import { initDb, getDb } from '../db';
import { generateToken, generateResetToken, hashPassword } from '../utils/auth';

// Initialize database before running tests
beforeAll(() => {
  initDb();
});

// Clean up test data after each test
afterEach(() => {
  const db = getDb();
  db.exec('DELETE FROM password_reset_tokens');
  db.exec("DELETE FROM users WHERE email LIKE 'test-%'");
});

/**
 * Helper to create a test user via registration
 */
async function createTestUser(
  email: string,
  password: string
): Promise<string> {
  const response = await request(app).post('/api/auth/register').send({
    email,
    password,
  });
  return response.body.userId;
}

/**
 * Helper to get a login token
 */
async function getLoginToken(
  email: string,
  password: string
): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({
    email,
    password,
  });
  return response.body.token;
}

describe('POST /api/auth/register', () => {
  test('should return 201 with userId for valid registration', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test-valid@example.com', password: 'password123' });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('userId');
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('Registration successful');
  });

  test('should store email as lowercase', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'TEST-UPPER@EXAMPLE.COM', password: 'password123' });

    const db = getDb();
    const user = db
      .prepare('SELECT email FROM users WHERE email = ?')
      .get('test-upper@example.com');

    expect(user).toBeDefined();
  });

  test('should return 400 for missing email', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ password: 'password123' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Email');
  });

  test('should return 400 for missing password', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test-nopw@example.com' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Password');
  });

  test('should return 400 for invalid email format', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'invalid-email', password: 'password123' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid email');
  });

  test('should return 400 for password too short (<8 chars)', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test-shortpw@example.com', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('8 characters');
  });

  test('should return 400 for duplicate email', async () => {
    // First registration
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'test-dup@example.com', password: 'password123' });

    // Second registration with same email
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test-dup@example.com', password: 'password456' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('already registered');
  });

  test('should return 400 for duplicate email (case insensitive)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'test-case@example.com', password: 'password123' });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'TEST-CASE@EXAMPLE.COM', password: 'password456' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('already registered');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    // Create a test user for login tests
    await createTestUser('test-login@example.com', 'password123');
  });

  test('should return 200 with token for valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test-login@example.com', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('expiresIn');
    expect(response.body.token.split('.').length).toBe(3); // JWT format
  });

  test('should return 400 for missing email or password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test-login@example.com' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('required');
  });

  test('should return 401 with generic error for invalid email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test-nonexistent@example.com', password: 'password123' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  test('should return 401 with generic error for invalid password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test-login@example.com', password: 'wrongpassword' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  test('should return 403 for banned user', async () => {
    // Create and ban a user
    await createTestUser('test-banned@example.com', 'password123');
    const db = getDb();
    db.prepare("UPDATE users SET is_banned = 1 WHERE email = ?").run(
      'test-banned@example.com'
    );

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test-banned@example.com', password: 'password123' });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('suspended');
  });

  test('should handle case-insensitive email login', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'TEST-LOGIN@EXAMPLE.COM', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });
});

describe('POST /api/auth/forgot-password', () => {
  test('should return same message for existing email', async () => {
    await createTestUser('test-forgot@example.com', 'password123');

    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'test-forgot@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('If that email exists');
  });

  test('should return same message for non-existing email', async () => {
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'test-notexist@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('If that email exists');
  });

  test('should return 400 for missing email', async () => {
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Email');
  });

  test('should create password reset token for existing user', async () => {
    const userId = await createTestUser('test-token@example.com', 'password123');

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'test-token@example.com' });

    const db = getDb();
    const token = db
      .prepare('SELECT * FROM password_reset_tokens WHERE user_id = ?')
      .get(userId);

    expect(token).toBeDefined();
  });

  test('should not create token for non-existing user', async () => {
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'test-nouser@example.com' });

    const db = getDb();
    const tokens = db.prepare('SELECT * FROM password_reset_tokens').all();

    // No tokens should be created for non-existing user
    expect(tokens.length).toBe(0);
  });
});

describe('POST /api/auth/reset-password', () => {
  let testUserId: string;
  let validToken: string;

  beforeEach(async () => {
    // Create a test user
    testUserId = await createTestUser('test-reset@example.com', 'oldpassword123');

    // Generate a reset token directly
    validToken = generateResetToken();
    const tokenHash = await hashPassword(validToken);

    // Insert token into database
    const db = getDb();
    db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now', '+1 hour'), datetime('now'))
    `).run('test-token-id', testUserId, tokenHash);
  });

  test('should return 200 and reset password with valid token', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: validToken, password: 'newpassword123' });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('reset successfully');
  });

  test('should allow login with new password after reset', async () => {
    // Reset password
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: validToken, password: 'newpassword123' });

    // Try logging in with new password
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test-reset@example.com', password: 'newpassword123' });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toHaveProperty('token');
  });

  test('should return 400 for invalid token', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'invalid-token-here', password: 'newpassword123' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid or expired');
  });

  test('should return 400 for expired token', async () => {
    // Create an expired token
    const expiredToken = generateResetToken();
    const expiredTokenHash = await hashPassword(expiredToken);

    const db = getDb();
    db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now', '-1 hour'), datetime('now'))
    `).run('expired-token-id', testUserId, expiredTokenHash);

    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: expiredToken, password: 'newpassword123' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid or expired');
  });

  test('should return 400 for already used token', async () => {
    // Use the token first
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: validToken, password: 'newpassword123' });

    // Try to use it again
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: validToken, password: 'anotherpassword123' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid or expired');
  });

  test('should return 400 for missing token', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ password: 'newpassword123' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('token');
  });

  test('should return 400 for missing password', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: validToken });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Password');
  });

  test('should return 400 for password too short', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: validToken, password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('8 characters');
  });
});

describe('Auth Middleware', () => {
  let validToken: string;

  beforeEach(async () => {
    // Create a user and get their token
    await createTestUser('test-middleware@example.com', 'password123');
    validToken = await getLoginToken('test-middleware@example.com', 'password123');
  });

  // We need a protected route to test middleware
  // For now, test the middleware behavior with a URL that doesn't exist
  // but requires auth in real routes when available

  test('should return 401 for missing Authorization header', async () => {
    // This test uses the fact that any route can test the middleware
    // when explicitly applied. For integration, we'll test via a mock route.
    // Since we don't have a protected route yet, test middleware directly

    const { requireAuth } = await import('../middleware/auth');
    const mockReq = {
      headers: {},
    } as any;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const mockNext = jest.fn();

    requireAuth(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Authentication required',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should return 401 with redirectUrl for invalid token', async () => {
    const { requireAuth } = await import('../middleware/auth');
    const mockReq = {
      headers: {
        authorization: 'Bearer invalid.token.here',
      },
    } as any;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const mockNext = jest.fn();

    requireAuth(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Token expired or invalid',
      redirectUrl: '/login',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should call next() for valid token', async () => {
    const { requireAuth } = await import('../middleware/auth');
    const mockReq = {
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    } as any;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const mockNext = jest.fn();

    requireAuth(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.user).toBeDefined();
    expect(mockReq.user.email).toBe('test-middleware@example.com');
  });

  test('should return 401 for expired token', async () => {
    const { requireAuth } = await import('../middleware/auth');

    // Generate an expired token
    const jwt = await import('jsonwebtoken');
    const { config } = await import('../config');
    const expiredToken = jwt.sign(
      { userId: 'test-id', email: 'test@example.com' },
      config.jwtSecret,
      { expiresIn: '-1s' }
    );

    const mockReq = {
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    } as any;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const mockNext = jest.fn();

    requireAuth(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Token expired or invalid',
      redirectUrl: '/login',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should return 401 for malformed Authorization header', async () => {
    const { requireAuth } = await import('../middleware/auth');
    const mockReq = {
      headers: {
        authorization: 'Basic sometoken', // Not Bearer
      },
    } as any;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const mockNext = jest.fn();

    requireAuth(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Authentication required',
    });
  });
});
