/**
 * URL Shortening Routes
 *
 * Endpoints for creating and managing shortened URLs
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { validateUrl, sanitizeUrl, generateUniqueShortCode } from '../utils';
import { getDb } from '../db';
import { config } from '../config';

const router = Router();

/**
 * POST /api/urls
 *
 * Create a shortened URL
 *
 * Request body:
 * {
 *   "url": "https://example.com/long-url"
 * }
 *
 * Response:
 * {
 *   "shortCode": "abc123",
 *   "shortUrl": "http://localhost:3000/abc123",
 *   "originalUrl": "https://example.com/long-url",
 *   "statsToken": "uuid-for-anonymous-stats"
 * }
 */
router.post('/', (req: Request, res: Response) => {
  try {
    // Extract URL from request body
    const { url } = req.body;

    // Validate URL presence
    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    // Validate URL format and security
    const validation = validateUrl(url);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Sanitize URL to prevent XSS
    const sanitizedUrl = sanitizeUrl(url);

    // Generate unique short code
    const shortCode = generateUniqueShortCode();

    // Generate tokens
    const id = randomUUID();
    const statsToken = randomUUID();

    // Insert into database using parameterized query (SEC-05)
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO urls (id, short_code, original_url, stats_token, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(id, shortCode, sanitizedUrl, statsToken);

    // Build short URL
    const protocol = req.protocol;
    const host = req.get('host');
    const shortUrl = `${protocol}://${host}/${shortCode}`;

    // Return success response
    res.status(201).json({
      shortCode,
      shortUrl,
      originalUrl: sanitizedUrl,
      statsToken
    });
  } catch (error) {
    console.error('Failed to create shortened URL:', error);
    res.status(500).json({ error: 'Failed to create shortened URL' });
  }
});

export const urlsRouter = router;
