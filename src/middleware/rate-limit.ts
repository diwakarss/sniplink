/**
 * Rate Limiting Middleware
 *
 * Provides configurable rate limiting for API endpoints with support for
 * IP-based and user-based rate limits.
 *
 * Features:
 * - Configurable time windows and request limits
 * - Custom key extraction (IP, user ID, etc.)
 * - Retry-After header in responses
 * - Automatic cleanup of expired entries
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Rate limit storage entry
 */
interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp in milliseconds
}

/**
 * Rate limiter configuration
 */
interface RateLimiterConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyExtractor: (req: Request) => string | null; // Function to extract rate limit key
}

/**
 * Create a rate limiter middleware with specified configuration
 *
 * @param config - Rate limiter configuration
 * @returns Express middleware function with reset method
 */
export function createRateLimiter(config: RateLimiterConfig) {
  // In-memory storage: Map<key, RateLimitEntry>
  // Same pattern as failedAttempts in auth.ts
  const storage = new Map<string, RateLimitEntry>();

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    // Extract rate limit key (IP, user ID, etc.)
    const key = config.keyExtractor(req);

    // If no key can be extracted, allow request
    if (!key) {
      next();
      return;
    }

    const now = Date.now();
    const entry = storage.get(key);

    // Clean up expired entry if exists
    if (entry && now >= entry.resetAt) {
      storage.delete(key);
    }

    // Get or create entry
    let current = storage.get(key);

    if (!current) {
      // First request in window
      current = {
        count: 1,
        resetAt: now + config.windowMs
      };
      storage.set(key, current);
      next();
      return;
    }

    // Increment request count
    current.count++;

    // Check if limit exceeded
    if (current.count > config.maxRequests) {
      // Calculate seconds until retry
      const retryAfterMs = current.resetAt - now;
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      // Return 429 with Retry-After header
      res.status(429)
        .header('Retry-After', retryAfterSeconds.toString())
        .json({
          error: 'Too many requests',
          retryAfter: retryAfterSeconds
        });
      return;
    }

    // Within limit, continue
    next();
  };

  // Attach reset method for test isolation
  // @ts-ignore - Add reset method to middleware function
  middleware.reset = () => storage.clear();

  return middleware;
}

/**
 * IP-based rate limiter for anonymous requests
 *
 * Limits: 10 requests per 60 seconds (1 minute)
 * Key: Client IP address (handles proxies via X-Forwarded-For)
 */
export const ipRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10,
  keyExtractor: (req: Request) => {
    // Extract IP with proxy support (same pattern as click tracking)
    // X-Forwarded-For takes priority for proxied requests
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = (typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]
      : forwardedFor?.[0]) || req.ip || null;

    return ip ? `ip:${ip}` : null;
  }
});

/**
 * User-based rate limiter for authenticated requests
 *
 * Limits: 50 requests per 3600 seconds (1 hour)
 * Key: User ID from JWT (req.user.userId)
 */
export const userRateLimiter = createRateLimiter({
  windowMs: 3600000, // 1 hour
  maxRequests: 50,
  keyExtractor: (req: Request) => {
    // Extract user ID from JWT payload (set by optionalAuth middleware)
    const userId = req.user?.userId;
    return userId ? `user:${userId}` : null;
  }
});

/**
 * Reset all rate limiters (for testing)
 *
 * Clears all rate limit counters for both IP and user rate limiters.
 * This is useful for test isolation to prevent test interference.
 */
export function resetRateLimiters(): void {
  // @ts-ignore - Access reset method added to middleware
  if (ipRateLimiter.reset) ipRateLimiter.reset();
  // @ts-ignore - Access reset method added to middleware
  if (userRateLimiter.reset) userRateLimiter.reset();
}
