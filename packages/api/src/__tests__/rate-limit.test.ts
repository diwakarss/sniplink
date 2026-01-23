import { Request, Response, NextFunction } from 'express';
import { createRateLimiter, ipRateLimiter, userRateLimiter } from '../middleware/rate-limit';

describe('createRateLimiter', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let headerMock: jest.Mock;

  beforeEach(() => {
    // Setup mock response with method chaining
    jsonMock = jest.fn();
    headerMock = jest.fn();
    statusMock = jest.fn();

    // Setup proper method chaining: status().header().json()
    const chainMock = {
      header: headerMock,
      json: jsonMock
    };
    headerMock.mockReturnValue(chainMock);
    statusMock.mockReturnValue(chainMock);

    mockRes = {
      status: statusMock,
      header: headerMock
    } as Partial<Response>;

    mockNext = jest.fn() as jest.MockedFunction<NextFunction>;

    // Use fake timers for time-based tests
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('factory function', () => {
    test('creates middleware function with custom configuration', () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 10,
        keyExtractor: (req) => req.ip || null
      });

      expect(typeof limiter).toBe('function');
      expect(limiter.length).toBe(3); // Express middleware signature (req, res, next)
    });

    test('allows request when keyExtractor returns null', () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 10,
        keyExtractor: () => null // No key can be extracted
      });

      mockReq = { ip: '1.2.3.4' };

      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('request counting', () => {
    test('allows first request and initializes counter', () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 10,
        keyExtractor: (req) => req.ip || null
      });

      mockReq = { ip: '1.2.3.4' };

      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    test('allows requests up to limit', () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 3,
        keyExtractor: (req) => req.ip || null
      });

      mockReq = { ip: '1.2.3.4' };

      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        limiter(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(3);
      expect(statusMock).not.toHaveBeenCalled();
    });

    test('blocks request exceeding limit', () => {
      const limiter = createRateLimiter({
        windowMs: 60000, // 1 minute window
        maxRequests: 3,
        keyExtractor: (req) => req.ip || null
      });

      mockReq = { ip: '1.2.3.4' };

      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        limiter(mockReq as Request, mockRes as Response, mockNext);
      }

      // Reset mocks
      mockNext.mockClear();
      statusMock.mockClear();

      // 4th request should be blocked
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(429);
    });

    test('returns correct retryAfter in seconds', () => {
      const limiter = createRateLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 1,
        keyExtractor: (req) => req.ip || null
      });

      mockReq = { ip: '1.2.3.4' };

      // First request (allowed)
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Reset mocks
      mockNext.mockClear();
      statusMock.mockClear();

      // Second request (blocked)
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Should return Retry-After header and retryAfter in body
      expect(headerMock).toHaveBeenCalledWith('Retry-After', '60');
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Too many requests',
        retryAfter: 60
      });
    });

    test('calculates retryAfter correctly after time passes', () => {
      const limiter = createRateLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 1,
        keyExtractor: (req) => req.ip || null
      });

      mockReq = { ip: '1.2.3.4' };

      // First request
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Advance time by 30 seconds
      jest.advanceTimersByTime(30000);

      // Reset mocks
      mockNext.mockClear();
      statusMock.mockClear();

      // Second request (blocked, but only 30s left in window)
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Should return 30 seconds (60 - 30)
      expect(headerMock).toHaveBeenCalledWith('Retry-After', '30');
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Too many requests',
        retryAfter: 30
      });
    });

    test('tracks separate counters for different keys', () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
        keyExtractor: (req) => req.ip || null
      });

      // Request from IP 1
      mockReq = { ip: '1.2.3.4' };
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Request from IP 2
      mockReq = { ip: '5.6.7.8' };
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);

      // Both IPs got their first request through
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('counter reset logic', () => {
    test('resets counter after window expires', () => {
      const limiter = createRateLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 2,
        keyExtractor: (req) => req.ip || null
      });

      mockReq = { ip: '1.2.3.4' };

      // Make 2 requests (at limit)
      limiter(mockReq as Request, mockRes as Response, mockNext);
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);

      // 3rd request should be blocked
      mockNext.mockClear();
      statusMock.mockClear();
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(statusMock).toHaveBeenCalledWith(429);

      // Advance time past window (61 seconds)
      jest.advanceTimersByTime(61000);

      // Reset mocks
      mockNext.mockClear();
      statusMock.mockClear();

      // Next request should be allowed (counter reset)
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    test('cleans up expired entries before checking limit', () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
        keyExtractor: (req) => req.ip || null
      });

      mockReq = { ip: '1.2.3.4' };

      // First request
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Advance time past window
      jest.advanceTimersByTime(61000);

      // Reset mocks
      mockNext.mockClear();

      // Second request (should be treated as first request in new window)
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });
});

