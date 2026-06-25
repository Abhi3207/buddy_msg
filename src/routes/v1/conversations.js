// ============================================================================
// src/routes/v1/conversations.js — Conversation Routes
// ============================================================================
// POST   /api/v1/conversations                    — Create conversation
// GET    /api/v1/conversations                    — List user's conversations
// GET    /api/v1/conversations/:id                — Get conversation details
// POST   /api/v1/conversations/:id/participants   — Add participant
// ============================================================================

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validator');

/**
 * Create conversation routes.
 * @param {ConversationController} conversationController
 */
function createConversationRoutes(conversationController) {
  const router = Router();

  // All conversation routes require authentication
  router.use(authenticate);

  router.post(
    '/',
    validate(schemas.conversations.create),
    conversationController.create
  );

  router.get(
    '/',
    validate(schemas.conversations.list),
    conversationController.list
  );

  router.get(
    '/:id',
    validate(schemas.conversations.getById),
    conversationController.getById
  );

  router.post(
    '/:id/participants',
    validate(schemas.conversations.addParticipant),
    conversationController.addParticipant
  );

  return router;
}

module.exports = createConversationRoutes;
