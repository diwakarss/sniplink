/**
 * URL Validation and Sanitization
 *
 * Provides secure URL validation and XSS sanitization for URL shortening service.
 * Security features:
 * - Protocol whitelist (HTTP/HTTPS only)
 * - Domain blocklist (URL shorteners, phishing domains)
 * - XSS character encoding
 * - Malformed URL detection
 */

/**
 * Validation result with error details
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Blocked domains list
 *
 * Prevents shortening of:
 * - Other URL shortening services (to avoid redirect chains)
 * - Known phishing domains
 * - Malicious sites
 *
 * Note: Matches subdomains (e.g., "bit.ly" blocks "www.bit.ly")
 */
const BLOCKED_DOMAINS = [
  // URL shortening services
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  't.co',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'short.io',
  'rebrand.ly',
  // Add known phishing domains here
  // (In production, this would be a dynamic list from threat intelligence feeds)
];

/**
 * Validate URL format and security
 *
 * Checks:
 * - Non-empty URL
 * - Valid URL format
 * - HTTP/HTTPS protocol only (prevents javascript:, data:, ftp:, etc.)
 *
 * @param url - URL string to validate
 * @returns Validation result with error message if invalid
 */
export function validateUrl(url: string): ValidationResult {
  // Check for empty URL
  if (!url || url.trim() === '') {
    return {
      valid: false,
      error: 'URL is required'
    };
  }

  // Parse URL to validate format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format'
    };
  }

  // Protocol whitelist - only allow HTTP and HTTPS
  const allowedProtocols = ['http:', 'https:'];
  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    return {
      valid: false,
      error: 'Only HTTP and HTTPS URLs are allowed'
    };
  }

  // Check domain blocklist
  if (isBlockedDomain(url)) {
    return {
      valid: false,
      error: 'This domain is not allowed for security reasons'
    };
  }

  return { valid: true };
}

/**
 * Check if a URL's domain is on the blocklist
 *
 * Matches both exact domains and subdomains.
 * Examples:
 * - "bit.ly" blocks "bit.ly", "www.bit.ly", "api.bit.ly"
 * - Does NOT block "notbit.ly" (different domain)
 *
 * @param url - URL string to check
 * @returns True if domain is blocked, false otherwise
 */
export function isBlockedDomain(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // Check if hostname matches or is a subdomain of blocked domain
    for (const blockedDomain of BLOCKED_DOMAINS) {
      const normalized = blockedDomain.toLowerCase();

      // Exact match
      if (hostname === normalized) {
        return true;
      }

      // Subdomain match (e.g., "www.bit.ly" matches "bit.ly")
      if (hostname.endsWith('.' + normalized)) {
        return true;
      }
    }

    return false;
  } catch {
    // If URL is malformed, let validateUrl handle it
    return false;
  }
}

/**
 * Sanitize URL to prevent XSS attacks
 *
 * Process:
 * 1. Decode URL to catch encoded XSS (e.g., %3Cscript%3E)
 * 2. Remove/encode dangerous characters: <, >, ", ', &
 * 3. Re-encode to ensure valid URL format
 *
 * @param url - URL string to sanitize
 * @returns Sanitized URL string
 */
export function sanitizeUrl(url: string): string {
  // Decode URL to catch encoded XSS payloads
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // If decoding fails, use original
    decoded = url;
  }

  // Replace dangerous characters
  // IMPORTANT: & must be replaced first to avoid double-encoding
  const dangerous = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;'
  };

  let sanitized = decoded;
  for (const [char, encoded] of Object.entries(dangerous)) {
    sanitized = sanitized.split(char).join(encoded);
  }

  // Re-encode to ensure valid URL format
  try {
    return encodeURI(sanitized);
  } catch {
    // If encoding fails, return sanitized version
    return sanitized;
  }
}
