/**
 * Analytics Routes
 *
 * Endpoints for viewing user URLs and click statistics
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getDb } from '../db';
import { verifyToken } from '../utils/auth';

const router = Router();

/**
 * GET /api/analytics/urls
 *
 * Returns all URLs owned by the authenticated user with click counts.
 *
 * Protected: Requires JWT authentication
 *
 * Response:
 * {
 *   "urls": [
 *     {
 *       "id": "uuid",
 *       "shortCode": "abc123",
 *       "originalUrl": "https://...",
 *       "statsToken": "uuid",
 *       "clickCount": 42,
 *       "expiresAt": null,
 *       "isDisabled": false,
 *       "createdAt": "2026-01-23T..."
 *     }
 *   ]
 * }
 */
router.get('/urls', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user!.userId;

    // Query URLs with click counts using subquery for efficiency
    const urls = db.prepare(`
      SELECT
        u.id,
        u.short_code,
        u.original_url,
        u.stats_token,
        u.expires_at,
        u.is_disabled,
        u.created_at,
        (SELECT COUNT(*) FROM clicks c WHERE c.url_id = u.id) as click_count
      FROM urls u
      WHERE u.user_id = ?
      ORDER BY u.created_at DESC
    `).all(userId);

    // Convert snake_case to camelCase for response
    const formattedUrls = urls.map((url: any) => ({
      id: url.id,
      shortCode: url.short_code,
      originalUrl: url.original_url,
      statsToken: url.stats_token,
      clickCount: url.click_count,
      expiresAt: url.expires_at,
      isDisabled: Boolean(url.is_disabled),
      createdAt: url.created_at
    }));

    res.json({ urls: formattedUrls });
  } catch (error) {
    console.error('Error fetching user URLs:', error);
    res.status(500).json({ error: 'Failed to fetch URLs' });
  }
});

/**
 * GET /api/analytics/urls/:shortCode/stats
 *
 * Returns detailed click statistics for a specific URL.
 *
 * Access control:
 * - Authenticated user who owns the URL (via JWT)
 * - Anyone with the stats_token query parameter
 *
 * Query params:
 * - statsToken: Optional stats token for anonymous access
 *
 * Response:
 * {
 *   "shortCode": "abc123",
 *   "totalClicks": 42,
 *   "recentClicks": [
 *     {
 *       "clickedAt": "2026-01-23T10:30:00Z",
 *       "ipAddress": "192.168.1.1",
 *       "userAgent": "Mozilla/5.0..."
 *     }
 *   ]
 * }
 */
router.get('/urls/:shortCode/stats', (req, res) => {
  try {
    const db = getDb();
    const { shortCode } = req.params;
    const statsToken = req.query.statsToken as string | undefined;

    // Optionally parse JWT if Authorization header is present
    let userId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      if (payload) {
        userId = payload.userId;
      }
    }

    // Fetch URL
    const url = db.prepare(`
      SELECT id, user_id, stats_token
      FROM urls
      WHERE short_code = ?
    `).get(shortCode) as { id: string; user_id: string | null; stats_token: string } | undefined;

    if (!url) {
      res.status(404).json({ error: 'URL not found' });
      return;
    }

    // Check access control
    const isOwner = userId === url.user_id;
    const hasStatsToken = statsToken === url.stats_token;

    if (!isOwner && !hasStatsToken) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Fetch total click count
    const totalResult = db.prepare(`
      SELECT COUNT(*) as total
      FROM clicks
      WHERE url_id = ?
    `).get(url.id) as { total: number };

    // Fetch recent clicks (last 10)
    const recentClicks = db.prepare(`
      SELECT clicked_at, ip_address, user_agent
      FROM clicks
      WHERE url_id = ?
      ORDER BY clicked_at DESC
      LIMIT 10
    `).all(url.id);

    // Convert snake_case to camelCase for response
    const formattedRecentClicks = recentClicks.map((click: any) => ({
      clickedAt: click.clicked_at,
      ipAddress: click.ip_address,
      userAgent: click.user_agent
    }));

    res.json({
      shortCode,
      totalClicks: totalResult.total,
      recentClicks: formattedRecentClicks
    });
  } catch (error) {
    console.error('Error fetching URL stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export { router as analyticsRouter };
