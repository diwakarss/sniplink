/**
 * Authentication utilities
 *
 * Provides password hashing, JWT token management, and reset token generation
 */

import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

/**
 * Number of salt rounds for bcrypt hashing
 * SEC-06: Minimum 10 rounds for security
 */
const BCRYPT_ROUNDS = 10;

/**
 * JWT payload structure
 */
export interface TokenPayload {
  userId: string;
  email: string;
}

/**
 * Hash a password using bcrypt
 * @param password - Plain text password to hash
 * @returns Promise resolving to the bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash
 * @param password - Plain text password to verify
 * @param hash - Bcrypt hash to compare against
 * @returns Promise resolving to true if match, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token for authenticated users
 * @param payload - User identification data (userId, email)
 * @returns Signed JWT token string
 */
export function generateToken(payload: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, config.jwtSecret, options);
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token string to verify
 * @returns Decoded payload if valid, null if expired or invalid
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload & jwt.JwtPayload;
    return {
      userId: decoded.userId,
      email: decoded.email,
    };
  } catch {
    // Token is invalid, expired, or malformed
    return null;
  }
}

/**
 * Generate a cryptographically secure reset token
 * @returns 64-character hex string (32 bytes)
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
