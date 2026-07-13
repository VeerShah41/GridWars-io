// GridWars — Chat Manager
// Simple in-memory chat with history

const { MAX_CHAT_HISTORY } = require('./constants');

class ChatManager {
  constructor() {
    this.messages = [];
    this.io = null;
  }

  init(io) {
    this.io = io;
  }

  addMessage(user, text) {
    if (!text || text.trim().length === 0) return null;
    if (text.length > 200) text = text.substring(0, 200); // Limit length

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      userName: user.name,
      color: user.color,
      avatar: user.avatar,
      text: text.trim(),
      timestamp: Date.now(),
    };

    this.messages.push(message);

    // Trim history
    if (this.messages.length > MAX_CHAT_HISTORY) {
      this.messages = this.messages.slice(-MAX_CHAT_HISTORY);
    }

    // Broadcast
    if (this.io) {
      this.io.emit('chat-message', message);
    }

    return message;
  }

  getHistory() {
    return this.messages;
  }

  clear() {
    this.messages = [];
  }
}

module.exports = new ChatManager();
