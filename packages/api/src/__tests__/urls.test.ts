import request from 'supertest';
import { app } from '../index';
import { initDb, getDb } from '../db';
import { resetRateLimiters } from '../middleware/rate-limit';

// Initialize database before running tests
beforeAll(() => {
  initDb();
});

// Reset rate limiters before each test
beforeEach(() => {
  resetRateLimiters();
});

// Clean up test data after each test
afterEach(() => {
  const db = getDb();
  db.prepare('DELETE FROM urls WHERE original_url LIKE ?').run('https://test.example.com%');
});

describe('POST /api/urls', () => {
  test('should create shortened URL with valid input', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({ url: 'https://test.example.com/long-url' });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('shortCode');
    expect(response.body).toHaveProperty('shortUrl');
    expect(response.body).toHaveProperty('originalUrl');
    expect(response.body).toHaveProperty('statsToken');

    // Verify shortCode format (6-8 alphanumeric chars)
    expect(response.body.shortCode).toMatch(/^[a-zA-Z0-9]{6,8}$/);

    // Verify shortUrl contains shortCode
    expect(response.body.shortUrl).toContain(response.body.shortCode);

    // Verify originalUrl matches
    expect(response.body.originalUrl).toBe('https://test.example.com/long-url');

    // Verify statsToken is a UUID
    expect(response.body.statsToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  test('should return 400 for missing URL', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('required');
  });

  test('should return 400 for empty URL', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({ url: '' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 400 for invalid URL format', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({ url: 'not-a-url' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Invalid');
  });

  test('should return 400 for non-HTTP URL', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({ url: 'javascript:alert(1)' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('HTTP');
  });

  test('should return 400 for ftp URL', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({ url: 'ftp://example.com' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('HTTP');
  });

  test('should sanitize URL with XSS attempt', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({ url: 'https://test.example.com/<script>alert("xss")</script>' });

    // Should succeed with sanitized URL
    expect(response.status).toBe(201);
    expect(response.body.originalUrl).toContain('&lt;');
    expect(response.body.originalUrl).toContain('&gt;');
    expect(response.body.originalUrl).not.toContain('<script>');
  });

  test('should generate unique short codes', async () => {
    const response1 = await request(app)
      .post('/api/urls')
      .send({ url: 'https://test.example.com/url1' });

    const response2 = await request(app)
      .post('/api/urls')
      .send({ url: 'https://test.example.com/url2' });

    expect(response1.status).toBe(201);
    expect(response2.status).toBe(201);

    // Short codes should be different
    expect(response1.body.shortCode).not.toBe(response2.body.shortCode);
  });

  test('should handle URLs with query parameters', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({ url: 'https://test.example.com/page?param1=value1&param2=value2' });

    expect(response.status).toBe(201);
    expect(response.body.originalUrl).toContain('param1');
    expect(response.body.originalUrl).toContain('param2');
  });

  test('should handle URLs with fragments', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({ url: 'https://test.example.com/page#section' });

    expect(response.status).toBe(201);
    expect(response.body.originalUrl).toContain('#section');
  });

  test('should return 400 for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/urls')
      .set('Content-Type', 'application/json')
      .send('{"url": invalid}'); // Invalid JSON

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Invalid JSON');
  });

  test('should return 400 for blocked domain (bit.ly)', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({ url: 'https://bit.ly/abc123' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('security reasons');
  });

  test('should return 400 for blocked domain subdomain (www.tinyurl.com)', async () => {
    const response = await request(app)
      .post('/api/urls')
      .send({ url: 'https://www.tinyurl.com/abc123' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('security reasons');
  });
});

describe('POST /api/urls - Rate Limiting', () => {
  test('should return 429 after exceeding IP rate limit (10/min)', async () => {
    // Make 10 requests (at limit)
    for (let i = 0; i < 10; i++) {
      const response = await request(app)
        .post('/api/urls')
        .send({ url: `https://test.example.com/url-${i}` });

      expect(response.status).toBe(201);
    }

    // 11th request should be rate limited
    const response = await request(app)
      .post('/api/urls')
      .send({ url: 'https://test.example.com/rate-limited' });

    expect(response.status).toBe(429);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Too many requests');
    expect(response.body).toHaveProperty('retryAfter');
    expect(response.body.retryAfter).toBeGreaterThan(0);
    expect(response.body.retryAfter).toBeLessThanOrEqual(60); // 1 minute window
    expect(response.headers['retry-after']).toBeDefined();
  });
});
