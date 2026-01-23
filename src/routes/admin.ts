/**
 * Admin Routes
 *
 * Protected routes for admin functionality including system statistics
 */

import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/admin';
import { getDb } from '../db';

const router = Router();

// Apply admin middleware to all routes in this router
router.use(requireAdmin);

/**
 * System Statistics Endpoint
 *
 * GET /api/admin/stats
 *
 * Returns system-wide statistics for admin dashboard:
 * - totalUrls: Total number of shortened URLs
 * - totalClicks: Total number of click events
 * - activeUsers: Number of non-banned users
 * - totalUsers: Total number of registered users
 *
 * Access: Admin users only
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const db = getDb();

    // Efficient single query with subqueries for all stats
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM urls) as totalUrls,
        (SELECT COUNT(*) FROM clicks) as totalClicks,
        (SELECT COUNT(*) FROM users WHERE is_banned = 0) as activeUsers,
        (SELECT COUNT(*) FROM users) as totalUsers
    `).get() as {
      totalUrls: number;
      totalClicks: number;
      activeUsers: number;
      totalUsers: number;
    };

    res.json({
      totalUrls: stats.totalUrls,
      totalClicks: stats.totalClicks,
      activeUsers: stats.activeUsers,
      totalUsers: stats.totalUsers
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to retrieve system statistics' });
  }
});

/**
 * Disable URL Endpoint
 *
 * PATCH /api/admin/urls/:id/disable
 *
 * Disables a URL so that redirects stop working.
 * Disabled URLs return 410 Gone on redirect attempt.
 *
 * Access: Admin users only
 */
router.patch('/urls/:id/disable', (req: Request, res: Response) => {
  try {
    const urlId = req.params.id;
    const db = getDb();

    // Check if URL exists and get current status
    const url = db.prepare(`
      SELECT id, is_disabled FROM urls WHERE id = ?
    `).get(urlId) as { id: string; is_disabled: number } | undefined;

    if (!url) {
      res.status(404).json({ error: 'URL not found' });
      return;
    }

    if (url.is_disabled === 1) {
      res.status(400).json({ error: 'URL is already disabled' });
      return;
    }

    // Disable the URL
    db.prepare(`
      UPDATE urls SET is_disabled = 1 WHERE id = ?
    `).run(urlId);

    res.json({ message: 'URL disabled successfully', urlId });
  } catch (error) {
    console.error('Error disabling URL:', error);
    res.status(500).json({ error: 'Failed to disable URL' });
  }
});

export { router as adminRouter };
