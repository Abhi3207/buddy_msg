// ============================================================================
// src/services/MessageService.js — Message Service
// ============================================================================
// Core messaging business logic: send, edit, delete, delivery/read receipts.
// Coordinates between MessageRepository, ConversationRepository, and the
// notification service for real-time delivery.
// ============================================================================

const { v4: uuidv4 } = require('uuid');
const { MESSAGE_STATUS, MESSAGE_TYPE } = require('../models/Message');
const logger = require('../infrastructure/logger');
const eventBus = require('../infrastructure/eventBus');

class MessageService {
  constructor(messageRepository, conversationRepository, notificationService) {
    this._messageRepo = messageRepository;
    this._conversationRepo = conversationRepository;
    this._notificationService = notificationService;
  }

  /**
   * Send a message to a conversation.
   * @param {Object} data — { conversationId, senderId, content, type?, parentMessageId? }
   * @returns {Object} The created message
   */
  sendMessage({ conversationId, senderId, content, type, parentMessageId }) {
    // Verify sender is a participant
    const isParticipant = this._conversationRepo.isParticipant(conversationId, senderId);
    if (!isParticipant) {
      const error = new Error('You are not a participant in this conversation');
      error.statusCode = 403;
      throw error;
    }

    // Create message
    const messageData = {
      id: uuidv4(),
      conversation_id: conversationId,
      sender_id: senderId,
      content: content.trim(),
      type: type || MESSAGE_TYPE.TEXT,
      status: MESSAGE_STATUS.SENT,
      parent_message_id: parentMessageId || null,
      is_edited: 0,
      is_deleted: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const message = this._messageRepo.createMessage(messageData);

    // Update conversation's last message
    this._conversationRepo.updateLastMessage(conversationId, message.id);

    // Get participant IDs for notification
    const participantIds = this._conversationRepo.getParticipantIds(conversationId);

    // Notify other participants via notification service
    this._notificationService.notifyNewMessage(message, participantIds, senderId);

    // Emit event
    eventBus.emitEvent('message:sent', {
      messageId: message.id,
      conversationId,
      senderId,
    });

    logger.info('Message sent', {
      messageId: message.id,
      conversationId,
      senderId,
    });

    return message.toJSON();
  }

  /**
   * Get messages for a conversation with cursor-based pagination.
   */
  getMessages(conversationId, userId, options = {}) {
    // Verify user is a participant
    const isParticipant = this._conversationRepo.isParticipant(conversationId, userId);
    if (!isParticipant) {
      const error = new Error('You are not a participant in this conversation');
      error.statusCode = 403;
      throw error;
    }

    // Map cursor → before for the repository's cursor-based pagination
    const repoOptions = {
      limit: options.limit,
      before: options.cursor || options.before,
    };

    const result = this._messageRepo.getByConversation(conversationId, repoOptions);

    return {
      messages: result.messages.map(m => m.toJSON()),
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  }

  /**
   * Mark messages as read.
   */
  markAsRead(conversationId, userId, messageId) {
    const isParticipant = this._conversationRepo.isParticipant(conversationId, userId);
    if (!isParticipant) {
      const error = new Error('You are not a participant in this conversation');
      error.statusCode = 403;
      throw error;
    }

    const count = this._messageRepo.markAsRead(conversationId, userId, messageId);

    // Update last read in conversation_participants
    if (messageId) {
      this._conversationRepo.updateLastRead(conversationId, userId, messageId);
    }

    // Notify sender about read receipt
    if (messageId) {
      const message = this._messageRepo.findByIdWithSender(messageId);
      if (message) {
        this._notificationService.notifyReadReceipt(conversationId, userId, messageId, message.senderId);
      }
    }

    eventBus.emitEvent('message:read', { conversationId, userId, messageId });

    return { markedCount: count };
  }

  /**
   * Soft delete a message (only sender can delete).
   */
  deleteMessage(messageId, userId) {
    const result = this._messageRepo.softDelete(messageId, userId);
    if (!result) {
      const error = new Error('Message not found or you are not the sender');
      error.statusCode = 404;
      throw error;
    }

    logger.info('Message deleted', { messageId, userId });
    return { success: true };
  }

  /**
   * Edit a message (only sender can edit).
   */
  editMessage(messageId, userId, newContent) {
    const message = this._messageRepo.findById(messageId);
    if (!message || message.sender_id !== userId) {
      const error = new Error('Message not found or you are not the sender');
      error.statusCode = 404;
      throw error;
    }

    if (message.is_deleted) {
      const error = new Error('Cannot edit a deleted message');
      error.statusCode = 400;
      throw error;
    }

    const updated = this._messageRepo.update(messageId, {
      content: newContent.trim(),
      is_edited: 1,
    });

    logger.info('Message edited', { messageId, userId });
    return updated;
  }
}

module.exports = MessageService;
