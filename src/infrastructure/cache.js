// ============================================================================
// src/infrastructure/cache.js — LRU Cache with TTL
// ============================================================================
// Implements a Least Recently Used (LRU) cache with Time-To-Live (TTL)
// expiration. Provides hit/miss metrics for observability.
//
// Design decisions:
// - Uses a Map for O(1) insertion order tracking (Map preserves insertion order)
// - TTL is per-entry, checked lazily on access
// - Singleton pattern ensures one shared cache instance
// ============================================================================

const logger = require('./logger');

class LRUCache {
  constructor(maxSize = 1000, defaultTTL = 300) {
    this._maxSize = maxSize;
    this._defaultTTL = defaultTTL; // seconds
    this._store = new Map();
    this._metrics = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get a value from the cache.
   * @param {string} key
   * @returns {*} The cached value or undefined
   */
  get(key) {
    const entry = this._store.get(key);

    if (!entry) {
      this._metrics.misses++;
      return undefined;
    }

    // Check TTL expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      this._metrics.misses++;
      return undefined;
    }

    // Move to end (most recently used) — delete and re-insert
    this._store.delete(key);
    this._store.set(key, entry);
    this._metrics.hits++;

    return entry.value;
  }

  /**
   * Set a value in the cache.
   * @param {string} key
   * @param {*} value
   * @param {number} [ttl] TTL in seconds. Defaults to cache default.
   */
  set(key, value, ttl) {
    // If key exists, delete to reset position
    if (this._store.has(key)) {
      this._store.delete(key);
    }

    // Evict LRU entries if at capacity
    while (this._store.size >= this._maxSize) {
      const oldestKey = this._store.keys().next().value;
      this._store.delete(oldestKey);
      this._metrics.evictions++;
    }

    const effectiveTTL = ttl !== undefined ? ttl : this._defaultTTL;
    this._store.set(key, {
      value,
      expiresAt: effectiveTTL > 0 ? Date.now() + effectiveTTL * 1000 : null,
      createdAt: Date.now(),
    });
  }

  /**
   * Delete a key from the cache.
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    return this._store.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix.
   * @param {string} prefix
   */
  invalidatePrefix(prefix) {
    let count = 0;
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.debug(`Cache: invalidated ${count} keys with prefix "${prefix}"`);
    }
  }

  /**
   * Check if a key exists (without promoting it).
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    const entry = this._store.get(key);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Clear all entries.
   */
  clear() {
    this._store.clear();
    logger.debug('Cache cleared');
  }

  /**
   * Get cache metrics for observability.
   */
  getMetrics() {
    const total = this._metrics.hits + this._metrics.misses;
    return {
      size: this._store.size,
      maxSize: this._maxSize,
      hits: this._metrics.hits,
      misses: this._metrics.misses,
      hitRate: total > 0 ? (this._metrics.hits / total * 100).toFixed(2) + '%' : '0%',
      evictions: this._metrics.evictions,
    };
  }
}

// Singleton instance
const cache = new LRUCache(
  parseInt(process.env.CACHE_MAX_SIZE, 10) || 1000,
  parseInt(process.env.CACHE_DEFAULT_TTL, 10) || 300
);

module.exports = { LRUCache, cache };
