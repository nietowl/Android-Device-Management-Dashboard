/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-based rate limiting
 */

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitStore>();

// Maximum number of rate limit records to keep in memory
const MAX_STORE_SIZE = 10000;
// Counter for deterministic cleanup
let requestCount = 0;
const CLEANUP_INTERVAL = 100; // Clean up every 100 requests

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

/**
 * Default rate limits
 */
export const RATE_LIMITS = {
  // Stricter limits for proxy routes (security-sensitive)
  PROXY: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
  },
  // Standard API routes
  API: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  },
  // Authentication routes (stricter)
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
  },
  // Admin routes (very strict)
  ADMIN: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 requests per minute
  },
} as const;

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (IP address, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns true if rate limited, false otherwise
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const key = `${identifier}:${config.windowMs}`;
  
  const record = store.get(key);
  
  // Clean up expired records deterministically
  requestCount++;
  if (requestCount >= CLEANUP_INTERVAL) {
    requestCount = 0;
    cleanupExpiredRecords();
  }
  
  // Prevent unbounded memory growth
  if (store.size > MAX_STORE_SIZE) {
    cleanupExpiredRecords();
    // If still too large, remove oldest entries
    if (store.size > MAX_STORE_SIZE) {
      const entries = Array.from(store.entries());
      entries.sort((a, b) => a[1].resetTime - b[1].resetTime);
      const toRemove = store.size - MAX_STORE_SIZE;
      for (let i = 0; i < toRemove; i++) {
        store.delete(entries[i][0]);
      }
    }
  }
  
  if (!record || now > record.resetTime) {
    // Create new record or reset expired one
    const newRecord: RateLimitStore = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    store.set(key, newRecord);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: newRecord.resetTime,
    };
  }
  
  // Increment count
  record.count++;
  store.set(key, record);
  
  if (record.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    };
  }
  
  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

/**
 * Clean up expired rate limit records
 */
function cleanupExpiredRecords() {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (now > record.resetTime) {
      store.delete(key);
    }
  }
}

/**
 * Validate and sanitize IP address
 * Prevents header injection attacks
 */
function sanitizeIpAddress(ip: string | null): string {
  if (!ip) return 'unknown';
  
  // Remove whitespace and take first IP if comma-separated
  const cleaned = ip.trim().split(',')[0].trim();
  
  // Validate IP format (IPv4 or IPv6)
  // IPv4: 1.2.3.4 or IPv6: 2001:0db8::1
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  
  // Additional check: ensure no path traversal or injection attempts
  if (cleaned.includes('/') || cleaned.includes('\\') || cleaned.includes('..')) {
    return 'invalid';
  }
  
  if (ipv4Regex.test(cleaned) || ipv6Regex.test(cleaned)) {
    return cleaned;
  }
  
  return 'invalid';
}

/**
 * Get client identifier from request
 * Uses IP address or user ID if available
 * Sanitizes input to prevent header injection attacks
 */
export function getClientIdentifier(request: Request, userId?: string): string {
  // Prefer user ID if available (more accurate for authenticated users)
  if (userId) {
    // Validate userId to prevent injection
    if (typeof userId === 'string' && userId.length > 0 && userId.length < 200) {
      // Remove any potentially dangerous characters
      const sanitized = userId.replace(/[^a-zA-Z0-9_-]/g, '');
      if (sanitized.length > 0) {
        return `user:${sanitized}`;
      }
    }
  }
  
  // Fall back to IP address with validation
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = sanitizeIpAddress(forwarded) !== 'unknown' 
    ? sanitizeIpAddress(forwarded) 
    : sanitizeIpAddress(realIp);
  
  return `ip:${ip}`;
}

