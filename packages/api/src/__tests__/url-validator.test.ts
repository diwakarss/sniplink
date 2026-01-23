import { validateUrl, sanitizeUrl, isBlockedDomain } from '../utils/url-validator';

describe('validateUrl', () => {
  describe('valid URLs', () => {
    test('accepts https URL', () => {
      const result = validateUrl('https://example.com');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('accepts http URL', () => {
      const result = validateUrl('http://example.com');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('accepts URL with path and query string', () => {
      const result = validateUrl('https://example.com/path?query=value');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('accepts URL with port', () => {
      const result = validateUrl('https://example.com:8080/path');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('accepts localhost URL', () => {
      const result = validateUrl('http://localhost:3000');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('invalid URLs', () => {
    test('rejects empty string', () => {
      const result = validateUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    test('rejects whitespace only', () => {
      const result = validateUrl('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('rejects invalid URL format', () => {
      const result = validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    test('rejects ftp protocol', () => {
      const result = validateUrl('ftp://example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTP');
    });

    test('rejects javascript protocol (XSS)', () => {
      const result = validateUrl('javascript:alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTP');
    });

    test('rejects data protocol (XSS)', () => {
      const result = validateUrl('data:text/html,<script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTP');
    });
  });

  describe('blocked domains', () => {
    test('rejects bit.ly (URL shortener)', () => {
      const result = validateUrl('https://bit.ly/abc123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('security reasons');
    });

    test('rejects tinyurl.com (URL shortener)', () => {
      const result = validateUrl('https://tinyurl.com/abc123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('security reasons');
    });

    test('rejects goo.gl (URL shortener)', () => {
      const result = validateUrl('https://goo.gl/abc123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('security reasons');
    });

    test('rejects www.bit.ly (subdomain of blocked)', () => {
      const result = validateUrl('https://www.bit.ly/abc123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('security reasons');
    });

    test('allows example.com (not blocked)', () => {
      const result = validateUrl('https://example.com');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});

describe('isBlockedDomain', () => {
  describe('exact domain matches', () => {
    test('blocks exact match: bit.ly', () => {
      expect(isBlockedDomain('https://bit.ly/abc123')).toBe(true);
    });

    test('blocks exact match: tinyurl.com', () => {
      expect(isBlockedDomain('https://tinyurl.com/abc123')).toBe(true);
    });

    test('blocks exact match: t.co', () => {
      expect(isBlockedDomain('https://t.co/abc123')).toBe(true);
    });

    test('blocks exact match: goo.gl', () => {
      expect(isBlockedDomain('http://goo.gl/abc123')).toBe(true);
    });
  });

  describe('subdomain matching', () => {
    test('blocks subdomain: www.bit.ly', () => {
      expect(isBlockedDomain('https://www.bit.ly/abc123')).toBe(true);
    });

    test('blocks subdomain: api.bit.ly', () => {
      expect(isBlockedDomain('https://api.bit.ly/v4/shorten')).toBe(true);
    });

    test('blocks subdomain: subdomain.tinyurl.com', () => {
      expect(isBlockedDomain('https://subdomain.tinyurl.com/page')).toBe(true);
    });

    test('does NOT block partial match: notbit.ly', () => {
      expect(isBlockedDomain('https://notbit.ly/page')).toBe(false);
    });

    test('does NOT block partial match: bit.ly.example.com (different domain)', () => {
      expect(isBlockedDomain('https://bit.ly.example.com')).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    test('blocks uppercase: BIT.LY', () => {
      expect(isBlockedDomain('https://BIT.LY/abc123')).toBe(true);
    });

    test('blocks mixed case: Bit.Ly', () => {
      expect(isBlockedDomain('https://Bit.Ly/abc123')).toBe(true);
    });

    test('blocks uppercase subdomain: WWW.BIT.LY', () => {
      expect(isBlockedDomain('https://WWW.BIT.LY/abc123')).toBe(true);
    });

    test('blocks mixed case subdomain: Www.TinyUrl.Com', () => {
      expect(isBlockedDomain('https://Www.TinyUrl.Com/abc123')).toBe(true);
    });
  });

  describe('malformed URLs', () => {
    test('returns false for invalid URL (lets validateUrl handle it)', () => {
      expect(isBlockedDomain('not-a-url')).toBe(false);
    });

    test('returns false for empty string', () => {
      expect(isBlockedDomain('')).toBe(false);
    });

    test('returns false for malformed protocol', () => {
      expect(isBlockedDomain('javascript:alert(1)')).toBe(false);
    });
  });

  describe('allowed domains', () => {
    test('allows example.com', () => {
      expect(isBlockedDomain('https://example.com')).toBe(false);
    });

    test('allows google.com', () => {
      expect(isBlockedDomain('https://google.com/search')).toBe(false);
    });

    test('allows github.com', () => {
      expect(isBlockedDomain('https://github.com/user/repo')).toBe(false);
    });

    test('allows localhost', () => {
      expect(isBlockedDomain('http://localhost:3000')).toBe(false);
    });
  });
});

describe('sanitizeUrl', () => {
  test('returns unchanged URL with no dangerous characters', () => {
    const url = 'https://example.com';
    const result = sanitizeUrl(url);
    expect(result).toBe('https://example.com');
  });

  test('encodes < character', () => {
    const url = 'https://example.com/<script>';
    const result = sanitizeUrl(url);
    expect(result).toContain('&lt;');
    expect(result).not.toContain('<');
  });

  test('encodes > character', () => {
    const url = 'https://example.com/<script>';
    const result = sanitizeUrl(url);
    expect(result).toContain('&gt;');
    expect(result).not.toContain('>');
  });

  test('encodes double quote character', () => {
    const url = 'https://example.com/"test"';
    const result = sanitizeUrl(url);
    expect(result).toContain('&quot;');
    expect(result).not.toContain('"');
  });

  test('encodes single quote character', () => {
    const url = "https://example.com/'test'";
    const result = sanitizeUrl(url);
    expect(result).toContain('&#x27;');
    expect(result).not.toContain("'");
  });

  test('encodes ampersand character', () => {
    const url = 'https://example.com/test&param';
    const result = sanitizeUrl(url);
    expect(result).toContain('&amp;');
  });

  test('decodes and sanitizes encoded XSS attempt', () => {
    const url = 'https://example.com/%3Cscript%3E';
    const result = sanitizeUrl(url);
    // Should decode %3C to <, then encode to &lt;
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).not.toContain('<script>');
  });

  test('handles multiple dangerous characters', () => {
    const url = 'https://example.com/<script>alert("XSS")</script>';
    const result = sanitizeUrl(url);
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&quot;');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('"');
  });
});
