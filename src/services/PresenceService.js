// ============================================================================
// src/services/PresenceService.js — Presence Service
// ============================================================================
// Tracks online/offline/typing status of users via WebSocket connections.
// Maintains an in-memory map of connected socket IDs to user IDs.
// ============================================================================

const logger = require('../infrastructure/logger');
const eventBus = require('../infrastructure/eventBus');

class PresenceService {
  constructor(userService, notificationService) {
    this._userService = userService;
    this._notificationService = notificationService;

    // Maps: userId -> Set of socketIds (a user can have multiple tabs)
    this._userSockets = new Map();
    // Maps: socketId -> userId
    this._socketUsers = new Map();
    // Typing status: conversationId -> Set of userIds
    this._typingUsers = new Map();
  }

  /**
   * Register a socket connection for a user.
   */
  userConnected(userId, socketId) {
    if (!this._userSockets.has(userId)) {
      this._userSockets.set(userId, new Set());
    }
    this._userSockets.get(userId).add(socketId);
    this._socketUsers.set(socketId, userId);

    // If this is the user's first connection, mark them online
    if (this._userSockets.get(userId).size === 1) {
      this._userService.setUserStatus(userId, 'online');
      this._notificationService.notifyPresenceChange(userId, 'online');
      logger.info('User came online', { userId });
    }
  }

  /**
   * Unregister a socket connection.
   */
  userDisconnected(socketId) {
    const userId = this._socketUsers.get(socketId);
    if (!userId) return;

    this._socketUsers.delete(socketId);

    const sockets = this._userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);

      // If user has no more connections, mark offline
      if (sockets.size === 0) {
        this._userSockets.delete(userId);
        this._userService.setUserStatus(userId, 'offline');
        this._notificationService.notifyPresenceChange(userId, 'offline');

        // Clear typing status
        for (const [convId, typingSet] of this._typingUsers) {
          typingSet.delete(userId);
        }

        logger.info('User went offline', { userId });
      }
    }
  }

  /**
   * Set typing status for a user in a conversation.
   */
  setTyping(userId, conversationId, isTyping) {
    if (!this._typingUsers.has(conversationId)) {
      this._typingUsers.set(conversationId, new Set());
    }

    const typingSet = this._typingUsers.get(conversationId);

    if (isTyping) {
      typingSet.add(userId);
    } else {
      typingSet.delete(userId);
    }

    this._notificationService.notifyTyping(conversationId, userId, isTyping);
  }

  /**
   * Check if a user is online.
   */
  isOnline(userId) {
    const sockets = this._userSockets.get(userId);
    return sockets && sockets.size > 0;
  }

  /**
   * Get all online user IDs.
   */
  getOnlineUserIds() {
    return Array.from(this._userSockets.keys());
  }

  /**
   * Get socket IDs for a user (for direct messaging).
   */
  getUserSocketIds(userId) {
    const sockets = this._userSockets.get(userId);
    return sockets ? Array.from(sockets) : [];
  }

  /**
   * Get typing users in a conversation.
   */
  getTypingUsers(conversationId) {
    const typingSet = this._typingUsers.get(conversationId);
    return typingSet ? Array.from(typingSet) : [];
  }

  /**
   * Get presence metrics.
   */
  getMetrics() {
    return {
      onlineUsers: this._userSockets.size,
      totalSockets: this._socketUsers.size,
      typingConversations: this._typingUsers.size,
    };
  }
}

module.exports = PresenceService;
