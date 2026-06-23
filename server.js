// ============================================================================
// server.js — Application Entry Point
// ============================================================================
// Bootstraps Express, Socket.IO, database, and implements graceful shutdown.
// This is the composition root where all dependencies are wired together.
// ============================================================================

const http = require('http');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const config = require('./src/config');
const { initializeDatabase, closeDatabase } = require('./src/config/database');
const logger = require('./src/infrastructure/logger');
const { cache } = require('./src/infrastructure/cache');
const { messageQueue } = require('./src/infrastructure/messageQueue');
const eventBus = require('./src/infrastructure/eventBus');

// Route imports
const healthRoutes = require('./src/routes/health');
const v1Routes = require('./src/routes/v1');

// Middleware imports
const { globalErrorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

// WebSocket
const { initializeSocketHandler } = require('./src/websocket/socketHandler');

// ============================================================================
// Application Factory
// ============================================================================

function createApp() {
  const app = express();
  const server = http.createServer(app);

  // --- Socket.IO Setup ---
  const io = new SocketIOServer(server, {
    cors: {
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // --- Global Middleware Pipeline ---
  // Order matters: security → parsing → compression → static → routes → errors

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io", "https://fonts.googleapis.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        imgSrc: ["'self'", "data:", "https:"],
      }
    }
  }));

  // CORS
  app.use(cors({
    origin: config.corsOrigins,
    credentials: true
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Compression
  app.use(compression());

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        ip: req.ip
      });
    });
    next();
  });

  // Static files (frontend)
  app.use(express.static(path.join(__dirname, 'public')));

  // --- Routes ---
  app.use('/health', healthRoutes);
  app.use('/api/v1', v1Routes);

  // SPA fallback — serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // --- Error Handling ---
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  // --- WebSocket Initialization ---
  initializeSocketHandler(io);

  // Store io on app for access in controllers
  app.set('io', io);

  return { app, server, io };
}

// ============================================================================
// Bootstrap
// ============================================================================

async function bootstrap() {
  try {
    // 1. Initialize database
    logger.info('Initializing database...');
    initializeDatabase();
    logger.info('Database initialized successfully');

    // 2. Initialize message queue
    messageQueue.start();
    logger.info('Message queue started');

    // 3. Create app
    const { app, server, io } = createApp();

    // 4. Start listening
    server.listen(config.port, () => {
      logger.info(`🚀 Server listening on port ${config.port}`, {
        port: config.port,
        env: config.env,
        pid: process.pid
      });
      logger.info(`📡 WebSocket server ready`);
      logger.info(`🌐 Open http://localhost:${config.port} in your browser`);
    });

    // 5. Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Close WebSocket connections
      io.close(() => {
        logger.info('WebSocket server closed');
      });

      // Stop message queue
      messageQueue.stop();
      logger.info('Message queue stopped');

      // Clear cache
      cache.clear();
      logger.info('Cache cleared');

      // Close database
      closeDatabase();
      logger.info('Database connection closed');

      // Emit shutdown event
      eventBus.emit('app:shutdown');

      logger.info('Graceful shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection:', { reason: reason?.message || reason });
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
      shutdown('uncaughtException');
    });

  } catch (error) {
    logger.error('Failed to bootstrap application:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

bootstrap();
