// ============================================================================
// src/controllers/ConversationController.js — Conversation HTTP Handlers
// ============================================================================
// Handles conversation creation, listing, detail, and participant management.
// ============================================================================

const { asyncHandler } = require('../middleware/errorHandler');

class ConversationController {
  constructor(conversationService) {
    this._conversationService = conversationService;
  }

  /**
   * POST /api/v1/conversations
   */
  create = asyncHandler(async (req, res) => {
    const { type, name, participantIds } = req.body;

    const conversation = this._conversationService.createConversation({
      type,
      name,
      createdBy: req.user.userId,
      participantIds,
    });

    res.status(201).json({
      success: true,
      data: { conversation },
    });
  });

  /**
   * GET /api/v1/conversations?limit=50&offset=0
   */
  list = asyncHandler(async (req, res) => {
    const { limit, offset } = req.query;

    const conversations = this._conversationService.getUserConversations(
      req.user.userId,
      { limit, offset }
    );

    res.status(200).json({
      success: true,
      data: {
        conversations,
        count: conversations.length,
      },
    });
  });

  /**
   * GET /api/v1/conversations/:id
   */
  getById = asyncHandler(async (req, res) => {
    const conversation = this._conversationService.getConversation(
      req.params.id,
      req.user.userId
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
    }

    res.status(200).json({
      success: true,
      data: { conversation },
    });
  });

  /**
   * POST /api/v1/conversations/:id/participants
   */
  addParticipant = asyncHandler(async (req, res) => {
    const { userId } = req.body;

    const conversation = this._conversationService.addParticipant(
      req.params.id,
      req.user.userId,
      userId
    );

    res.status(200).json({
      success: true,
      data: { conversation },
    });
  });
}

module.exports = ConversationController;
