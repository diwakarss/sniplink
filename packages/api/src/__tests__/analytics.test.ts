/**
 * Analytics API Integration Tests
 *
 * Integration tests for analytics endpoints:
 * - GET /api/analytics/urls
 * - GET /api/analytics/urls/:shortCode/stats
 */

import request from 'supertest';
import { app } from '../index';
import { getDb, initDb } from '../db';
import { randomUUID } from 'crypto';
import { resetRateLimiters } from '../middleware/rate-limit';

// Initialize database before running tests
beforeAll(() => {
  initDb();
});

// Reset rate limiters before each test to prevent rate limit interference
beforeEach(() => {
  resetRateLimiters();
});

// Clean up test data after each test for isolation
afterEach(() => {
  const db = getDb();
  // Delete in order respecting foreign key constraints
  db.prepare('DELETE FROM clicks WHERE url_id IN (SELECT id FROM urls WHERE original_url LIKE ?)').run('https://analytics-test.example.com%');
  db.prepare('DELETE FROM urls WHERE original_url LIKE ?').run('https://analytics-test.example.com%');
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)').run('test-analytics-%');
  db.prepare('DELETE FROM users WHERE email LIKE ?').run('test-analytics-%');
});

/**
 * Helper to register and get token
 */
async function registerAndLogin(email: string, password: string): Promise<string> {
  // Register
  await request(app)
    .post('/api/auth/register')
    .send({ email, password });

  // Login to get token
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  return loginResponse.body.token;
}

/**
 * Helper to create URL (with or without auth)
 */
async function createUrl(url: string, token?: string): Promise<{ shortCode: string; statsToken: string; id: string }> {
  const req = request(app).post('/api/urls').send({ url });

  if (token) {
    req.set('Authorization', `Bearer ${token}`);
  }

  const response = await req;

  // Get the id from database
  const db = getDb();
  const urlData = db.prepare('SELECT id FROM urls WHERE short_code = ?').get(response.body.shortCode) as { id: string };

  return {
    shortCode: response.body.shortCode,
    statsToken: response.body.statsToken,
    id: urlData.id
  };
}

/**
 * Helper to record a click
 */
function recordClick(urlId: string, ipAddress?: string, userAgent?: string): void {
  const db = getDb();
  const clickId = randomUUID();
  db.prepare(`
    INSERT INTO clicks (id, url_id, ip_address, user_agent)
    VALUES (?, ?, ?, ?)
  `).run(clickId, urlId, ipAddress || null, userAgent || null);
}

