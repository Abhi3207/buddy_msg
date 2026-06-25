// ============================================================================
// src/websocket/socketHandler.js — Socket.IO Connection Manager
// ============================================================================
// Manages the full lifecycle of WebSocket connections:
//   1. Authentication (JWT verification on connect)
//   2. Room management (user rooms, conversation rooms)
//   3. Event routing (message sending, typing, read receipts via WS)
//   4. Presence tracking (online/offline/typing via PresenceService)
//
// Architecture note: this handler acts as a thin transport layer.
// All business logic lives in the service layer — the socket handler
// simply translates WebSocket events into service calls.
// ============================================================================

const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../infrastructure/logger');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('./events');

// Services are injected lazily (resolved after the composition root runs)
let services = null;
let presenceService = null;

function getServices() {
  if (!services) {
    // Lazy-load to avoid circular dependency with the route aggregator
    const v1 = require('../routes/v1/index');
    services = v1.services;
  }
  return services;
}

function getPresenceService() {
  if (!presenceService) {
    const { services: svc } = require('../routes/v1/index');
    const PresenceService = require('../services/PresenceService');
    presenceService = new PresenceService(svc.userService, svc.notificationService);
  }
  return presenceService;
}

/**
 * Initialize the Socket.IO server with all event handlers.
 * @param {import('socket.io').Server} io
 */
function initializeSocketHandler(io) {
  // -------------------------------------------------------------------------
  // Authentication middleware — verify JWT before allowing connection
  // -------------------------------------------------------------------------
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token, config.jwt.secret);
      socket.userId = payload.userId;
      socket.username = payload.username;
      next();
    } catch (err) {
      logger.debug('WebSocket auth failed', { error: err.message });
      next(new Error('Invalid token'));
    }
  });

  // -------------------------------------------------------------------------
  // Connection handler
  // -------------------------------------------------------------------------
  io.on('connection', (socket) => {
    const { userId, username } = socket;
    const svc = getServices();
    const presence = getPresenceService();

    logger.info('WebSocket connected', { userId, username, socketId: socket.id });

    // --- Join user's personal room (for direct notifications) ---
    socket.join(`user:${userId}`);

    // --- Register with presence service ---
    presence.userConnected(userId, socket.id);

    // --- Set the IO instance on notification service ---
    svc.notificationService.setIO(io);

    // --- Send connection confirmation ---
    socket.emit(SERVER_EVENTS.CONNECTED, {
      userId,
      username,
      message: 'Connected to messaging server',
    });

    // -----------------------------------------------------------------------
    // Event: Join a conversation room
    // -----------------------------------------------------------------------
    socket.on(CLIENT_EVENTS.CONVERSATION_JOIN, ({ conversationId }) => {
      if (!conversationId) return;

      socket.join(`conversation:${conversationId}`);
      logger.debug('User joined conversation room', { userId, conversationId });
    });

    // -----------------------------------------------------------------------
    // Event: Leave a conversation room
    // -----------------------------------------------------------------------
    socket.on(CLIENT_EVENTS.CONVERSATION_LEAVE, ({ conversationId }) => {
      if (!conversationId) return;

      socket.leave(`conversation:${conversationId}`);
      logger.debug('User left conversation room', { userId, conversationId });
    });

    // -----------------------------------------------------------------------
    // Event: Send message via WebSocket (alternative to HTTP POST)
    // -----------------------------------------------------------------------
    socket.on(CLIENT_EVENTS.MESSAGE_SEND, ({ conversationId, content, type, parentMessageId }) => {
      try {
        if (!conversationId || !content) {
          socket.emit(SERVER_EVENTS.ERROR, { message: 'conversationId and content are required' });
          return;
        }

        const message = svc.messageService.sendMessage({
          conversationId,
          senderId: userId,
          content,
          type: type || 'text',
          parentMessageId,
        });

        // Acknowledge to sender
        socket.emit(SERVER_EVENTS.MESSAGE_DELIVERED, { message });

        logger.debug('Message sent via WebSocket', { messageId: message.id, conversationId });
      } catch (err) {
        logger.error('WebSocket message:send error', { error: err.message, userId });
        socket.emit(SERVER_EVENTS.ERROR, { message: err.message });
      }
    });

    // -----------------------------------------------------------------------
    // Event: Mark message as read
    // -----------------------------------------------------------------------
    socket.on(CLIENT_EVENTS.MESSAGE_READ, ({ conversationId, messageId }) => {
      try {
        if (!conversationId || !messageId) return;

        svc.messageService.markAsRead(conversationId, userId, messageId);

        logger.debug('Message marked read via WS', { messageId, userId });
      } catch (err) {
        logger.error('WebSocket message:read error', { error: err.message });
      }
    });

    // -----------------------------------------------------------------------
    // Event: Typing indicators
    // -----------------------------------------------------------------------
    socket.on(CLIENT_EVENTS.TYPING_START, ({ conversationId }) => {
      if (!conversationId) return;
      presence.setTyping(userId, conversationId, true);
    });

    socket.on(CLIENT_EVENTS.TYPING_STOP, ({ conversationId }) => {
      if (!conversationId) return;
      presence.setTyping(userId, conversationId, false);
    });

    // -----------------------------------------------------------------------
    // Event: Disconnect
    // -----------------------------------------------------------------------
    socket.on('disconnect', (reason) => {
      presence.userDisconnected(socket.id);
      logger.info('WebSocket disconnected', { userId, username, reason });
    });

    // -----------------------------------------------------------------------
    // Event: Error
    // -----------------------------------------------------------------------
    socket.on('error', (err) => {
      logger.error('WebSocket error', { userId, error: err.message });
    });
  });

  logger.info('Socket.IO handler initialized');
}

module.exports = { initializeSocketHandler };
