/**
 * Short Code Generation
 *
 * Provides cryptographically random short code generation with collision detection.
 * Features:
 * - Crypto-random generation (not Math.random)
 * - Alphanumeric character set (62 characters)
 * - Database uniqueness check
 * - Collision retry with length escalation
 */

import { randomBytes } from 'crypto';
import { getDb } from '../db';

// Alphanumeric character set: a-z, A-Z, 0-9 (62 characters)
const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CHARSET_LENGTH = CHARSET.length;

// Code length constraints
const MIN_LENGTH = 6;
const MAX_LENGTH = 8;
const DEFAULT_LENGTH = 6;
const DEFAULT_MAX_ATTEMPTS = 10;

/**
 * Generate a random short code
 *
 * Uses crypto.randomBytes for cryptographic randomness (not Math.random).
 * Character set: a-z, A-Z, 0-9 (62 characters = 56+ billion combinations at length 6)
 *
 * @param length - Length of code (6-8 characters, clamped if outside range)
 * @returns Random alphanumeric code
 */
export function generateShortCode(length: number = DEFAULT_LENGTH): string {
  // Clamp length to valid range
  const codeLength = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, length));

  // Generate random bytes (need extra bytes for mapping to charset)
  const bytes = randomBytes(codeLength * 2);

  // Map bytes to charset
  let code = '';
  for (let i = 0; i < codeLength; i++) {
    // Use two bytes for better randomness distribution
    const randomValue = bytes.readUInt16BE(i * 2) % CHARSET_LENGTH;
    code += CHARSET[randomValue];
  }

  return code;
}

/**
 * Check if a short code is unique in the database
 *
 * Queries the urls table to verify the code doesn't already exist.
 * Uses parameterized query to prevent SQL injection (SEC-05).
 *
 * @param code - Short code to check
 * @returns true if code is unique (available), false if already exists
 */
export function isCodeUnique(code: string): boolean {
  const db = getDb();

  // Parameterized query to prevent SQL injection
  const stmt = db.prepare('SELECT 1 FROM urls WHERE short_code = ? LIMIT 1');
  const result = stmt.get(code);

  // If no result, code is unique
  return result === undefined;
}

/**
 * Generate a unique short code with collision handling
 *
 * Generates codes and checks database uniqueness, retrying on collision.
 * Escalates code length (6 → 7 → 8) on repeated collisions.
 *
 * @param maxAttempts - Maximum attempts before throwing error (default: 10)
 * @returns Unique short code
 * @throws Error if max attempts reached (indicates need for longer codes)
 */
export function generateUniqueShortCode(maxAttempts: number = DEFAULT_MAX_ATTEMPTS): string {
  let attempts = 0;
  let currentLength = DEFAULT_LENGTH;

  while (attempts < maxAttempts) {
    const code = generateShortCode(currentLength);

    if (isCodeUnique(code)) {
      return code;
    }

    attempts++;

    // Escalate length every 3 attempts
    if (attempts % 3 === 0 && currentLength < MAX_LENGTH) {
      currentLength++;
    }
  }

  throw new Error(
    `Failed to generate unique short code after ${maxAttempts} attempts. ` +
    'Consider increasing code length or cleaning up database.'
  );
}
