/**
 * Authentication Routes
 *
 * Endpoints for user registration, login, and password reset
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { hashPassword, verifyPassword, generateToken, generateResetToken } from '../utils/auth';
import { getDb } from '../db';
import { AuthRequest, User } from '../types';

const router = Router();

/**
 * Email validation regex - simple format check
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Minimum password length (from CONTEXT.md: minimum 8, no complexity rules)
 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Failed login attempt tracking for progressive delay
 * Map<email, { count: number, lastAttempt: Date }>
 */
const failedAttempts = new Map<string, { count: number; lastAttempt: Date }>();

/**
 * Calculate delay based on failed attempt count
 * Formula: min(2^count, 30) seconds (cap at 30 seconds)
 */
function calculateDelay(email: string): number {
  const attempt = failedAttempts.get(email);
  if (!attempt) return 0;
  return Math.min(Math.pow(2, attempt.count), 30) * 1000;
}

/**
 * Record a failed login attempt
 */
function recordFailedAttempt(email: string): void {
  const attempt = failedAttempts.get(email);
  if (attempt) {
    attempt.count += 1;
    attempt.lastAttempt = new Date();
  } else {
    failedAttempts.set(email, { count: 1, lastAttempt: new Date() });
  }
}

/**
 * Clear failed attempts on successful login
 */
function clearFailedAttempts(email: string): void {
  failedAttempts.delete(email);
}

/**
 * Apply delay before responding (for rate limiting)
 */
async function applyDelay(email: string): Promise<void> {
  const delay = calculateDelay(email);
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Password reset token record from database
 */
interface PasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/**
 * POST /api/auth/register
 *
 * Create a new user account
 *
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 *
 * Response:
 * {
 *   "message": "Registration successful. Please check your email.",
 *   "userId": "uuid"
 * }
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as AuthRequest;

    // Validate email presence and format
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Validate password presence and length
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }

    // Check if email already exists
    const db = getDb();
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());

    if (existingUser) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Hash password using bcrypt
    const passwordHash = await hashPassword(password);

    // Generate user ID
    const userId = randomUUID();

    // Insert user into database using parameterized query
    const stmt = db.prepare(`
      INSERT INTO users (id, email, password_hash, is_admin, is_banned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    stmt.run(userId, email.toLowerCase(), passwordHash, 0, 0);

    // Mock email verification (AUTH-02)
    console.log(`[MOCK EMAIL] Verification email sent to ${email}`);

    // Return success response
    res.status(201).json({
      message: 'Registration successful. Please check your email.',
      userId
    });
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 *
 * Authenticate a user and return a JWT token
 *
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 *
 * Response:
 * {
 *   "token": "jwt.token.here",
 *   "expiresIn": "24h"
 * }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as AuthRequest;

    // Validate presence
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Apply progressive delay before processing
    await applyDelay(email.toLowerCase());

    // Find user by email
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as User | undefined;

    // User not found - return generic error after recording attempt
    if (!user) {
      recordFailedAttempt(email.toLowerCase());
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check if user is banned
    if (user.is_banned) {
      res.status(403).json({ error: 'Account has been suspended' });
      return;
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);

    // Invalid password - return generic error after recording attempt
    if (!isValidPassword) {
      recordFailedAttempt(email.toLowerCase());
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(email.toLowerCase());

    // Generate JWT token with admin status
    const token = generateToken({
      userId: user.id,
      email: user.email,
      isAdmin: !!user.is_admin
    });

    // Return success response with user info including isAdmin flag
    res.status(200).json({
      token,
      expiresIn: '24h',
      user: {
        id: user.id,
        email: user.email,
        isAdmin: !!user.is_admin
      }
    });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/forgot-password
 *
 * Request a password reset link. Sends mock email with reset token.
 *
 * Request body:
 * {
 *   "email": "user@example.com"
 * }
 *
 * Response (always same for security - prevents email enumeration):
 * {
 *   "message": "If that email exists, we sent a password reset link."
 * }
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validate email presence
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const db = getDb();

    // Look up user by email
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email.toLowerCase()) as
      | { id: string; email: string }
      | undefined;

    if (user) {
      // Generate reset token
      const plainToken = generateResetToken();

      // Hash token for storage (same security as passwords)
      const tokenHash = await hashPassword(plainToken);

      // Delete any existing tokens for this user (one active token at a time)
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);

      // Insert new token with 1 hour expiry
      const tokenId = randomUUID();
      db.prepare(`
        INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, datetime('now', '+1 hour'), datetime('now'))
      `).run(tokenId, user.id, tokenHash);

      // Mock email - in production this would send actual email
      console.log(
        `[MOCK EMAIL] Password reset link: http://localhost:3000/reset-password?token=${plainToken}`
      );
    }
    // If user doesn't exist, do nothing (no token created) - prevents email enumeration

    // Always return same response for security
    res.status(200).json({ message: 'If that email exists, we sent a password reset link.' });
  } catch (error) {
    console.error('Failed to process password reset request:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

/**
 * POST /api/auth/reset-password
 *
 * Reset user's password using a valid reset token.
 *
 * Request body:
 * {
 *   "token": "64-character-hex-token",
 *   "password": "newPassword123"
 * }
 *
 * Response:
 * - Success: { "message": "Password has been reset successfully." }
 * - Error: { "error": "Invalid or expired reset token." }
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    // Validate presence
    if (!token) {
      res.status(400).json({ error: 'Reset token is required' });
      return;
    }

    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    // Validate password length
    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }

    const db = getDb();

    // Find all unused, non-expired tokens
    // We need to compare bcrypt hashes, so we fetch all valid tokens and compare in code
    const validTokens = db.prepare(`
      SELECT prt.* FROM password_reset_tokens prt
      WHERE prt.used_at IS NULL
      AND datetime(prt.expires_at) > datetime('now')
    `).all() as PasswordResetToken[];

    // Find matching token by comparing hashes
    let matchedToken: PasswordResetToken | null = null;
    for (const tokenRecord of validTokens) {
      const isMatch = await verifyPassword(token, tokenRecord.token_hash);
      if (isMatch) {
        matchedToken = tokenRecord;
        break;
      }
    }

    // No matching token found
    if (!matchedToken) {
      res.status(400).json({ error: 'Invalid or expired reset token.' });
      return;
    }

    // Hash new password
    const newPasswordHash = await hashPassword(password);

    // Update user's password
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      newPasswordHash,
      matchedToken.user_id
    );

    // Mark token as used (single-use enforcement)
    db.prepare('UPDATE password_reset_tokens SET used_at = datetime(\'now\') WHERE id = ?').run(
      matchedToken.id
    );

    // Return success
    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Failed to reset password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export const authRouter = router;
