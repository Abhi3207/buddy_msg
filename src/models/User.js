// ============================================================================
// src/models/User.js — User Model / DTO
// ============================================================================
// Data Transfer Object for User entities. Provides serialization helpers
// that strip sensitive fields (password_hash) from API responses.
// ============================================================================

class User {
  constructor(data = {}) {
    this.id = data.id;
    this.username = data.username;
    this.email = data.email;
    this.passwordHash = data.password_hash || data.passwordHash;
    this.displayName = data.display_name || data.displayName || data.username;
    this.avatarUrl = data.avatar_url || data.avatarUrl;
    this.status = data.status || 'offline';
    this.lastSeenAt = data.last_seen_at || data.lastSeenAt;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  /**
   * Convert to safe public representation (no password hash).
   */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      displayName: this.displayName,
      avatarUrl: this.avatarUrl,
      status: this.status,
      lastSeenAt: this.lastSeenAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Minimal representation for lists/search results.
   */
  toSummary() {
    return {
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      avatarUrl: this.avatarUrl,
      status: this.status,
    };
  }

  /**
   * Convert to database row format.
   */
  toRow() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      password_hash: this.passwordHash,
      display_name: this.displayName,
      avatar_url: this.avatarUrl,
      status: this.status,
      last_seen_at: this.lastSeenAt,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }

  static fromRow(row) {
    return row ? new User(row) : null;
  }
}

module.exports = User;
