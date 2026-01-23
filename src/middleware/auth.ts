/**
 * Authentication Middleware
 *
 * Provides JWT verification for protected routes
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { JwtPayload } from '../types';

/**
 * Extend Express Request to include user payload from JWT
 */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware to require authentication for protected routes
 *
 * Extracts Bearer token from Authorization header, verifies JWT,
 * and attaches decoded payload to req.user.
 *
 * Returns 401 with redirectUrl on missing/invalid/expired token.
 *
 * Usage:
 * ```typescript
 * router.get('/protected', requireAuth, (req, res) => {
 *   // req.user contains { userId, email }
 *   res.json({ user: req.user });
 * });
 * ```
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Verify token
  const payload = verifyToken(token);

  if (!payload) {
    // Token invalid or expired (AUTH-07: 24h expiry)
    // From CONTEXT.md: return 401 with redirect URL for client to handle re-login
    res.status(401).json({
      error: 'Token expired or invalid',
      redirectUrl: '/login'
    });
    return;
  }

  // Attach user to request for use in route handlers
  req.user = payload;
  next();
}
