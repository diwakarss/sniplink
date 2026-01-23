import request from 'supertest';
import { app } from '../index';
import { initDb, getDb } from '../db';
import { randomUUID } from 'crypto';

// Initialize database before running tests
beforeAll(() => {
  initDb();
});

// Clean up test data after all tests
afterAll(() => {
  const db = getDb();
  db.prepare('DELETE FROM urls WHERE original_url LIKE ?').run('https://redirect-test.example.com%');
});

describe('GET /:code', () => {
  let testCode: string;
  let testUrl: string;

  beforeAll(async () => {
    // Create a test URL via the API
    testUrl = 'https://redirect-test.example.com/destination';
    const response = await request(app)
      .post('/api/urls')
      .send({ url: testUrl });

    testCode = response.body.shortCode;
  });

  test('should redirect to original URL', async () => {
    const response = await request(app)
      .get(`/${testCode}`)
      .redirects(0); // Don't follow redirects

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(testUrl);
  });

  test('should return 404 for unknown code', async () => {
    const response = await request(app)
      .get('/nonexistent123');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('not found');
  });

  test('should return 404 for invalid code format (too short)', async () => {
    const response = await request(app)
      .get('/abc');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 404 for invalid code format (special characters)', async () => {
    const response = await request(app)
      .get('/!@#$%^');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 404 for code with spaces', async () => {
    const response = await request(app)
      .get('/abc 123');

    expect(response.status).toBe(404);
  });

  test('should return 410 for disabled URL', async () => {
    // Create a test URL
    const db = getDb();
    const disabledCode = 'dis123';
    const id = randomUUID();
    const statsToken = randomUUID();

    db.prepare(`
      INSERT INTO urls (id, short_code, original_url, stats_token, is_disabled, created_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
    `).run(id, disabledCode, 'https://redirect-test.example.com/disabled', statsToken);

    const response = await request(app)
      .get(`/${disabledCode}`);

    expect(response.status).toBe(410);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('disabled');

    // Clean up
    db.prepare('DELETE FROM urls WHERE short_code = ?').run(disabledCode);
  });

  test('should return 410 for expired URL', async () => {
    // Create an expired test URL
    const db = getDb();
    const expiredCode = 'exp123';
    const id = randomUUID();
    const statsToken = randomUUID();

    db.prepare(`
      INSERT INTO urls (id, short_code, original_url, stats_token, expires_at, created_at)
      VALUES (?, ?, ?, ?, datetime('now', '-1 day'), datetime('now', '-2 days'))
    `).run(id, expiredCode, 'https://redirect-test.example.com/expired', statsToken);

    const response = await request(app)
      .get(`/${expiredCode}`);

    expect(response.status).toBe(410);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('expired');

    // Clean up
    db.prepare('DELETE FROM urls WHERE short_code = ?').run(expiredCode);
  });

  test('should redirect for URL with future expiration', async () => {
    // Create a test URL with future expiration
    const db = getDb();
    const futureCode = 'fut123';
    const id = randomUUID();
    const statsToken = randomUUID();
    const futureUrl = 'https://redirect-test.example.com/future';

    db.prepare(`
      INSERT INTO urls (id, short_code, original_url, stats_token, expires_at, created_at)
      VALUES (?, ?, ?, ?, datetime('now', '+1 day'), datetime('now'))
    `).run(id, futureCode, futureUrl, statsToken);

    const response = await request(app)
      .get(`/${futureCode}`)
      .redirects(0);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(futureUrl);

    // Clean up
    db.prepare('DELETE FROM urls WHERE short_code = ?').run(futureCode);
  });

  test('should handle URLs with special characters', async () => {
    // Create URL with special characters
    const specialUrl = 'https://redirect-test.example.com/path?q=hello%20world&lang=en';
    const response = await request(app)
      .post('/api/urls')
      .send({ url: specialUrl });

    const code = response.body.shortCode;

    const redirectResponse = await request(app)
      .get(`/${code}`)
      .redirects(0);

    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.location).toBeDefined();
  });
});
