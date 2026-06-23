// ============================================================================
// src/repositories/UserRepository.js
// ============================================================================

const BaseRepository = require('./BaseRepository');
const User = require('../models/User');
const { cache } = require('../infrastructure/cache');

class UserRepository extends BaseRepository {
  constructor(db) {
    super(db, 'users', 'user');
  }

  /**
   * Find user by username.
   */
  findByUsername(username) {
    const cacheKey = `user:username:${username}`;
    const cached = cache.get(cacheKey);
    if (cached) return User.fromRow(cached);

    const row = this._db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (row) cache.set(cacheKey, row);
    return User.fromRow(row);
  }

  /**
   * Find user by email.
   */
  findByEmail(email) {
    const cacheKey = `user:email:${email}`;
    const cached = cache.get(cacheKey);
    if (cached) return User.fromRow(cached);

    const row = this._db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (row) cache.set(cacheKey, row);
    return User.fromRow(row);
  }

  /**
   * Find user by ID and return as User model.
   */
  findById(id) {
    const row = super.findById(id);
    return User.fromRow(row);
  }

  /**
   * Search users by username or display name.
   * @param {string} query
   * @param {string} [excludeUserId] — exclude the requesting user
   * @param {number} [limit=20]
   */
  search(query, excludeUserId, limit = 20) {
    const sql = `
      SELECT * FROM users 
      WHERE (username LIKE ? OR display_name LIKE ?)
      ${excludeUserId ? 'AND id != ?' : ''}
      LIMIT ?
    `;
    const searchTerm = `%${query}%`;
    const params = excludeUserId
      ? [searchTerm, searchTerm, excludeUserId, limit]
      : [searchTerm, searchTerm, limit];

    return this._db.prepare(sql).all(...params).map(User.fromRow);
  }

  /**
   * Update user's online status.
   */
  updateStatus(userId, status) {
    const updates = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'offline') {
      updates.last_seen_at = new Date().toISOString();
    }
    return this.update(userId, updates);
  }

  /**
   * Get all online users.
   */
  getOnlineUsers() {
    return this._db.prepare("SELECT * FROM users WHERE status = 'online'")
      .all()
      .map(User.fromRow);
  }

  /**
   * Create a new user (overridden to return User model).
   */
  create(data) {
    super.create(data);
    return User.fromRow(data);
  }
}

module.exports = UserRepository;
