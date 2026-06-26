// ============================================================================
// src/infrastructure/eventBus.js — Application Event Bus
// ============================================================================
// Central event bus for loose coupling between application components.
// Uses Node.js built-in EventEmitter with enhanced error handling.
//
// Events:
//   user:registered, user:login, user:status-changed
//   message:sent, message:delivered, message:read
//   conversation:created, conversation:updated
//   app:shutdown
// ============================================================================

const EventEmitter = require('events');
const logger = require('./logger');

class ApplicationEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Increase from default 10

    // Use super.on() to avoid the wrapped handler (which would swallow context)
    super.on('error', (error) => {
      logger.error('EventBus error:', { error: error.message, stack: error.stack });
    });
  }

  /**
   * Emit an event with logging.
   * @param {string} event
   * @param  {...any} args
   */
  emitEvent(event, ...args) {
    logger.debug(`EventBus: emitting "${event}"`, {
      listenerCount: this.listenerCount(event)
    });
    return this.emit(event, ...args);
  }

  /**
   * Subscribe to an event with error wrapping.
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    const wrappedHandler = async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        logger.error(`EventBus: handler error for "${event}"`, {
          error: error.message,
          stack: error.stack
        });
      }
    };
    return super.on(event, wrappedHandler);
  }

  /**
   * Get all registered events and their listener counts.
   */
  getStatus() {
    const events = {};
    for (const event of this.eventNames()) {
      events[event] = this.listenerCount(event);
    }
    return { events, totalListeners: Object.values(events).reduce((a, b) => a + b, 0) };
  }
}

// Singleton
const eventBus = new ApplicationEventBus();

module.exports = eventBus;
