// ============================================================================
// src/services/NotificationService.js — Notification Service
// ============================================================================
// Orchestrates real-time notifications via the message queue and WebSocket.
// Acts as the bridge between business logic and the transport layer.
//
// In production, this would integrate with FCM, APNs, or a push service.
// ============================================================================

const { messageQueue } = require('../infrastructure/messageQueue');
const logger = require('../infrastructure/logger');

class NotificationService {
  constructor() {
    this._io = null; // Set after Socket.IO initialization
  }

  /**
   * Set the Socket.IO server instance.
   */
  setIO(io) {
    this._io = io;
  }

  /**
   * Notify participants about a new message.
   * Uses the message queue for reliable async delivery.
   */
  notifyNewMessage(message, participantIds, senderId) {
    const recipients = participantIds.filter(id => id !== senderId);

    messageQueue.publish('notification:message', {
      type: 'message:new',
      message: message.toJSON ? message.toJSON() : message,
      recipients,
      conversationId: message.conversationId || message.conversation_id,
    });
  }

  /**
   * Notify about a read receipt.
   */
  notifyReadReceipt(conversationId, readerId, messageId, senderId) {
    messageQueue.publish('notification:read-receipt', {
      type: 'message:read',
      conversationId,
      readerId,
      messageId,
      senderId,
    });
  }

  /**
   * Notify about typing status.
   */
  notifyTyping(conversationId, userId, isTyping) {
    if (!this._io) return;

    const event = isTyping ? 'typing:start' : 'typing:stop';
    this._io.to(`conversation:${conversationId}`).emit(event, {
      conversationId,
      userId,
    });
  }

  /**
   * Notify about user presence change.
   */
  notifyPresenceChange(userId, status) {
    if (!this._io) return;

    this._io.emit('presence:update', { userId, status });
  }

  /**
   * Send a direct notification to a specific user.
   */
  notifyUser(userId, event, data) {
    if (!this._io) return;

    this._io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Initialize message queue consumers for notification delivery.
   */
  initializeConsumers() {
    // Process new message notifications
    messageQueue.subscribe('notification:message', (payload) => {
      if (!this._io) {
        logger.warn('NotificationService: Socket.IO not initialized');
        return;
      }

      const { type, message, recipients, conversationId } = payload;

      // Send to the conversation room
      this._io.to(`conversation:${conversationId}`).emit(type, {
        message,
        conversationId,
      });

      // Also send to individual user rooms (for users not currently viewing the conversation)
      for (const recipientId of recipients) {
        this._io.to(`user:${recipientId}`).emit(type, {
          message,
          conversationId,
        });
      }

      logger.debug('Notification delivered', { type, conversationId, recipientCount: recipients.length });
    });

    // Process read receipt notifications
    messageQueue.subscribe('notification:read-receipt', (payload) => {
      if (!this._io) return;

      const { conversationId, readerId, messageId, senderId } = payload;

      // Notify the original sender
      this._io.to(`user:${senderId}`).emit('message:read', {
        conversationId,
        readerId,
        messageId,
      });
    });

    logger.info('NotificationService: consumers initialized');
  }
}

module.exports = NotificationService;
