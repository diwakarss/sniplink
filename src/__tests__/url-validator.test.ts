import { validateUrl, sanitizeUrl } from '../utils/url-validator';

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
