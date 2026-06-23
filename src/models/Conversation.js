// ============================================================================
// src/models/Conversation.js — Conversation Model / DTO
// ============================================================================

const CONVERSATION_TYPE = {
  DIRECT: 'direct',
  GROUP: 'group',
};

class Conversation {
  constructor(data = {}) {
    this.id = data.id;
    this.type = data.type || CONVERSATION_TYPE.DIRECT;
    this.name = data.name || null;
    this.createdBy = data.created_by || data.createdBy;
    this.lastMessageId = data.last_message_id || data.lastMessageId;
    this.lastMessageAt = data.last_message_at || data.lastMessageAt;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;

    // Populated via JOINs
    this.participants = data.participants || [];
    this.lastMessage = data.lastMessage || null;
    this.unreadCount = data.unreadCount || data.unread_count || 0;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      createdBy: this.createdBy,
      lastMessageAt: this.lastMessageAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      participants: this.participants,
      lastMessage: this.lastMessage,
      unreadCount: this.unreadCount,
    };
  }

  toRow() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      created_by: this.createdBy,
      last_message_id: this.lastMessageId,
      last_message_at: this.lastMessageAt,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }

  static fromRow(row) {
    return row ? new Conversation(row) : null;
  }
}

module.exports = { Conversation, CONVERSATION_TYPE };
