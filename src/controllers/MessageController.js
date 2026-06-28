// ============================================================================
// src/controllers/MessageController.js — Message HTTP Handlers
// ============================================================================
// Handles sending, retrieving (paginated), reading, and deleting messages.
// ============================================================================

const { asyncHandler } = require('../middleware/errorHandler');

class MessageController {
  constructor(messageService) {
    this._messageService = messageService;
  }

  /**
   * POST /api/v1/messages
   */
  send = asyncHandler(async (req, res) => {
    const { conversationId, content, type, parentMessageId } = req.body;

    const message = this._messageService.sendMessage({
      conversationId,
      senderId: req.user.userId,
      content,
      type,
      parentMessageId,
    });

    res.status(201).json({
      success: true,
      data: { message },
    });
  });

  /**
   * GET /api/v1/messages/:conversationId?limit=50&cursor=...
   */
  getByConversation = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { limit, cursor } = req.query;

    const result = this._messageService.getMessages(
      conversationId,
      req.user.userId,
      { limit, cursor }
    );

    res.status(200).json({
      success: true,
      data: {
        messages: result.messages,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      },
    });
  });

  /**
   * PATCH /api/v1/messages/:id/read
   */
  markAsRead = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { conversationId } = req.body;

    const result = this._messageService.markAsRead(
      conversationId,
      req.user.userId,
      id
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  });

  /**
   * DELETE /api/v1/messages/:id
   */
  delete = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = this._messageService.deleteMessage(id, req.user.userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  });

  /**
   * PATCH /api/v1/messages/:id
   */
  edit = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;

    const message = this._messageService.editMessage(id, req.user.userId, content);

    res.status(200).json({
      success: true,
      data: { message },
    });
  });
}

module.exports = MessageController;
