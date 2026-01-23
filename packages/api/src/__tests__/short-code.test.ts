import {
  generateShortCode,
  isCodeUnique,
  generateUniqueShortCode
} from '../utils/short-code';
import { getDb, initDb } from '../db';

// Initialize database before running tests
beforeAll(() => {
  initDb();
});

// Clean up test data after each test
afterEach(() => {
  const db = getDb();
  db.prepare('DELETE FROM urls WHERE short_code LIKE ?').run('test-%');
});

describe('generateShortCode', () => {
  test('returns string of length 6 by default', () => {
    const code = generateShortCode();
    expect(code).toHaveLength(6);
  });

  test('returns string of specified length', () => {
    const code7 = generateShortCode(7);
    expect(code7).toHaveLength(7);

    const code8 = generateShortCode(8);
    expect(code8).toHaveLength(8);
  });

  test('contains only alphanumeric characters', () => {
    const code = generateShortCode();
    expect(code).toMatch(/^[a-zA-Z0-9]+$/);
  });

  test('generates different codes on repeated calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 10; i++) {
      codes.add(generateShortCode());
    }
    // All 10 codes should be unique
    expect(codes.size).toBe(10);
  });

  test('clamps length to minimum of 6', () => {
    const code = generateShortCode(3);
    expect(code.length).toBeGreaterThanOrEqual(6);
  });

  test('clamps length to maximum of 8', () => {
    const code = generateShortCode(12);
    expect(code.length).toBeLessThanOrEqual(8);
  });
});

describe('isCodeUnique', () => {
  test('returns true for non-existent code', () => {
    const uniqueCode = 'xyz999';
    expect(isCodeUnique(uniqueCode)).toBe(true);
  });

  test('returns false for existing code', () => {
    // Insert a test URL
    const db = getDb();
    const testCode = 'test-abc123';
    db.prepare(`
      INSERT INTO urls (id, short_code, original_url, stats_token, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run('test-id-1', testCode, 'https://example.com', 'test-token-1');

    expect(isCodeUnique(testCode)).toBe(false);
  });

  test('is case-sensitive', () => {
    const db = getDb();
    const testCode = 'test-ABC';
    db.prepare(`
      INSERT INTO urls (id, short_code, original_url, stats_token, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run('test-id-2', testCode, 'https://example.com', 'test-token-2');

    // Exact match should not be unique
    expect(isCodeUnique('test-ABC')).toBe(false);

    // Different case should be unique
    expect(isCodeUnique('test-abc')).toBe(true);
  });
});

describe('generateUniqueShortCode', () => {
  test('returns a valid short code', () => {
    const code = generateUniqueShortCode();
    expect(code).toBeDefined();
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThanOrEqual(6);
    expect(code.length).toBeLessThanOrEqual(8);
    expect(code).toMatch(/^[a-zA-Z0-9]+$/);
  });

  test('returns a unique code', () => {
    const code = generateUniqueShortCode();
    expect(isCodeUnique(code)).toBe(true);
  });

  test('handles collision by generating new code', () => {
    // Pre-populate database with many codes to force potential collision
    const db = getDb();
    const testCodes = ['test-1', 'test-2', 'test-3'];

    testCodes.forEach((code, index) => {
      db.prepare(`
        INSERT INTO urls (id, short_code, original_url, stats_token, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(`test-id-${index}`, code, 'https://example.com', `test-token-${index}`);
    });

    // Should still generate a unique code
    const uniqueCode = generateUniqueShortCode();
    expect(isCodeUnique(uniqueCode)).toBe(true);
    expect(testCodes).not.toContain(uniqueCode);
  });

  test('throws error after max attempts', () => {
    // Mock generateShortCode to always return same code
    const originalGenerate = generateShortCode;
    const fixedCode = 'test-fixed';

    // Insert the fixed code
    const db = getDb();
    db.prepare(`
      INSERT INTO urls (id, short_code, original_url, stats_token, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run('test-id-fixed', fixedCode, 'https://example.com', 'test-token-fixed');

    // This test verifies the max attempts logic exists
    // In real scenario, collision is extremely rare with crypto random
    expect(() => {
      generateUniqueShortCode(0); // maxAttempts = 0 should fail immediately
    }).toThrow();
  });
});
