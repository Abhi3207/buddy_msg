// ============================================================================
// src/infrastructure/messageQueue.js — In-Process Message Queue
// ============================================================================
// A lightweight, in-process message queue with:
// - FIFO ordering
// - Retry logic with exponential backoff
// - Dead-letter queue (DLQ) for failed messages
// - Pub/Sub topic-based routing
// - Queue depth metrics
//
// In production, this would be replaced by RabbitMQ, Kafka, or AWS SQS.
// ============================================================================

const logger = require('./logger');
const EventEmitter = require('events');

class MessageQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this._maxRetries = options.maxRetries || 3;
    this._retryDelay = options.retryDelay || 1000;
    this._maxQueueSize = options.maxQueueSize || 10000;
    this._processingInterval = options.processingInterval || 100;

    // Topic-based queues
    this._queues = new Map();
    // Dead-letter queue
    this._dlq = [];
    // Registered handlers
    this._handlers = new Map();
    // Processing timer
    this._timer = null;
    // Metrics
    this._metrics = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      deadLettered: 0,
    };
  }

  /**
   * Subscribe a handler to a topic.
   * @param {string} topic
   * @param {Function} handler - async function(payload) 
   */
  subscribe(topic, handler) {
    if (!this._handlers.has(topic)) {
      this._handlers.set(topic, []);
    }
    this._handlers.get(topic).push(handler);
    
    // Ensure queue exists
    if (!this._queues.has(topic)) {
      this._queues.set(topic, []);
    }

    logger.debug(`MessageQueue: subscribed to topic "${topic}"`);
  }

  /**
   * Publish a message to a topic.
   * @param {string} topic
   * @param {*} payload
   * @param {Object} [options]
   */
  publish(topic, payload, options = {}) {
    if (!this._queues.has(topic)) {
      this._queues.set(topic, []);
    }

    const queue = this._queues.get(topic);
    if (queue.length >= this._maxQueueSize) {
      logger.warn(`MessageQueue: queue "${topic}" is full, dropping message`);
      return false;
    }

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      topic,
      payload,
      retries: 0,
      maxRetries: options.maxRetries || this._maxRetries,
      createdAt: Date.now(),
      priority: options.priority || 0,
    };

    queue.push(message);
    this._metrics.enqueued++;
    this.emit('message:enqueued', message);

    return true;
  }

  /**
   * Start processing queues.
   */
  start() {
    if (this._timer) return;

    this._timer = setInterval(() => {
      this._processQueues();
    }, this._processingInterval);

    logger.info('MessageQueue: started processing');
  }

  /**
   * Stop processing queues.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      logger.info('MessageQueue: stopped processing');
    }
  }

  /**
   * Process all topic queues.
   * @private
   */
  async _processQueues() {
    for (const [topic, queue] of this._queues) {
      if (queue.length === 0) continue;

      const handlers = this._handlers.get(topic);
      if (!handlers || handlers.length === 0) continue;

      // Process one message per tick per topic (prevents starvation)
      const message = queue.shift();
      
      try {
        for (const handler of handlers) {
          await handler(message.payload);
        }
        this._metrics.processed++;
        this.emit('message:processed', message);
      } catch (error) {
        message.retries++;
        
        if (message.retries < message.maxRetries) {
          // Retry with exponential backoff
          const delay = this._retryDelay * Math.pow(2, message.retries - 1);
          setTimeout(() => {
            queue.push(message);
          }, delay);
          
          logger.warn(`MessageQueue: retrying message ${message.id} (attempt ${message.retries})`, {
            topic, error: error.message
          });
        } else {
          // Send to dead-letter queue
          this._dlq.push({
            ...message,
            error: error.message,
            deadLetteredAt: Date.now(),
          });
          this._metrics.failed++;
          this._metrics.deadLettered++;
          this.emit('message:dead-lettered', message);
          
          logger.error(`MessageQueue: message ${message.id} moved to DLQ`, {
            topic, error: error.message, retries: message.retries
          });
        }
      }
    }
  }

  /**
   * Get queue metrics.
   */
  getMetrics() {
    const queueDepths = {};
    for (const [topic, queue] of this._queues) {
      queueDepths[topic] = queue.length;
    }
    return {
      ...this._metrics,
      queueDepths,
      dlqSize: this._dlq.length,
      topics: this._queues.size,
    };
  }

  /**
   * Get dead-letter queue contents.
   */
  getDLQ() {
    return [...this._dlq];
  }

  /**
   * Replay a message from DLQ.
   * @param {string} messageId
   */
  replayFromDLQ(messageId) {
    const index = this._dlq.findIndex(m => m.id === messageId);
    if (index === -1) return false;

    const message = this._dlq.splice(index, 1)[0];
    message.retries = 0;
    
    if (!this._queues.has(message.topic)) {
      this._queues.set(message.topic, []);
    }
    this._queues.get(message.topic).push(message);
    
    return true;
  }
}

// Singleton
const config = require('../config');
const messageQueue = new MessageQueue({
  maxRetries: config.messageQueue.maxRetries,
  retryDelay: config.messageQueue.retryDelay,
  maxQueueSize: config.messageQueue.maxQueueSize,
  processingInterval: config.messageQueue.processingInterval,
});

module.exports = { MessageQueue, messageQueue };
