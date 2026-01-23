/**
 * URL Redirect Routes
 *
 * Fast redirection endpoint for shortened URLs
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db';

const router = Router();

/**
 * GET /:code
 *
 * Redirect to original URL using short code
 *
 * Performance optimized:
 * - Minimal database query (only needed columns)
 * - No unnecessary processing
 * - 302 redirect for analytics flexibility
 */
router.get('/:code', (req: Request, res: Response) => {
  try {
    const code = req.params.code;

    // Ensure code is a string (Express typing allows string | string[])
    if (!code || typeof code !== 'string') {
      res.status(404).json({ error: 'Short URL not found' });
      return;
    }

    // Validate code format (alphanumeric, 6-8 chars)
    const isValidFormat = /^[a-zA-Z0-9]{6,8}$/.test(code);
    if (!isValidFormat) {
      res.status(404).json({ error: 'Short URL not found' });
      return;
    }

    // Query database with parameterized query (SEC-05)
    // Fetch id for click tracking
    const db = getDb();
    const stmt = db.prepare(`
      SELECT id, original_url, is_disabled, expires_at
      FROM urls
      WHERE short_code = ?
    `);

    const result = stmt.get(code) as
      | { id: string; original_url: string; is_disabled: number; expires_at: string | null }
      | undefined;

    // Handle not found
    if (!result) {
      res.status(404).json({ error: 'Short URL not found' });
      return;
    }

    // Check if disabled
    if (result.is_disabled === 1) {
      res.status(410).json({ error: 'This short URL has been disabled' });
      return;
    }

    // Check if expired
    if (result.expires_at) {
      const expiresAt = new Date(result.expires_at);
      const now = new Date();
      if (now > expiresAt) {
        res.status(410).json({ error: 'This short URL has expired' });
        return;
      }
    }

    // Record click for analytics (ANLZ-01, ANLZ-02)
    // Extract IP address and User-Agent
    try {
      const clickId = randomUUID();
      // Check X-Forwarded-For first (for proxied requests), then fall back to req.ip
      const forwardedFor = req.headers['x-forwarded-for'];
      const ipAddress = (Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor?.split(',')[0]) || req.ip || null;
      const userAgent = req.headers['user-agent'] || null;

      const clickStmt = db.prepare(`
        INSERT INTO clicks (id, url_id, ip_address, user_agent)
        VALUES (?, ?, ?, ?)
      `);

      clickStmt.run(clickId, result.id, ipAddress, userAgent);
    } catch (clickError) {
      // Log error but don't block redirect
      console.error('Failed to record click:', clickError);
    }

    // Redirect with 302 (temporary) for analytics flexibility
    res.redirect(302, result.original_url);
  } catch (error) {
    console.error('Failed to redirect:', error);
    res.status(500).json({ error: 'Failed to redirect' });
  }
});

export const redirectRouter = router;
