// ============================================================================
// src/middleware/errorHandler.js — Global Error Handling Middleware
// ============================================================================
// Centralized error handling following Express best practices.
//
// Error response format (consistent across the entire API):
// {
//   success: false,
//   error: {
//     code: 'ERROR_CODE',
//     message: 'Human-readable description',
//     ...(details in development mode)
//   }
// }
//
// Catches both operational errors (thrown with statusCode) and programmer
// errors (unhandled exceptions), logging the latter at 'error' level.
// ============================================================================

const logger = require('../infrastructure/logger');
const config = require('../config');

/**
 * Map common error names to HTTP status codes.
 */
const ERROR_STATUS_MAP = {
  ValidationError: 400,
  UnauthorizedError: 401,
  ForbiddenError: 403,
  NotFoundError: 404,
  ConflictError: 409,
  RateLimitError: 429,
};

/**
 * Create a structured error response.
 */
function createErrorResponse(statusCode, code, message, details = null) {
  const response = {
    success: false,
    error: { code, message },
  };

  if (details && config.env === 'development') {
    response.error.details = details;
  }

  return response;
}

/**
 * 404 Not Found handler — placed after all routes.
 */
function notFoundHandler(req, res, next) {
  res.status(404).json(
    createErrorResponse(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`)
  );
}

/**
 * Global error handler — must have 4 arguments for Express to recognize it.
 */
function globalErrorHandler(err, req, res, next) {
  // Handle malformed JSON body (Express throws SyntaxError for bad JSON)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json(
      createErrorResponse(400, 'INVALID_JSON', 'Malformed JSON in request body')
    );
  }

  // Handle Joi validation errors that bypassed the validation middleware
  if (err.isJoi) {
    const details = err.details?.map(d => ({
      field: d.path.join('.'),
      message: d.message.replace(/"/g, ''),
    }));
    return res.status(400).json(
      createErrorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', details)
    );
  }

  // Determine status code
  let statusCode = err.statusCode || err.status || ERROR_STATUS_MAP[err.name] || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // For 5xx errors, log the full stack and sanitize the client message
  if (statusCode >= 500) {
    logger.error('Unhandled server error', {
      error: err.message,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.userId,
      ip: req.ip,
    });

    // Don't leak internal error details in production
    if (config.env === 'production') {
      message = 'An unexpected error occurred';
      code = 'INTERNAL_ERROR';
    }
  } else {
    // Operational errors — log at warn level
    logger.warn('Operational error', {
      statusCode,
      code,
      message,
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.userId,
    });
  }

  const response = createErrorResponse(statusCode, code, message,
    config.env === 'development' ? { stack: err.stack } : null
  );

  res.status(statusCode).json(response);
}

/**
 * Async route handler wrapper — catches rejected promises automatically.
 * Usage: router.get('/foo', asyncHandler(async (req, res) => { ... }));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { notFoundHandler, globalErrorHandler, asyncHandler, createErrorResponse };
