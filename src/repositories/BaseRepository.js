// ============================================================================
// src/repositories/BaseRepository.js — Abstract Base Repository
// ============================================================================
// Provides common CRUD operations, pagination, and caching integration.
// All entity-specific repositories extend this class.
//
// Pattern: Repository Pattern — abstracts data access behind a clean API
// so services never deal with raw SQL or database-specific code.
// ============================================================================

const { cache } = require('../infrastructure/cache');
const logger = require('../infrastructure/logger');

// Regex to validate column names: only alphanumeric + underscores allowed
const SAFE_COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

class BaseRepository {
  /**
   * @param {import('better-sqlite3').Database} db
   * @param {string} tableName
   * @param {string} cachePrefix — used for cache key namespacing
   */
  constructor(db, tableName, cachePrefix) {
    this._db = db;
    this._tableName = tableName;
    this._cachePrefix = cachePrefix;
  }

  /**
   * Validate that all column names are safe for SQL interpolation.
   * Prevents SQL injection via dynamically-constructed queries.
   * @param {string[]} columns
   * @throws {Error} If any column name contains unsafe characters
   */
  _validateColumns(columns) {
    for (const col of columns) {
      if (!SAFE_COLUMN_RE.test(col)) {
        throw new Error(`Invalid column name: "${col}". Column names must be alphanumeric with underscores only.`);
      }
    }
  }

  /**
   * Find a record by primary key.
   * @param {string} id
   * @returns {Object|null}
   */
  findById(id) {
    const cacheKey = `${this._cachePrefix}:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const row = this._db.prepare(`SELECT * FROM ${this._tableName} WHERE id = ?`).get(id);
    if (row) {
      cache.set(cacheKey, row);
    }
    return row || null;
  }

  /**
   * Find all records matching conditions.
   * @param {Object} conditions — key-value pairs for WHERE clause
   * @param {Object} [options]
   * @param {number} [options.limit]
   * @param {number} [options.offset]
   * @param {string} [options.orderBy]
   * @param {string} [options.order] — 'ASC' or 'DESC'
   * @returns {Array}
   */
  findAll(conditions = {}, options = {}) {
    const { limit = 50, offset = 0, orderBy = 'created_at', order = 'DESC' } = options;
    
    const keys = Object.keys(conditions);
    this._validateColumns([...keys, orderBy]);

    // Validate sort direction
    const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const whereClause = keys.length > 0
      ? `WHERE ${keys.map(k => `${k} = ?`).join(' AND ')}`
      : '';
    const values = Object.values(conditions);

    const sql = `
      SELECT * FROM ${this._tableName} 
      ${whereClause}
      ORDER BY ${orderBy} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    return this._db.prepare(sql).all(...values, limit, offset);
  }

  /**
   * Insert a new record.
   * @param {Object} data — column-value pairs
   * @returns {Object} The inserted row
   */
  create(data) {
    const keys = Object.keys(data);
    this._validateColumns(keys);

    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this._tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
    
    this._db.prepare(sql).run(...Object.values(data));
    
    // Invalidate list caches
    cache.invalidatePrefix(`${this._cachePrefix}:list`);
    
    // Note: We intentionally do NOT cache `data` here because the DB may
    // generate default values (e.g. datetime('now')) that differ from what
    // was passed in. The next findById() will read the authoritative row.

    return data;
  }

  /**
   * Update a record by ID.
   * @param {string} id
   * @param {Object} updates — column-value pairs to update
   * @returns {Object|null} Updated row
   */
  update(id, updates) {
    if (Object.keys(updates).length === 0) return this.findById(id);

    // Always update the updated_at timestamp
    if (!updates.updated_at) {
      updates.updated_at = new Date().toISOString();
    }

    const keys = Object.keys(updates);
    this._validateColumns(keys);

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const sql = `UPDATE ${this._tableName} SET ${setClause} WHERE id = ?`;

    this._db.prepare(sql).run(...Object.values(updates), id);

    // Invalidate cache before re-fetching to ensure we get the fresh row
    cache.delete(`${this._cachePrefix}:${id}`);
    cache.invalidatePrefix(`${this._cachePrefix}:list`);

    return this.findById(id);
  }

  /**
   * Delete a record by ID.
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const result = this._db.prepare(`DELETE FROM ${this._tableName} WHERE id = ?`).run(id);
    cache.delete(`${this._cachePrefix}:${id}`);
    cache.invalidatePrefix(`${this._cachePrefix}:list`);
    return result.changes > 0;
  }

  /**
   * Count records matching conditions.
   * @param {Object} conditions
   * @returns {number}
   */
  count(conditions = {}) {
    const keys = Object.keys(conditions);
    if (keys.length > 0) {
      this._validateColumns(keys);
    }

    const whereClause = keys.length > 0
      ? `WHERE ${keys.map(k => `${k} = ?`).join(' AND ')}`
      : '';
    const values = Object.values(conditions);

    const row = this._db.prepare(
      `SELECT COUNT(*) as count FROM ${this._tableName} ${whereClause}`
    ).get(...values);

    return row.count;
  }

  /**
   * Run a raw SQL query.
   * @param {string} sql
   * @param  {...any} params
   * @returns {Array}
   */
  query(sql, ...params) {
    return this._db.prepare(sql).all(...params);
  }

  /**
   * Run a raw SQL statement (INSERT/UPDATE/DELETE).
   * @param {string} sql
   * @param  {...any} params
   * @returns {Object} Run result
   */
  run(sql, ...params) {
    return this._db.prepare(sql).run(...params);
  }

  /**
   * Execute multiple operations in a transaction.
   * @param {Function} fn — receives the db instance
   * @returns {*} Return value of fn
   */
  transaction(fn) {
    const trx = this._db.transaction(fn);
    return trx();
  }
}

module.exports = BaseRepository;
