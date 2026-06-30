// ============================================================================
// src/infrastructure/logger.js — Structured Logger (Winston)
// ============================================================================
// Provides leveled, structured logging with console and file transports.
// Follows the 12-factor app methodology for logging.
// ============================================================================

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure log directory exists
const logDir = config.logging.dir;
let logDirAvailable = false;
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  logDirAvailable = true;
} catch (err) {
  // Fall back to console-only logging if directory creation fails
  process.stderr.write(
    `[WARN] Could not create log directory "${logDir}": ${err.message}. Falling back to console-only logging.\n`
  );
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// JSON format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports = [
  // Console transport — human-readable
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// File transports — only added if log directory is available
if (logDirAvailable) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  );
}

const logger = winston.createLogger({
  level: config.logging.level,
  defaultMeta: { service: 'messaging-system' },
  transports,
});

// Add HTTP-level logging for request tracking
logger.http = logger.http || function (message, meta) {
  logger.log('http', message, meta);
};

module.exports = logger;
