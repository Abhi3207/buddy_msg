// ============================================================================
// src/config/index.js — Centralized Configuration
// ============================================================================
// All configuration values are defined here with sensible defaults.
// Environment variables override defaults for production deployments.
// ============================================================================

const path = require('path');

const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  
  // CORS
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'messaging-system-dev-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Database
  db: {
    path: process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'messaging.db'),
  },

  // Cache
  cache: {
    maxSize: parseInt(process.env.CACHE_MAX_SIZE, 10) || 1000,
    defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL, 10) || 300, // 5 minutes in seconds
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },

  // Message Queue
  messageQueue: {
    maxRetries: parseInt(process.env.MQ_MAX_RETRIES, 10) || 3,
    retryDelay: parseInt(process.env.MQ_RETRY_DELAY, 10) || 1000, // ms
    maxQueueSize: parseInt(process.env.MQ_MAX_SIZE, 10) || 10000,
    processingInterval: parseInt(process.env.MQ_PROCESSING_INTERVAL, 10) || 100, // ms
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || path.join(__dirname, '..', '..', 'logs'),
  },

  // Pagination
  pagination: {
    defaultLimit: 50,
    maxLimit: 100,
  },

  // Bcrypt
  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10,
  },
};

module.exports = config;

// Warn if using default JWT secret (checked after export to avoid circular deps)
if (config.jwt.secret === 'messaging-system-dev-secret-key-change-in-production') {
  const isProduction = config.env === 'production';
  const level = isProduction ? 'error' : 'warn';
  // Use process.stderr directly to avoid logger circular dependency
  process.stderr.write(
    `[${level.toUpperCase()}] JWT secret is set to the default development value. ` +
    `Set the JWT_SECRET environment variable${isProduction ? ' — this is a CRITICAL security issue in production' : ''}.\n`
  );
}
