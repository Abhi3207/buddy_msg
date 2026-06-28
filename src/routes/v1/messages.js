// ============================================================================
// src/routes/v1/messages.js — Message Routes
// ============================================================================
// POST   /api/v1/messages                    — Send message
// GET    /api/v1/messages/:conversationId     — Get messages (paginated)
// PATCH  /api/v1/messages/:id                 — Edit message
// PATCH  /api/v1/messages/:id/read            — Mark as read
// DELETE /api/v1/messages/:id                 — Soft delete message
// ============================================================================

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validator');

/**
 * Create message routes.
 * @param {MessageController} messageController
 */
function createMessageRoutes(messageController) {
  const router = Router();

  // All message routes require authentication
  router.use(authenticate);

  router.post(
    '/',
    validate(schemas.messages.send),
    messageController.send
  );

  router.get(
    '/:conversationId',
    validate(schemas.messages.getByConversation),
    messageController.getByConversation
  );

  router.patch(
    '/:id/read',
    validate(schemas.messages.markRead),
    messageController.markAsRead
  );

  router.patch(
    '/:id',
    validate(schemas.messages.edit),
    messageController.edit
  );

  router.delete(
    '/:id',
    validate(schemas.messages.delete),
    messageController.delete
  );

  return router;
}

module.exports = createMessageRoutes;
