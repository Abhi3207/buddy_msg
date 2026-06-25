// ============================================================================
// src/routes/v1/users.js — User Routes
// ============================================================================
// GET    /api/v1/users/me       — Get current user profile
// GET    /api/v1/users/search   — Search users
// GET    /api/v1/users/online   — Get online users
// PATCH  /api/v1/users/profile  — Update profile
// ============================================================================

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validator');

/**
 * Create user routes.
 * @param {UserController} userController
 */
function createUserRoutes(userController) {
  const router = Router();

  // All user routes require authentication
  router.use(authenticate);

  router.get('/me', userController.getProfile);

  router.get(
    '/search',
    validate(schemas.users.search),
    userController.search
  );

  router.get('/online', userController.getOnlineUsers);

  router.patch(
    '/profile',
    validate(schemas.users.updateProfile),
    userController.updateProfile
  );

  return router;
}

module.exports = createUserRoutes;
