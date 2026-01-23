/**
 * URL Validation and Sanitization
 *
 * Provides secure URL validation and XSS sanitization for URL shortening service.
 * Security features:
 * - Protocol whitelist (HTTP/HTTPS only)
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

  return { valid: true };
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
  const dangerous = {
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '&': '&amp;'
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
