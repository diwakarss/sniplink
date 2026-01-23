/**
 * Admin API Integration Tests
 *
 * Integration tests for admin endpoints:
 * - Admin authentication middleware (requireAdmin)
 * - GET /api/admin/stats
 * - PATCH /api/admin/urls/:id/disable
 * - DELETE /api/admin/urls/:id
 * - PATCH /api/admin/users/:id/ban
 * - GET /api/admin/users
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { getDb, initDb } from '../db';
import { generateToken, hashPassword } from '../utils/auth';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { resetRateLimiters } from '../middleware/rate-limit';

// Initialize database before running tests
beforeAll(() => {
  initDb();
});

// Reset rate limiters before each test
beforeEach(() => {
  resetRateLimiters();
});

// Clean up test data after each test for isolation
afterEach(() => {
  const db = getDb();
  // Delete in order respecting foreign key constraints
  // Use test prefix 'zzz' for easy cleanup and no collision with real codes
  db.prepare('DELETE FROM clicks WHERE url_id IN (SELECT id FROM urls WHERE short_code LIKE ?)').run('zzz%');
  db.prepare('DELETE FROM urls WHERE short_code LIKE ?').run('zzz%');
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)').run('admin-test-%');
  db.prepare('DELETE FROM users WHERE email LIKE ?').run('admin-test-%');
});

/**
 * Helper to create a test user directly in database
 */
