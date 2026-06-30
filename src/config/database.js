// ============================================================================
// src/config/database.js — SQLite Database Singleton
// ============================================================================
// Manages the SQLite connection lifecycle. Uses better-sqlite3 for synchronous,
// high-performance access. Implements the Singleton pattern to ensure a single
// connection is shared across the application.
// ============================================================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./index');
const logger = require('../infrastructure/logger');

let db = null;

// ============================================================================
// Schema Definition
// ============================================================================

const SCHEMA = `
  -- Enable WAL mode for better concurrent read performance
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA secure_delete = ON;

  -- ========================================================================
  -- Users Table
  -- ========================================================================
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    status TEXT DEFAULT 'offline' CHECK(status IN ('online', 'offline', 'away')),
    last_seen_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

  -- ========================================================================
  -- Conversations Table
  -- ========================================================================
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'direct' CHECK(type IN ('direct', 'group')),
    name TEXT,
    created_by TEXT REFERENCES users(id),
    last_message_id TEXT,
    last_message_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);
  CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at);

  -- ========================================================================
  -- Conversation Participants (Join Table)
  -- ========================================================================
  CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member')),
    joined_at TEXT DEFAULT (datetime('now')),
    last_read_message_id TEXT,
    PRIMARY KEY (conversation_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_cp_user_id ON conversation_participants(user_id);
  CREATE INDEX IF NOT EXISTS idx_cp_conversation_id ON conversation_participants(conversation_id);

  -- ========================================================================
  -- Messages Table
  -- ========================================================================
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text' CHECK(type IN ('text', 'image', 'system')),
    status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'read')),
    parent_message_id TEXT REFERENCES messages(id),
    is_edited INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);

  -- Composite index to speed up findDirectConversation JOIN
  CREATE INDEX IF NOT EXISTS idx_cp_conversation_user ON conversation_participants(conversation_id, user_id);
`;

// ============================================================================
// Database Lifecycle
// ============================================================================

function initializeDatabase() {
  if (db) {
    logger.warn('Database already initialized');
    return db;
  }

  // Ensure data directory exists
  const dbDir = path.dirname(config.db.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    logger.info(`Created database directory: ${dbDir}`);
  }

  try {
    db = new Database(config.db.path, {
      verbose: config.env === 'development' ? (sql) => logger.debug(`SQL: ${sql}`) : undefined
    });

    // Execute schema
    db.exec(SCHEMA);

    logger.info('Database schema initialized', { path: config.db.path });

    return db;
  } catch (error) {
    logger.error('Failed to initialize database', { error: error.message });
    throw error;
  }
}

function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

function closeDatabase() {
  if (db) {
    // Run PRAGMA optimize before closing — this lets SQLite analyze tables
    // that would benefit from re-analysis, improving query planner decisions.
    try {
      db.pragma('optimize');
    } catch (err) {
      logger.warn('PRAGMA optimize failed', { error: err.message });
    }
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

module.exports = {
  initializeDatabase,
  getDatabase,
  closeDatabase
};
