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

    // Map original handlers → wrapped handlers so removeListener works
    this._handlerMap = new WeakMap();

    // Use super.on() to avoid the wrapped handler (which would swallow context)
    super.on('error', (error) => {
      logger.error('EventBus error:', { error: error.message, stack: error.stack });
    });
  }

  /**
   * Emit an event with logging.
   * Overrides EventEmitter.emit() so all emit calls (including direct ones)
   * are logged consistently.
   * @param {string} event
   * @param  {...any} args
   */
  emit(event, ...args) {
    // Don't log internal EventEmitter events to avoid noise
    if (event !== 'error' && event !== 'newListener' && event !== 'removeListener') {
      logger.debug(`EventBus: emitting "${event}"`, {
        listenerCount: this.listenerCount(event)
      });
    }
    return super.emit(event, ...args);
  }

  /**
   * Subscribe to an event with error wrapping.
   * Stores a mapping from the original handler to the wrapped version
   * so that off()/removeListener() works correctly.
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
    this._handlerMap.set(handler, wrappedHandler);
    return super.on(event, wrappedHandler);
  }

  /**
   * Subscribe to a one-time event with error wrapping.
   * @param {string} event
   * @param {Function} handler
   */
  once(event, handler) {
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
    return super.once(event, wrappedHandler);
  }

  /**
   * Remove a previously registered handler.
   * Resolves the original handler to its wrapped version.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const wrapped = this._handlerMap.get(handler);
    if (wrapped) {
      this._handlerMap.delete(handler);
      return super.off(event, wrapped);
    }
    return super.off(event, handler);
  }

  /**
   * Alias for off() — ensures removeListener also resolves wrapped handlers.
   */
  removeListener(event, handler) {
    return this.off(event, handler);
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
