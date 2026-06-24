// ============================================================================
// src/services/UserService.js — User Service
// ============================================================================
// Manages user profiles, search, and presence tracking.
// ============================================================================

const logger = require('../infrastructure/logger');
const eventBus = require('../infrastructure/eventBus');

class UserService {
  constructor(userRepository) {
    this._userRepo = userRepository;
  }

  /**
   * Get user profile by ID.
   */
  getProfile(userId) {
    const user = this._userRepo.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    return user.toJSON();
  }

  /**
   * Update user profile.
   */
  updateProfile(userId, updates) {
    const allowedFields = ['display_name', 'avatar_url'];
    const filtered = {};
    
    if (updates.displayName !== undefined) filtered.display_name = updates.displayName;
    if (updates.avatarUrl !== undefined) filtered.avatar_url = updates.avatarUrl;

    // Validate no disallowed fields
    if (Object.keys(filtered).length === 0) {
      const error = new Error('No valid fields to update');
      error.statusCode = 400;
      throw error;
    }

    const updated = this._userRepo.update(userId, filtered);
    if (!updated) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    logger.info('Profile updated', { userId });
    return updated;
  }

  /**
   * Search users by username or display name.
   */
  searchUsers(query, excludeUserId, limit = 20) {
    if (!query || query.trim().length < 1) {
      return [];
    }
    const users = this._userRepo.search(query.trim(), excludeUserId, limit);
    return users.map(u => u.toSummary());
  }

  /**
   * Update user online status.
   */
  setUserStatus(userId, status) {
    this._userRepo.updateStatus(userId, status);
    eventBus.emitEvent('user:status-changed', { userId, status });
    logger.debug('User status changed', { userId, status });
  }

  /**
   * Get all online users.
   */
  getOnlineUsers() {
    const users = this._userRepo.getOnlineUsers();
    return users.map(u => u.toSummary());
  }

  /**
   * Get user by ID (internal use, returns model).
   */
  getUserById(userId) {
    return this._userRepo.findById(userId);
  }
}

module.exports = UserService;
