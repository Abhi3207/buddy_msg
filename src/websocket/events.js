// ============================================================================
// src/websocket/events.js — WebSocket Event Constants
// ============================================================================
// Defines all WebSocket event names as constants to prevent typos and
// provide a single source of truth for the event contract.
// ============================================================================

/**
 * Client → Server events (what the client sends).
 */
const CLIENT_EVENTS = {
  // Authentication
  AUTHENTICATE: 'authenticate',

  // Messaging
  MESSAGE_SEND: 'message:send',
  MESSAGE_READ: 'message:read',

  // Typing indicators
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Conversations
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
};

/**
 * Server → Client events (what the server emits).
 */
const SERVER_EVENTS = {
  // Connection
  CONNECTED: 'connected',
  AUTH_ERROR: 'auth:error',

  // Messaging
  MESSAGE_NEW: 'message:new',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  MESSAGE_DELETED: 'message:deleted',

  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Presence
  PRESENCE_UPDATE: 'presence:update',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',

  // Errors
  ERROR: 'error',
};

module.exports = { CLIENT_EVENTS, SERVER_EVENTS };
