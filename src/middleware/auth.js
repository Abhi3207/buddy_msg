// ============================================================================
// src/middleware/auth.js — JWT Authentication Middleware
// ============================================================================
// Verifies JWT tokens from the Authorization header and attaches the
// authenticated user's identity (userId, username) to req.user.
//
// Follows the Bearer token scheme: Authorization: Bearer <token>
// ============================================================================

const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../infrastructure/logger');

/**
 * Express middleware that validates JWT tokens.
 *
 * Expects: Authorization: Bearer <jwt>
 * Sets:    req.user = { userId, username }
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
    });
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN_FORMAT', message: 'Token format: Bearer <token>' },
    });
  }

  const token = parts[1];

  try {
    const payload = jwt.verify(token, config.jwt.secret);

    if (payload.type !== 'access') {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN_TYPE', message: 'Access token required' },
      });
    }

    // Attach user identity to the request
    req.user = {
      userId: payload.userId,
      username: payload.username,
    };

    next();
  } catch (err) {
    logger.debug('JWT verification failed', { error: err.message });

    const isExpired = err.name === 'TokenExpiredError';

    return res.status(401).json({
      success: false,
      error: {
        code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        message: isExpired ? 'Token has expired' : 'Invalid token',
      },
    });
  }
}

/**
 * Optional authentication — attaches user if token present, but doesn't reject.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next();
  }

  try {
    const payload = jwt.verify(parts[1], config.jwt.secret);
    // Only accept access tokens (reject refresh tokens silently)
    if (payload.type === 'access') {
      req.user = { userId: payload.userId, username: payload.username };
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }

  next();
}

module.exports = { authenticate, optionalAuth };
