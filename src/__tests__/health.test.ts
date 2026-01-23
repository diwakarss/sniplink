import request from 'supertest';
import { app } from '../index';
import { initDb } from '../db';

// Initialize database before running tests
beforeAll(() => {
  initDb();
});

describe('Health Endpoint', () => {
  test('GET /health returns 200 with status ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
    expect(typeof response.body.uptime).toBe('number');
  });

  test('GET /health returns valid ISO timestamp', async () => {
    const response = await request(app).get('/health');

    const timestamp = new Date(response.body.timestamp);
    expect(timestamp.toString()).not.toBe('Invalid Date');
    expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
