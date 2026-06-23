// ============================================================================
// src/models/Message.js — Message Model / DTO
// ============================================================================

const MESSAGE_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
};

const MESSAGE_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  SYSTEM: 'system',
};

class Message {
  constructor(data = {}) {
    this.id = data.id;
    this.conversationId = data.conversation_id || data.conversationId;
    this.senderId = data.sender_id || data.senderId;
    this.content = data.content;
    this.type = data.type || MESSAGE_TYPE.TEXT;
    this.status = data.status || MESSAGE_STATUS.SENT;
    this.parentMessageId = data.parent_message_id || data.parentMessageId || null;
    this.isEdited = !!(data.is_edited || data.isEdited);
    this.isDeleted = !!(data.is_deleted || data.isDeleted);
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;

    // Populated via JOINs
    this.senderUsername = data.sender_username || data.senderUsername;
    this.senderDisplayName = data.sender_display_name || data.senderDisplayName;
    this.senderAvatarUrl = data.sender_avatar_url || data.senderAvatarUrl;
  }

  toJSON() {
    const json = {
      id: this.id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.isDeleted ? '[Message deleted]' : this.content,
      type: this.type,
      status: this.status,
      parentMessageId: this.parentMessageId,
      isEdited: this.isEdited,
      isDeleted: this.isDeleted,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };

    if (this.senderUsername) {
      json.sender = {
        id: this.senderId,
        username: this.senderUsername,
        displayName: this.senderDisplayName,
        avatarUrl: this.senderAvatarUrl,
      };
    }

    return json;
  }

  toRow() {
    return {
      id: this.id,
      conversation_id: this.conversationId,
      sender_id: this.senderId,
      content: this.content,
      type: this.type,
      status: this.status,
      parent_message_id: this.parentMessageId,
      is_edited: this.isEdited ? 1 : 0,
      is_deleted: this.isDeleted ? 1 : 0,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }

  static fromRow(row) {
    return row ? new Message(row) : null;
  }
}

module.exports = { Message, MESSAGE_STATUS, MESSAGE_TYPE };
