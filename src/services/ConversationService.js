// ============================================================================
// src/services/ConversationService.js — Conversation Service
// ============================================================================
// Manages conversation lifecycle: creation, participant management,
// direct message deduplication.
// ============================================================================

const { v4: uuidv4 } = require('uuid');
const { CONVERSATION_TYPE } = require('../models/Conversation');
const logger = require('../infrastructure/logger');
const eventBus = require('../infrastructure/eventBus');

class ConversationService {
  constructor(conversationRepository, userRepository) {
    this._conversationRepo = conversationRepository;
    this._userRepo = userRepository;
  }

  /**
   * Create a new conversation (direct or group).
   * For direct conversations, returns existing if one already exists.
   */
  createConversation({ type, name, createdBy, participantIds }) {
    // Ensure creator is in participant list
    if (!participantIds.includes(createdBy)) {
      participantIds = [createdBy, ...participantIds];
    }

    // Validate participants exist
    for (const id of participantIds) {
      const user = this._userRepo.findById(id);
      if (!user) {
        const error = new Error(`User ${id} not found`);
        error.statusCode = 404;
        throw error;
      }
    }

    // For direct conversations, check if one already exists
    if (type === CONVERSATION_TYPE.DIRECT) {
      if (participantIds.length !== 2) {
        const error = new Error('Direct conversations must have exactly 2 participants');
        error.statusCode = 400;
        throw error;
      }

      const existing = this._conversationRepo.findDirectConversation(
        participantIds[0],
        participantIds[1]
      );

      if (existing) {
        logger.debug('Returning existing direct conversation', { id: existing.id });
        return this._conversationRepo.findByIdWithParticipants(existing.id);
      }
    }

    // For group conversations, require a name
    if (type === CONVERSATION_TYPE.GROUP && !name) {
      const error = new Error('Group conversations require a name');
      error.statusCode = 400;
      throw error;
    }

    const conversationData = {
      id: uuidv4(),
      type: type || CONVERSATION_TYPE.DIRECT,
      name: name || null,
      createdBy,
    };

    this._conversationRepo.createWithParticipants(conversationData, participantIds);

    const conversation = this._conversationRepo.findByIdWithParticipants(conversationData.id);

    eventBus.emitEvent('conversation:created', {
      conversationId: conversationData.id,
      participantIds,
    });

    logger.info('Conversation created', {
      id: conversationData.id,
      type,
      participantCount: participantIds.length,
    });

    return conversation;
  }

  /**
   * Get all conversations for a user.
   */
  getUserConversations(userId, options = {}) {
    return this._conversationRepo.getByUserId(userId, options);
  }

  /**
   * Get conversation details.
   */
  getConversation(conversationId, userId) {
    const isParticipant = this._conversationRepo.isParticipant(conversationId, userId);
    if (!isParticipant) {
      const error = new Error('You are not a participant in this conversation');
      error.statusCode = 403;
      throw error;
    }

    return this._conversationRepo.findByIdWithParticipants(conversationId);
  }

  /**
   * Add a participant to a group conversation.
   */
  addParticipant(conversationId, requesterId, newUserId) {
    // Check requester is a participant
    const isParticipant = this._conversationRepo.isParticipant(conversationId, requesterId);
    if (!isParticipant) {
      const error = new Error('You are not a participant in this conversation');
      error.statusCode = 403;
      throw error;
    }

    // Check the new user exists
    const user = this._userRepo.findById(newUserId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Check conversation is a group
    const conv = this._conversationRepo.findById(conversationId);
    if (conv && conv.type !== 'group') {
      const error = new Error('Cannot add participants to a direct conversation');
      error.statusCode = 400;
      throw error;
    }

    this._conversationRepo.addParticipant(conversationId, newUserId);

    eventBus.emitEvent('conversation:updated', { conversationId, action: 'participant_added', userId: newUserId });

    logger.info('Participant added', { conversationId, newUserId });

    return this._conversationRepo.findByIdWithParticipants(conversationId);
  }

  /**
   * Get participant IDs for a conversation.
   */
  getParticipantIds(conversationId) {
    return this._conversationRepo.getParticipantIds(conversationId);
  }
}

module.exports = ConversationService;
