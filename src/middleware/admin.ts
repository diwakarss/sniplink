/**
 * Admin Authentication Middleware
 *
 * Provides JWT verification AND admin status check for admin routes.
 * Combined middleware for efficiency (single DB query instead of chaining).
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { getDb } from '../db';

/**
 * Middleware to require admin authentication for admin routes
 *
 * Extracts Bearer token from Authorization header, verifies JWT,
 * queries database to confirm user is_admin, and attaches decoded
 * payload to req.user.
 *
 * Returns 401 on missing/invalid/expired token.
 * Returns 403 on valid token but non-admin user.
 *
 * Usage:
 * ```typescript
 * router.use(requireAdmin);
 * // All routes in this router now require admin
 *
 * // Or apply to specific route:
 * router.get('/admin-only', requireAdmin, (req, res) => {
 *   res.json({ admin: req.user });
 * });
 * ```
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
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
    // Token invalid or expired
    res.status(401).json({
      error: 'Token expired or invalid',
      redirectUrl: '/login'
    });
    return;
  }

  // Check if user is admin in database
  const db = getDb();
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(payload.userId) as { is_admin: number } | undefined;

  if (!user) {
    // User no longer exists in database
    res.status(401).json({
      error: 'User not found',
      redirectUrl: '/login'
    });
    return;
  }

  if (user.is_admin !== 1) {
    // User exists but is not an admin
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  // Attach user to request for use in route handlers
  req.user = payload;
  next();
}