async function createTestUser(
  email: string,
  options: { isAdmin?: boolean; isBanned?: boolean } = {}
): Promise<{ id: string; token: string }> {
  const db = getDb();
  const id = randomUUID();
  const passwordHash = await hashPassword('password123');

  db.prepare(`
    INSERT INTO users (id, email, password_hash, is_admin, is_banned, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(id, email.toLowerCase(), passwordHash, options.isAdmin ? 1 : 0, options.isBanned ? 1 : 0);

  const token = generateToken({ userId: id, email: email.toLowerCase() });

  return { id, token };
}

/**
 * Helper to create a test URL
 * Uses 'zzz' prefix + random alphanumeric for valid redirect format (6-8 chars)
 */
function createTestUrl(userId?: string): { id: string; shortCode: string } {
  const db = getDb();
  const id = randomUUID();
  // Generate valid short code: 'zzz' + 3 alphanumeric chars = 6 chars total
  // This matches the redirect format validation: /^[a-zA-Z0-9]{6,8}$/
  const shortCode = 'zzz' + randomUUID().replace(/-/g, '').substring(0, 3);

  db.prepare(`
    INSERT INTO urls (id, short_code, original_url, user_id, stats_token, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(id, shortCode, 'https://example.com', userId || null, randomUUID());

  return { id, shortCode };
}

/**
 * Helper to record a click for a URL
 */
function recordClick(urlId: string): void {
  const db = getDb();
  const clickId = randomUUID();
  db.prepare(`
    INSERT INTO clicks (id, url_id, ip_address, user_agent)
    VALUES (?, ?, ?, ?)
  `).run(clickId, urlId, '192.168.1.1', 'Mozilla/5.0');
}

describe('Admin Authentication', () => {
  test('returns 401 without authentication token', async () => {
    const response = await request(app)
      .get('/api/admin/stats');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Authentication required');
  });

  test('returns 401 with invalid token', async () => {
    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Token expired or invalid');
    expect(response.body).toHaveProperty('redirectUrl', '/login');
  });

  test('returns 401 with expired token', async () => {
    // Generate an expired token
    const expiredToken = jwt.sign(
      { userId: 'test-id', email: 'admin-test@example.com' },
      config.jwtSecret,
      { expiresIn: '-1s' }
    );

    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Token expired or invalid');
    expect(response.body).toHaveProperty('redirectUrl', '/login');
  });

  test('returns 403 for non-admin user', async () => {
    const { token } = await createTestUser('admin-test-nonadmin@example.com', { isAdmin: false });

    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Admin access required');
  });

  test('allows admin user access', async () => {
    const { token } = await createTestUser('admin-test-admin@example.com', { isAdmin: true });

    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('totalUrls');
  });
});

describe('GET /api/admin/stats', () => {
  test('returns system statistics for admin', async () => {
    const { token } = await createTestUser('admin-test-stats@example.com', { isAdmin: true });

    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('totalUrls');
    expect(response.body).toHaveProperty('totalClicks');
    expect(response.body).toHaveProperty('activeUsers');
    expect(response.body).toHaveProperty('totalUsers');
    expect(typeof response.body.totalUrls).toBe('number');
    expect(typeof response.body.totalClicks).toBe('number');
    expect(typeof response.body.activeUsers).toBe('number');
    expect(typeof response.body.totalUsers).toBe('number');
  });

  test('returns correct counts', async () => {
    const { id: adminId, token } = await createTestUser('admin-test-counts@example.com', { isAdmin: true });
    const { id: userId } = await createTestUser('admin-test-user@example.com', { isAdmin: false });

    // Create known URLs
    const url1 = createTestUrl(adminId);
    const url2 = createTestUrl(userId);

    // Record clicks
    recordClick(url1.id);
    recordClick(url1.id);
    recordClick(url2.id);

    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    // We created 2 test URLs
    expect(response.body.totalUrls).toBeGreaterThanOrEqual(2);
    // We created 3 test clicks
    expect(response.body.totalClicks).toBeGreaterThanOrEqual(3);
    // We created 2 active users
    expect(response.body.activeUsers).toBeGreaterThanOrEqual(2);
    // Total users includes all users
    expect(response.body.totalUsers).toBeGreaterThanOrEqual(2);
  });

  test('counts only active users correctly', async () => {
    const { token } = await createTestUser('admin-test-active@example.com', { isAdmin: true });
    // Create a banned user
    await createTestUser('admin-test-banned@example.com', { isAdmin: false, isBanned: true });
    // Create an active user
    await createTestUser('admin-test-active2@example.com', { isAdmin: false, isBanned: false });

    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    // activeUsers should not count the banned user
    // We created 2 active users (admin + active2) and 1 banned
    expect(response.body.totalUsers).toBeGreaterThan(response.body.activeUsers);
    // At minimum, we have 2 active users from this test
    expect(response.body.activeUsers).toBeGreaterThanOrEqual(2);
  });
});

describe('PATCH /api/admin/urls/:id/disable', () => {
  test('disables a URL', async () => {
    const { token } = await createTestUser('admin-test-disable@example.com', { isAdmin: true });
    const url = createTestUrl();

    const response = await request(app)
      .patch(`/api/admin/urls/${url.id}/disable`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('disabled');
    expect(response.body).toHaveProperty('urlId', url.id);

    // Verify in database
    const db = getDb();
    const updatedUrl = db.prepare('SELECT is_disabled FROM urls WHERE id = ?').get(url.id) as { is_disabled: number };
    expect(updatedUrl.is_disabled).toBe(1);
  });

  test('returns 404 for non-existent URL', async () => {
    const { token } = await createTestUser('admin-test-disable404@example.com', { isAdmin: true });
    const nonExistentId = randomUUID();

    const response = await request(app)
      .patch(`/api/admin/urls/${nonExistentId}/disable`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('not found');
  });

  test('returns 400 for already disabled URL', async () => {
    const { token } = await createTestUser('admin-test-disable400@example.com', { isAdmin: true });
    const url = createTestUrl();

    // Disable the URL first
    await request(app)
      .patch(`/api/admin/urls/${url.id}/disable`)
      .set('Authorization', `Bearer ${token}`);

    // Try to disable again
    const response = await request(app)
      .patch(`/api/admin/urls/${url.id}/disable`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('already disabled');
  });

  test('disabled URL returns 410 on redirect', async () => {
    const { token } = await createTestUser('admin-test-disable410@example.com', { isAdmin: true });
    const url = createTestUrl();

    // Disable the URL
    await request(app)
      .patch(`/api/admin/urls/${url.id}/disable`)
      .set('Authorization', `Bearer ${token}`);

    // Attempt to access the redirect
    const response = await request(app)
      .get(`/${url.shortCode}`);

    expect(response.status).toBe(410);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('disabled');
  });
});

describe('DELETE /api/admin/urls/:id', () => {
  test('deletes a URL and its clicks', async () => {
    const { token } = await createTestUser('admin-test-delete@example.com', { isAdmin: true });
    const url = createTestUrl();

    // Record some clicks
    recordClick(url.id);
    recordClick(url.id);

    const response = await request(app)
      .delete(`/api/admin/urls/${url.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('deleted');
    expect(response.body).toHaveProperty('urlId', url.id);

    // Verify URL is deleted
    const db = getDb();
    const deletedUrl = db.prepare('SELECT * FROM urls WHERE id = ?').get(url.id);
    expect(deletedUrl).toBeUndefined();
  });

  test('returns 404 for non-existent URL', async () => {
    const { token } = await createTestUser('admin-test-delete404@example.com', { isAdmin: true });
    const nonExistentId = randomUUID();

    const response = await request(app)
      .delete(`/api/admin/urls/${nonExistentId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('not found');
  });

  test('cascade deletes clicks', async () => {
    const { token } = await createTestUser('admin-test-cascade@example.com', { isAdmin: true });
    const url = createTestUrl();

    // Record clicks
    recordClick(url.id);
    recordClick(url.id);
    recordClick(url.id);

    // Verify clicks exist
    const db = getDb();
    const clicksBefore = db.prepare('SELECT COUNT(*) as count FROM clicks WHERE url_id = ?').get(url.id) as { count: number };
    expect(clicksBefore.count).toBe(3);

    // Delete the URL
    await request(app)
      .delete(`/api/admin/urls/${url.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Verify clicks are deleted
    const clicksAfter = db.prepare('SELECT COUNT(*) as count FROM clicks WHERE url_id = ?').get(url.id) as { count: number };
    expect(clicksAfter.count).toBe(0);
  });
});
