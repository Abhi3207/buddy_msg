// ============================================================================
// src/routes/v1/index.js — v1 API Route Aggregator (Composition Root)
// ============================================================================
// Wires all dependencies (repositories → services → controllers → routes)
// using manual dependency injection. This is the composition root for the
// entire API layer.
//
// Why manual DI instead of a container?
// - Explicit and debuggable
// - No magic — you can trace every dependency
// - Perfect for this project size
// ============================================================================

const { Router } = require('express');
const { getDatabase } = require('../../config/database');
const { rateLimiter } = require('../../middleware/rateLimiter');

// Repositories
const UserRepository = require('../../repositories/UserRepository');
const MessageRepository = require('../../repositories/MessageRepository');
const ConversationRepository = require('../../repositories/ConversationRepository');

// Services
const AuthService = require('../../services/AuthService');
const UserService = require('../../services/UserService');
const MessageService = require('../../services/MessageService');
const ConversationService = require('../../services/ConversationService');
const NotificationService = require('../../services/NotificationService');

// Controllers
const AuthController = require('../../controllers/AuthController');
const UserController = require('../../controllers/UserController');
const MessageController = require('../../controllers/MessageController');
const ConversationController = require('../../controllers/ConversationController');

// Route factories
const createAuthRoutes = require('./auth');
const createUserRoutes = require('./users');
const createMessageRoutes = require('./messages');
const createConversationRoutes = require('./conversations');

// ============================================================================
// Dependency Injection Wiring
// ============================================================================

const router = Router();

// --- Instantiate Repositories ---
const db = getDatabase();
const userRepo = new UserRepository(db);
const messageRepo = new MessageRepository(db);
const conversationRepo = new ConversationRepository(db);

// --- Instantiate Services ---
const notificationService = new NotificationService();
const authService = new AuthService(userRepo);
const userService = new UserService(userRepo);
const messageService = new MessageService(messageRepo, conversationRepo, notificationService);
const conversationService = new ConversationService(conversationRepo, userRepo);

// Initialize notification consumers (message queue → WebSocket delivery)
notificationService.initializeConsumers();

// --- Instantiate Controllers ---
const authController = new AuthController(authService);
const userController = new UserController(userService);
const messageController = new MessageController(messageService);
const conversationController = new ConversationController(conversationService);

// --- Apply global rate limiter to all v1 routes ---
router.use(rateLimiter());

// --- Mount routes ---
router.use('/auth', createAuthRoutes(authController));
router.use('/users', createUserRoutes(userController));
router.use('/messages', createMessageRoutes(messageController));
router.use('/conversations', createConversationRoutes(conversationController));

// Export the router and service singletons (needed by WebSocket layer)
module.exports = router;
module.exports.services = {
  authService,
  userService,
  messageService,
  conversationService,
  notificationService,
};
