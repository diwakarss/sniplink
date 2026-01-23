/**
 * URL Redirect Routes
 *
 * Fast redirection endpoint for shortened URLs
 */

import { Router, Request, Response } from 'express';
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
    // Only fetch needed columns for performance
    const db = getDb();
    const stmt = db.prepare(`
      SELECT original_url, is_disabled, expires_at
      FROM urls
      WHERE short_code = ?
    `);

    const result = stmt.get(code) as
      | { original_url: string; is_disabled: number; expires_at: string | null }
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

    // Redirect with 302 (temporary) for analytics flexibility
    res.redirect(302, result.original_url);
  } catch (error) {
    console.error('Failed to redirect:', error);
    res.status(500).json({ error: 'Failed to redirect' });
  }
});

export const redirectRouter = router;
