// ============================================================================
// src/routes/v1/auth.js — Authentication Routes
// ============================================================================
// POST /api/v1/auth/register   — Register new user
// POST /api/v1/auth/login      — Login, receive JWT
// POST /api/v1/auth/refresh    — Refresh JWT token
// ============================================================================

const { Router } = require('express');
const { validate, schemas } = require('../../middleware/validator');
const { rateLimiter } = require('../../middleware/rateLimiter');

/**
 * Create auth routes.
 * @param {AuthController} authController
 */
function createAuthRoutes(authController) {
  const router = Router();

  // Stricter rate limiting for auth endpoints (prevent brute force)
  const authRateLimiter = rateLimiter({ maxRequests: 10, windowMs: 60000 });

  router.post(
    '/register',
    authRateLimiter,
    validate(schemas.auth.register),
    authController.register
  );

  router.post(
    '/login',
    authRateLimiter,
    validate(schemas.auth.login),
    authController.login
  );

  router.post(
    '/refresh',
    authRateLimiter,
    validate(schemas.auth.refresh),
    authController.refresh
  );

  return router;
}

module.exports = createAuthRoutes;
