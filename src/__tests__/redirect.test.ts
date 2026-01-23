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
  // Clean up clicks first (foreign key constraint)
  db.prepare('DELETE FROM clicks WHERE url_id IN (SELECT id FROM urls WHERE original_url LIKE ?)').run('https://redirect-test.example.com%');
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

  test('should record click on successful redirect', async () => {
    // Create a test URL
    const testUrl = 'https://redirect-test.example.com/click-tracking';
    const response = await request(app)
      .post('/api/urls')
      .send({ url: testUrl });

    const code = response.body.shortCode;

    // Visit the short URL
    await request(app)
      .get(`/${code}`)
      .redirects(0);

    // Query database for clicks
    const db = getDb();
    const urlResult = db.prepare('SELECT id FROM urls WHERE short_code = ?').get(code) as { id: string } | undefined;
    expect(urlResult).toBeDefined();

    const clicks = db.prepare('SELECT * FROM clicks WHERE url_id = ?').all(urlResult!.id);
    expect(clicks.length).toBe(1);

    const click = clicks[0] as any;
    expect(click.url_id).toBe(urlResult!.id);
    expect(click.clicked_at).toBeDefined();

    // Verify timestamp format is valid ISO string
    expect(click.clicked_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  test('should capture IP address in click record', async () => {
    // Create a test URL
    const testUrl = 'https://redirect-test.example.com/ip-tracking';
    const response = await request(app)
      .post('/api/urls')
      .send({ url: testUrl });

    const code = response.body.shortCode;

    // Visit with custom IP via X-Forwarded-For header
    await request(app)
      .get(`/${code}`)
      .set('X-Forwarded-For', '192.168.1.100')
      .redirects(0);

    // Query clicks table
    const db = getDb();
    const urlResult = db.prepare('SELECT id FROM urls WHERE short_code = ?').get(code) as { id: string };
    const click = db.prepare('SELECT ip_address FROM clicks WHERE url_id = ?').get(urlResult.id) as any;

    expect(click.ip_address).toBe('192.168.1.100');
  });

  test('should capture user agent in click record', async () => {
    // Create a test URL
    const testUrl = 'https://redirect-test.example.com/ua-tracking';
    const response = await request(app)
      .post('/api/urls')
      .send({ url: testUrl });

    const code = response.body.shortCode;

    // Visit with custom User-Agent
    await request(app)
      .get(`/${code}`)
      .set('User-Agent', 'TestAgent/1.0')
      .redirects(0);

    // Query clicks table
    const db = getDb();
    const urlResult = db.prepare('SELECT id FROM urls WHERE short_code = ?').get(code) as { id: string };
    const click = db.prepare('SELECT user_agent FROM clicks WHERE url_id = ?').get(urlResult.id) as any;

    expect(click.user_agent).toBe('TestAgent/1.0');
  });

  test('should increment click count on multiple visits', async () => {
    // Create a test URL
    const testUrl = 'https://redirect-test.example.com/multiple-clicks';
    const response = await request(app)
      .post('/api/urls')
      .send({ url: testUrl });

    const code = response.body.shortCode;

    // Visit 3 times
    await request(app).get(`/${code}`).redirects(0);
    await request(app).get(`/${code}`).redirects(0);
    await request(app).get(`/${code}`).redirects(0);

    // Query click count
    const db = getDb();
    const urlResult = db.prepare('SELECT id FROM urls WHERE short_code = ?').get(code) as { id: string };
    const countResult = db.prepare('SELECT COUNT(*) as count FROM clicks WHERE url_id = ?').get(urlResult.id) as { count: number };

    expect(countResult.count).toBe(3);
  });

  test('should not record click for invalid short code', async () => {
    const db = getDb();

    // Count clicks before request
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM clicks').get() as { count: number };

    // Visit invalid code
    await request(app).get('/invalidcode');

    // Count clicks after request
    const countAfter = db.prepare('SELECT COUNT(*) as count FROM clicks').get() as { count: number };

    // No new clicks should be recorded
    expect(countAfter.count).toBe(countBefore.count);
  });

  test('should not record click for disabled URL', async () => {
    // Create a test URL
    const db = getDb();
    const disabledCode = 'dis456';
    const id = randomUUID();
    const statsToken = randomUUID();

    db.prepare(`
      INSERT INTO urls (id, short_code, original_url, stats_token, is_disabled, created_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
    `).run(id, disabledCode, 'https://redirect-test.example.com/disabled-click', statsToken);

    // Count clicks before request
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM clicks WHERE url_id = ?').get(id) as { count: number };

    // Visit disabled URL
    await request(app).get(`/${disabledCode}`);

    // Count clicks after request
    const countAfter = db.prepare('SELECT COUNT(*) as count FROM clicks WHERE url_id = ?').get(id) as { count: number };

    // No new clicks should be recorded
    expect(countAfter.count).toBe(countBefore.count);

    // Clean up
    db.prepare('DELETE FROM urls WHERE short_code = ?').run(disabledCode);
  });
});
