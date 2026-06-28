// ============================================================================
// src/middleware/validator.js — Request Validation Middleware (Joi)
// ============================================================================
// Factory function that creates Express middleware from Joi schemas.
// Validates body, params, and query separately, returning structured errors.
//
// Usage:
//   const { validate, schemas } = require('../middleware/validator');
//   router.post('/register', validate(schemas.auth.register), controller.register);
// ============================================================================

const Joi = require('joi');

/**
 * Middleware factory: validates req.body / req.params / req.query against a schema.
 *
 * @param {{ body?: Joi.Schema, params?: Joi.Schema, query?: Joi.Schema }} schema
 * @returns {Function} Express middleware
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    // Validate body
    if (schema.body) {
      const { error, value } = schema.body.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message.replace(/"/g, ''),
          location: 'body',
        })));
      } else {
        req.body = value; // Use the sanitized value
      }
    }

    // Validate params
    if (schema.params) {
      const { error, value } = schema.params.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message.replace(/"/g, ''),
          location: 'params',
        })));
      } else {
        req.params = value;
      }
    }

    // Validate query
    if (schema.query) {
      const { error, value } = schema.query.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message.replace(/"/g, ''),
          location: 'query',
        })));
      } else {
        req.query = value;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors,
        },
      });
    }

    next();
  };
}

// ============================================================================
// Validation Schemas (grouped by domain)
// ============================================================================

const schemas = {
  // --- Auth ---
  auth: {
    register: {
      body: Joi.object({
        username: Joi.string().alphanum().min(3).max(30).required()
          .messages({ 'string.alphanum': 'Username must contain only letters and numbers' }),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).max(128).required(),
        displayName: Joi.string().min(1).max(50).optional(),
      }),
    },
    login: {
      body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required(),
      }),
    },
    refresh: {
      body: Joi.object({
        refreshToken: Joi.string().required(),
      }),
    },
  },

  // --- Users ---
  users: {
    updateProfile: {
      body: Joi.object({
        displayName: Joi.string().min(1).max(50).optional(),
        avatarUrl: Joi.string().uri().optional().allow(''),
      }).min(1).messages({
        'object.min': 'At least one field must be provided',
      }),
    },
    search: {
      query: Joi.object({
        q: Joi.string().min(1).max(100).required()
          .messages({ 'string.min': 'Search query must not be empty' }),
        limit: Joi.number().integer().min(1).max(50).default(20),
      }),
    },
  },

  // --- Conversations ---
  conversations: {
    create: {
      body: Joi.object({
        type: Joi.string().valid('direct', 'group').required(),
        name: Joi.string().min(1).max(100).when('type', {
          is: 'group',
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        participantIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
      }),
    },
    list: {
      query: Joi.object({
        limit: Joi.number().integer().min(1).max(100).default(50),
        offset: Joi.number().integer().min(0).default(0),
      }),
    },
    addParticipant: {
      params: Joi.object({
        id: Joi.string().uuid().required(),
      }),
      body: Joi.object({
        userId: Joi.string().uuid().required(),
      }),
    },
    getById: {
      params: Joi.object({
        id: Joi.string().uuid().required(),
      }),
    },
  },

  // --- Messages ---
  messages: {
    send: {
      body: Joi.object({
        conversationId: Joi.string().uuid().required(),
        content: Joi.string().min(1).max(5000).required(),
        type: Joi.string().valid('text', 'image').default('text'),
        parentMessageId: Joi.string().uuid().optional().allow(null),
      }),
    },
    getByConversation: {
      params: Joi.object({
        conversationId: Joi.string().uuid().required(),
      }),
      query: Joi.object({
        limit: Joi.number().integer().min(1).max(100).default(50),
        cursor: Joi.string().optional(),
      }),
    },
    markRead: {
      params: Joi.object({
        id: Joi.string().uuid().required(),
      }),
      body: Joi.object({
        conversationId: Joi.string().uuid().required(),
      }),
    },
    delete: {
      params: Joi.object({
        id: Joi.string().uuid().required(),
      }),
    },
    edit: {
      params: Joi.object({
        id: Joi.string().uuid().required(),
      }),
      body: Joi.object({
        content: Joi.string().min(1).max(5000).required(),
      }),
    },
  },
};

module.exports = { validate, schemas };
