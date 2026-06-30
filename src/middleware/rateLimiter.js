// ============================================================================
// src/middleware/rateLimiter.js — Token Bucket Rate Limiter
// ============================================================================
// Implements per-IP and per-user rate limiting using the Token Bucket algorithm.
//
// Token Bucket works by:
// - Each client gets a "bucket" with N tokens (maxRequests)
// - Each request consumes one token
// - Tokens refill at a fixed rate (windowMs)
// - When the bucket is empty, requests are rejected with 429
//
// This is more flexible than fixed-window rate limiting because it allows
// short bursts while maintaining an average rate limit.
// ============================================================================

const config = require('../config');
const logger = require('../infrastructure/logger');

class TokenBucket {
  constructor(maxTokens, refillIntervalMs) {
    this._maxTokens = maxTokens;
    this._refillIntervalMs = refillIntervalMs;
    this._buckets = new Map(); // key -> { tokens, lastRefill }
  }

  /**
   * Consume one token for the given key.
   * @param {string} key — IP address or user ID
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  consume(key) {
    const now = Date.now();
    let bucket = this._buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this._maxTokens, lastRefill: now };
      this._buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const intervalsElapsed = Math.floor(elapsed / this._refillIntervalMs);
    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * this._maxTokens;
      bucket.tokens = Math.min(this._maxTokens, bucket.tokens + tokensToAdd);
      // Advance lastRefill by exactly the consumed intervals to preserve sub-interval time
      bucket.lastRefill += intervalsElapsed * this._refillIntervalMs;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return { allowed: true, remaining: bucket.tokens, retryAfterMs: 0 };
    }

    const retryAfterMs = this._refillIntervalMs - (now - bucket.lastRefill);
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  /**
   * Get current metrics.
   */
  getMetrics() {
    return {
      trackedClients: this._buckets.size,
      maxTokens: this._maxTokens,
      refillIntervalMs: this._refillIntervalMs,
    };
  }

  /**
   * Periodic cleanup of expired buckets (call from an interval).
   */
  cleanup() {
    const now = Date.now();
    const staleThreshold = this._refillIntervalMs * 5;
    let cleaned = 0;

    for (const [key, bucket] of this._buckets) {
      if (now - bucket.lastRefill > staleThreshold) {
        this._buckets.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Rate limiter cleanup: removed ${cleaned} stale buckets`);
    }
  }
}

// Singleton rate limiter instance
const rateLimiterInstance = new TokenBucket(
  config.rateLimit.maxRequests,
  config.rateLimit.windowMs
);

// Cleanup stale buckets every 5 minutes
setInterval(() => rateLimiterInstance.cleanup(), 5 * 60 * 1000).unref();

/**
 * Rate limiting middleware factory.
 * @param {{ maxRequests?: number, windowMs?: number, keyFn?: Function }} options
 */
function rateLimiter(options = {}) {
  const limiter = options.maxRequests || options.windowMs
    ? new TokenBucket(
        options.maxRequests || config.rateLimit.maxRequests,
        options.windowMs || config.rateLimit.windowMs
      )
    : rateLimiterInstance;

  const keyFn = options.keyFn || ((req) => {
    // Prefer user ID over IP for authenticated requests
    return req.user?.userId || req.ip || req.socket?.remoteAddress;
  });

  return (req, res, next) => {
    const key = keyFn(req);
    const result = limiter.consume(key);

    // Set standard rate limit headers
    res.set('X-RateLimit-Limit', limiter._maxTokens.toString());
    res.set('X-RateLimit-Remaining', result.remaining.toString());

    if (!result.allowed) {
      res.set('Retry-After', Math.ceil(result.retryAfterMs / 1000).toString());

      logger.warn('Rate limit exceeded', { key, retryAfterMs: result.retryAfterMs });

      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfterMs: result.retryAfterMs,
        },
      });
    }

    next();
  };
}

module.exports = { rateLimiter, TokenBucket, rateLimiterInstance };
