// ============================================================================
// src/repositories/MessageRepository.js
// ============================================================================

const BaseRepository = require('./BaseRepository');
const { Message } = require('../models/Message');
const { cache } = require('../infrastructure/cache');

class MessageRepository extends BaseRepository {
  constructor(db) {
    super(db, 'messages', 'message');
  }

  /**
   * Get messages for a conversation with cursor-based pagination.
   * Uses cursor pagination (before a given message's created_at) for
   * efficient scrollback in chat UIs.
   *
   * @param {string} conversationId
   * @param {Object} [options]
   * @param {string} [options.before] — cursor: created_at timestamp
   * @param {number} [options.limit=50]
   * @returns {{ messages: Message[], hasMore: boolean, nextCursor: string|null }}
   */
  getByConversation(conversationId, options = {}) {
    const { before, limit = 50 } = options;

    let sql = `
      SELECT m.*, 
             u.username as sender_username,
             u.display_name as sender_display_name,
             u.avatar_url as sender_avatar_url
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
    `;
    const params = [conversationId];

    if (before) {
      sql += ` AND m.created_at < ?`;
      params.push(before);
    }

    // Fetch one extra to determine if there are more
    sql += ` ORDER BY m.created_at DESC LIMIT ?`;
    params.push(limit + 1);

    const rows = this._db.prepare(sql).all(...params);
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map(Message.fromRow);
    const nextCursor = hasMore && messages.length > 0
      ? messages[messages.length - 1].createdAt
      : null;

    return { messages, hasMore, nextCursor };
  }

  /**
   * Create a message and return the full message with sender info.
   */
  createMessage(data) {
    super.create(data);

    // Fetch the message with sender info
    const row = this._db.prepare(`
      SELECT m.*, 
             u.username as sender_username,
             u.display_name as sender_display_name,
             u.avatar_url as sender_avatar_url
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(data.id);

    // Invalidate conversation message caches
    cache.invalidatePrefix(`message:conv:${data.conversation_id}`);

    return Message.fromRow(row);
  }

  /**
   * Mark a message as delivered.
   */
  markDelivered(messageId) {
    return this.update(messageId, { status: 'delivered' });
  }

  /**
   * Mark all messages in a conversation as read for a user (up to a message).
   * @param {string} conversationId
   * @param {string} userId — the reader
   * @param {string} [upToMessageId] — mark all messages up to this one
   */
  markAsRead(conversationId, userId, upToMessageId) {
    let sql;
    let params;

    if (upToMessageId) {
      // Get the timestamp of the target message
      const targetMsg = this.findById(upToMessageId);
      if (!targetMsg) return 0;

      sql = `
        UPDATE messages 
        SET status = 'read', updated_at = datetime('now')
        WHERE conversation_id = ? 
          AND sender_id != ?
          AND status != 'read'
          AND is_deleted = 0
          AND created_at <= (SELECT created_at FROM messages WHERE id = ?)
      `;
      params = [conversationId, userId, upToMessageId];
    } else {
      sql = `
        UPDATE messages 
        SET status = 'read', updated_at = datetime('now')
        WHERE conversation_id = ? 
          AND sender_id != ?
          AND status != 'read'
          AND is_deleted = 0
      `;
      params = [conversationId, userId];
    }

    const result = this._db.prepare(sql).run(...params);
    cache.invalidatePrefix(`message:conv:${conversationId}`);
    return result.changes;
  }

  /**
   * Soft delete a message.
   */
  softDelete(messageId, userId) {
    const message = this.findById(messageId);
    if (!message || message.sender_id !== userId) return null;

    return this.update(messageId, { is_deleted: 1, content: '[Message deleted]' });
  }

  /**
   * Get unread message count for a user in a conversation.
   */
  getUnreadCount(conversationId, userId, lastReadMessageId) {
    let sql = `
      SELECT COUNT(*) as count FROM messages
      WHERE conversation_id = ? AND sender_id != ?
    `;
    const params = [conversationId, userId];

    if (lastReadMessageId) {
      sql += ` AND created_at > (SELECT created_at FROM messages WHERE id = ?)`;
      params.push(lastReadMessageId);
    }

    return this._db.prepare(sql).get(...params).count;
  }

  /**
   * Find by ID with sender info.
   */
  findByIdWithSender(messageId) {
    const row = this._db.prepare(`
      SELECT m.*, 
             u.username as sender_username,
             u.display_name as sender_display_name,
             u.avatar_url as sender_avatar_url
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(messageId);
    return Message.fromRow(row);
  }
}

module.exports = MessageRepository;