describe('Analytics API', () => {
  describe('GET /api/analytics/urls', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/analytics/urls');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('should return empty array for user with no URLs', async () => {
      const token = await registerAndLogin('test-analytics-nourl@example.com', 'password123');

      const response = await request(app)
        .get('/api/analytics/urls')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('urls');
      expect(response.body.urls).toEqual([]);
    });

    test("should return user's URLs with click counts", async () => {
      const token = await registerAndLogin('test-analytics-urls@example.com', 'password123');

      // Create 2 URLs
      const url1 = await createUrl('https://analytics-test.example.com/url1', token);
      const url2 = await createUrl('https://analytics-test.example.com/url2', token);

      // Record some clicks on url1
      recordClick(url1.id);
      recordClick(url1.id);

      // Fetch list
      const response = await request(app)
        .get('/api/analytics/urls')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.urls).toHaveLength(2);

      // Find url1 in response
      const url1Data = response.body.urls.find((u: any) => u.shortCode === url1.shortCode);
      expect(url1Data).toBeDefined();
      expect(url1Data.clickCount).toBe(2);
      expect(url1Data.originalUrl).toBe('https://analytics-test.example.com/url1');
      expect(url1Data.statsToken).toBe(url1.statsToken);

      // Find url2 in response
      const url2Data = response.body.urls.find((u: any) => u.shortCode === url2.shortCode);
      expect(url2Data).toBeDefined();
      expect(url2Data.clickCount).toBe(0);
    });

    test("should not return other users' URLs", async () => {
      const tokenA = await registerAndLogin('test-analytics-usera@example.com', 'password123');
      const tokenB = await registerAndLogin('test-analytics-userb@example.com', 'password123');

      // User A creates a URL
      const urlA = await createUrl('https://analytics-test.example.com/user-a-url', tokenA);

      // User B fetches their URLs
      const response = await request(app)
        .get('/api/analytics/urls')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.status).toBe(200);

      // Should not include user A's URL
      const foundUrl = response.body.urls.find((u: any) => u.shortCode === urlA.shortCode);
      expect(foundUrl).toBeUndefined();
    });

    test('should return URLs in descending order by created_at', async () => {
      const token = await registerAndLogin('test-analytics-order@example.com', 'password123');

      // Create 3 URLs
      await createUrl('https://analytics-test.example.com/first', token);
      await createUrl('https://analytics-test.example.com/second', token);
      await createUrl('https://analytics-test.example.com/third', token);

      const response = await request(app)
        .get('/api/analytics/urls')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.urls).toHaveLength(3);

      // Verify descending order by checking timestamps
      for (let i = 0; i < response.body.urls.length - 1; i++) {
        const current = new Date(response.body.urls[i].createdAt);
        const next = new Date(response.body.urls[i + 1].createdAt);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });
  });

  describe('GET /api/analytics/urls/:shortCode/stats', () => {
    test('should return 404 for non-existent short code', async () => {
      const response = await request(app)
        .get('/api/analytics/urls/nonexist/stats');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    test('should return 403 without auth or stats token', async () => {
      // Create anonymous URL
      const url = await createUrl('https://analytics-test.example.com/no-auth');

      // Try to access without auth or token
      const response = await request(app)
        .get(`/api/analytics/urls/${url.shortCode}/stats`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Access denied');
    });

    test('should return stats for owner with JWT', async () => {
      const token = await registerAndLogin('test-analytics-owner@example.com', 'password123');

      // Create URL as authenticated user
      const url = await createUrl('https://analytics-test.example.com/owner-stats', token);

      // Record some clicks
      recordClick(url.id, '192.168.1.1', 'Mozilla/5.0');
      recordClick(url.id, '192.168.1.2', 'Chrome/90.0');

      // Fetch stats with JWT
      const response = await request(app)
        .get(`/api/analytics/urls/${url.shortCode}/stats`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('shortCode', url.shortCode);
      expect(response.body).toHaveProperty('totalClicks', 2);
      expect(response.body).toHaveProperty('recentClicks');
      expect(response.body.recentClicks).toHaveLength(2);
    });

    test('should return stats with valid stats_token query param', async () => {
      // Create anonymous URL
      const url = await createUrl('https://analytics-test.example.com/token-access');

      // Record a click
      recordClick(url.id, '10.0.0.1', 'Safari/14.0');

      // Fetch stats with statsToken (no JWT)
      const response = await request(app)
        .get(`/api/analytics/urls/${url.shortCode}/stats?statsToken=${url.statsToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('shortCode', url.shortCode);
      expect(response.body).toHaveProperty('totalClicks', 1);
      expect(response.body.recentClicks).toHaveLength(1);
      expect(response.body.recentClicks[0].ipAddress).toBe('10.0.0.1');
      expect(response.body.recentClicks[0].userAgent).toBe('Safari/14.0');
    });

    test('should return 403 for wrong stats_token', async () => {
      const url = await createUrl('https://analytics-test.example.com/wrong-token');

      const response = await request(app)
        .get(`/api/analytics/urls/${url.shortCode}/stats?statsToken=wrong-token-12345`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    test("should return 403 for different user's URL without token", async () => {
      const tokenA = await registerAndLogin('test-analytics-owner-a@example.com', 'password123');
      const tokenB = await registerAndLogin('test-analytics-owner-b@example.com', 'password123');

      // User A creates a URL
      const url = await createUrl('https://analytics-test.example.com/user-a-private', tokenA);

      // User B tries to access stats
      const response = await request(app)
        .get(`/api/analytics/urls/${url.shortCode}/stats`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    test('should include recent clicks with details', async () => {
      const token = await registerAndLogin('test-analytics-details@example.com', 'password123');
      const url = await createUrl('https://analytics-test.example.com/click-details', token);

      // Record 3 clicks with different IPs and agents
      recordClick(url.id, '192.168.1.10', 'Mozilla/5.0 (Windows)');
      recordClick(url.id, '192.168.1.20', 'Mozilla/5.0 (Mac)');
      recordClick(url.id, '192.168.1.30', 'Mozilla/5.0 (Linux)');

      const response = await request(app)
        .get(`/api/analytics/urls/${url.shortCode}/stats`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.totalClicks).toBe(3);
      expect(response.body.recentClicks).toHaveLength(3);

      // Verify all clicks have required fields
      response.body.recentClicks.forEach((click: any) => {
        expect(click).toHaveProperty('clickedAt');
        expect(click).toHaveProperty('ipAddress');
        expect(click).toHaveProperty('userAgent');
      });

      // Verify specific data
      const ips = response.body.recentClicks.map((c: any) => c.ipAddress);
      expect(ips).toContain('192.168.1.10');
      expect(ips).toContain('192.168.1.20');
      expect(ips).toContain('192.168.1.30');
    });

    test('should limit recent clicks to 10', async () => {
      const token = await registerAndLogin('test-analytics-limit@example.com', 'password123');
      const url = await createUrl('https://analytics-test.example.com/click-limit', token);

      // Record 15 clicks
      for (let i = 0; i < 15; i++) {
        recordClick(url.id, `192.168.1.${i}`, `Agent/${i}`);
      }

      const response = await request(app)
        .get(`/api/analytics/urls/${url.shortCode}/stats`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.totalClicks).toBe(15);
      expect(response.body.recentClicks).toHaveLength(10);
    });
  });
});