describe('ipRateLimiter', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    const headerMock = jest.fn();
    statusMock = jest.fn();

    // Setup proper method chaining
    const chainMock = {
      header: headerMock,
      json: jsonMock
    };
    headerMock.mockReturnValue(chainMock);
    statusMock.mockReturnValue(chainMock);

    mockRes = {
      status: statusMock,
      header: headerMock
    } as Partial<Response>;

    mockNext = jest.fn() as jest.MockedFunction<NextFunction>;
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Advance time to clear rate limit state for next test
    jest.advanceTimersByTime(61000);
    jest.useRealTimers();
  });

  test('limits IP to 10 requests per minute', () => {
    mockReq = { ip: '1.2.3.4', headers: {} };

    // Make 10 requests (at limit)
    for (let i = 0; i < 10; i++) {
      ipRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    }

    expect(mockNext).toHaveBeenCalledTimes(10);
    expect(statusMock).not.toHaveBeenCalled();

    // 11th request should be blocked
    mockNext.mockClear();
    statusMock.mockClear();
    ipRateLimiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(429);
  });

  test('extracts IP from X-Forwarded-For header', () => {
    // Setup request with X-Forwarded-For header as array (Express parses it)
    // Use different IP than other tests to avoid cross-test contamination
    mockReq = {
      ip: '127.0.0.1',
      headers: {
        'x-forwarded-for': ['9.8.7.6', '5.6.7.8'] // Array format, different IP
      }
    };

    // Should use first IP from X-Forwarded-For
    for (let i = 0; i < 10; i++) {
      ipRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    }

    expect(mockNext).toHaveBeenCalledTimes(10);

    // 11th request from same proxied IP should be blocked
    mockNext.mockClear();
    statusMock.mockClear();
    ipRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    expect(statusMock).toHaveBeenCalledWith(429);
  });

  test('returns correct retryAfter for 1-minute window', () => {
    mockReq = { ip: '1.2.3.4', headers: {} };

    // Make 10 requests (at limit)
    for (let i = 0; i < 10; i++) {
      ipRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    }

    // 11th request blocked
    mockNext.mockClear();
    ipRateLimiter(mockReq as Request, mockRes as Response, mockNext);

    expect(jsonMock).toHaveBeenCalledWith({
      error: 'Too many requests',
      retryAfter: 60 // 60 seconds = 1 minute
    });
  });

  test('allows new requests after 1-minute window expires', () => {
    mockReq = { ip: '1.2.3.4', headers: {} };

    // Make 10 requests
    for (let i = 0; i < 10; i++) {
      ipRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    }

    // Advance time past 1-minute window
    jest.advanceTimersByTime(61000);

    // Reset mocks
    mockNext.mockClear();
    statusMock.mockClear();

    // Next request should be allowed
    ipRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });
});

describe('userRateLimiter', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    const headerMock = jest.fn();
    statusMock = jest.fn();

    // Setup proper method chaining
    const chainMock = {
      header: headerMock,
      json: jsonMock
    };
    headerMock.mockReturnValue(chainMock);
    statusMock.mockReturnValue(chainMock);

    mockRes = {
      status: statusMock,
      header: headerMock
    } as Partial<Response>;

    mockNext = jest.fn() as jest.MockedFunction<NextFunction>;
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Advance time to clear rate limit state for next test
    jest.advanceTimersByTime(3601000);
    jest.useRealTimers();
  });

  test('limits authenticated user to 50 requests per hour', () => {
    mockReq = {
      user: { userId: 'user-123', email: 'test@example.com' }
    };

    // Make 50 requests (at limit)
    for (let i = 0; i < 50; i++) {
      userRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    }

    expect(mockNext).toHaveBeenCalledTimes(50);
    expect(statusMock).not.toHaveBeenCalled();

    // 51st request should be blocked
    mockNext.mockClear();
    statusMock.mockClear();
    userRateLimiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(429);
  });

  test('skips anonymous requests (no req.user)', () => {
    mockReq = {}; // No user property

    // Anonymous request should always pass through
    userRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  test('skips requests with invalid user object', () => {
    mockReq = {
      user: {} as any // User object exists but no userId
    };

    userRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  test('tracks separate counters for different users', () => {
    // User 1 makes request
    mockReq = {
      user: { userId: 'user-1', email: 'user1@example.com' }
    };
    userRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // User 2 makes request
    mockReq = {
      user: { userId: 'user-2', email: 'user2@example.com' }
    };
    userRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(2);

    // Both users have independent counters
    expect(statusMock).not.toHaveBeenCalled();
  });

  test('returns correct retryAfter for 1-hour window', () => {
    mockReq = {
      user: { userId: 'user-123', email: 'test@example.com' }
    };

    // Make 50 requests (at limit)
    for (let i = 0; i < 50; i++) {
      userRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    }

    // 51st request blocked
    mockNext.mockClear();
    userRateLimiter(mockReq as Request, mockRes as Response, mockNext);

    expect(jsonMock).toHaveBeenCalledWith({
      error: 'Too many requests',
      retryAfter: 3600 // 3600 seconds = 1 hour
    });
  });

  test('allows new requests after 1-hour window expires', () => {
    mockReq = {
      user: { userId: 'user-123', email: 'test@example.com' }
    };

    // Make 50 requests
    for (let i = 0; i < 50; i++) {
      userRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    }

    // Advance time past 1-hour window
    jest.advanceTimersByTime(3601000); // 1 hour + 1 second

    // Reset mocks
    mockNext.mockClear();
    statusMock.mockClear();

    // Next request should be allowed
    userRateLimiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });
});
