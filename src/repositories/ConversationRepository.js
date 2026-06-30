// ============================================================================
// src/repositories/ConversationRepository.js
// ============================================================================

const BaseRepository = require('./BaseRepository');
const { Conversation } = require('../models/Conversation');
const { Message } = require('../models/Message');
const { cache } = require('../infrastructure/cache');

class ConversationRepository extends BaseRepository {
  constructor(db) {
    super(db, 'conversations', 'conversation');
  }

  /**
   * Get all conversations for a user, with last message and unread count.
   * This is the main query powering the sidebar conversation list.
   */
  getByUserId(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const cacheKey = `conversation:list:${userId}:${limit}:${offset}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const conversations = this._db.prepare(`
      SELECT 
        c.*,
        m.content as last_message_content,
        m.sender_id as last_message_sender_id,
        m.created_at as last_message_created_at,
        m.type as last_message_type,
        sender.username as last_message_sender_username
      FROM conversations c
      INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
      LEFT JOIN messages m ON c.last_message_id = m.id
      LEFT JOIN users sender ON m.sender_id = sender.id
      WHERE cp.user_id = ?
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    if (conversations.length === 0) {
      cache.set(cacheKey, [], 30);
      return [];
    }

    // Batch-fetch participants for all conversations in a single query
    const convIds = conversations.map(c => c.id);
    const placeholders = convIds.map(() => '?').join(',');

    const allParticipants = this._db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, cp.role, cp.conversation_id
      FROM conversation_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.conversation_id IN (${placeholders})
    `).all(...convIds);

    // Group participants by conversation_id
    const participantsByConv = new Map();
    for (const p of allParticipants) {
      if (!participantsByConv.has(p.conversation_id)) {
        participantsByConv.set(p.conversation_id, []);
      }
      participantsByConv.get(p.conversation_id).push({
        id: p.id,
        username: p.username,
        displayName: p.display_name,
        avatarUrl: p.avatar_url,
        status: p.status,
        role: p.role,
      });
    }

    // Batch-fetch last_read_message_id for the current user across all conversations
    const allLastReads = this._db.prepare(`
      SELECT conversation_id, last_read_message_id
      FROM conversation_participants
      WHERE user_id = ? AND conversation_id IN (${placeholders})
    `).all(userId, ...convIds);

    const lastReadByConv = new Map();
    for (const lr of allLastReads) {
      lastReadByConv.set(lr.conversation_id, lr.last_read_message_id);
    }

    // Enrich each conversation
    const result = conversations.map(conv => {
      // Calculate unread count
      let unreadCount = 0;
      const lastReadId = lastReadByConv.get(conv.id);
      if (lastReadId) {
        unreadCount = this._db.prepare(`
          SELECT COUNT(*) as count FROM messages
          WHERE conversation_id = ? AND sender_id != ?
            AND created_at > (SELECT created_at FROM messages WHERE id = ?)
        `).get(conv.id, userId, lastReadId).count;
      } else {
        unreadCount = this._db.prepare(`
          SELECT COUNT(*) as count FROM messages
          WHERE conversation_id = ? AND sender_id != ?
        `).get(conv.id, userId).count;
      }

      const conversation = new Conversation({
        ...conv,
        participants: participantsByConv.get(conv.id) || [],
        unreadCount,
      });

      // Attach last message data
      if (conv.last_message_content) {
        conversation.lastMessage = {
          content: conv.last_message_content,
          senderId: conv.last_message_sender_id,
          senderUsername: conv.last_message_sender_username,
          createdAt: conv.last_message_created_at,
          type: conv.last_message_type,
        };
      }

      return conversation.toJSON();
    });

    cache.set(cacheKey, result, 30); // Cache for 30 seconds
    return result;
  }

  /**
   * Find an existing direct conversation between two users.
   */
  findDirectConversation(userId1, userId2) {
    const row = this._db.prepare(`
      SELECT c.* FROM conversations c
      INNER JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = ?
      INNER JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = ?
      WHERE c.type = 'direct'
      LIMIT 1
    `).get(userId1, userId2);

    return Conversation.fromRow(row);
  }

  /**
   * Create a conversation with participants (transactional).
   */
  createWithParticipants(conversationData, participantIds) {
    return this.transaction(() => {
      // Insert conversation
      this._db.prepare(`
        INSERT INTO conversations (id, type, name, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        conversationData.id,
        conversationData.type,
        conversationData.name || null,
        conversationData.createdBy
      );

      // Insert participants
      const insertParticipant = this._db.prepare(`
        INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
        VALUES (?, ?, ?, datetime('now'))
      `);

      for (const userId of participantIds) {
        const role = userId === conversationData.createdBy ? 'admin' : 'member';
        insertParticipant.run(conversationData.id, userId, role);
      }

      // Invalidate list caches for all participants
      for (const userId of participantIds) {
        cache.invalidatePrefix(`conversation:list:${userId}`);
      }

      return this.findById(conversationData.id);
    });
  }

  /**
   * Add a participant to a conversation.
   */
  addParticipant(conversationId, userId, role = 'member') {
    this._db.prepare(`
      INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, role, joined_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(conversationId, userId, role);

    cache.invalidatePrefix(`conversation:list:${userId}`);
    cache.delete(`conversation:${conversationId}`);
  }

  /**
   * Remove a participant from a conversation.
   */
  removeParticipant(conversationId, userId) {
    this._db.prepare(`
      DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?
    `).run(conversationId, userId);

    cache.invalidatePrefix(`conversation:list:${userId}`);
    cache.delete(`conversation:${conversationId}`);
  }

  /**
   * Get participant IDs for a conversation.
   */
  getParticipantIds(conversationId) {
    const cacheKey = `conversation:participants:${conversationId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const rows = this._db.prepare(`
      SELECT user_id FROM conversation_participants WHERE conversation_id = ?
    `).all(conversationId);

    const ids = rows.map(r => r.user_id);
    cache.set(cacheKey, ids, 60);
    return ids;
  }

  /**
   * Check if a user is a participant in a conversation.
   */
  isParticipant(conversationId, userId) {
    const row = this._db.prepare(`
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = ? AND user_id = ?
    `).get(conversationId, userId);

    return !!row;
  }

  /**
   * Update the last message on a conversation.
   */
  updateLastMessage(conversationId, messageId) {
    this._db.prepare(`
      UPDATE conversations 
      SET last_message_id = ?, last_message_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(messageId, conversationId);

    cache.delete(`conversation:${conversationId}`);
    cache.invalidatePrefix('conversation:list');
  }

  /**
   * Update the last read message for a user in a conversation.
   */
  updateLastRead(conversationId, userId, messageId) {
    this._db.prepare(`
      UPDATE conversation_participants 
      SET last_read_message_id = ?
      WHERE conversation_id = ? AND user_id = ?
    `).run(messageId, conversationId, userId);

    cache.invalidatePrefix(`conversation:list:${userId}`);
  }

  /**
   * Get conversation by ID with participants.
   */
  findByIdWithParticipants(conversationId) {
    const conv = super.findById(conversationId);
    if (!conv) return null;

    const participants = this._db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, cp.role
      FROM conversation_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.conversation_id = ?
    `).all(conversationId);

    const conversation = new Conversation(conv);
    conversation.participants = participants.map(p => ({
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      status: p.status,
      role: p.role,
    }));

    return conversation.toJSON();
  }
}

module.exports = ConversationRepository;
