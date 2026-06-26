// ============================================================================
// src/routes/health.js — Health Check Endpoint
// ============================================================================
// GET /health — Returns system status with dependency checks.
//
// Follows the health check API pattern used by container orchestrators
// (Kubernetes, Docker) for liveness/readiness probes.
// ============================================================================

const { Router } = require('express');
const { getDatabase } = require('../config/database');
const { cache } = require('../infrastructure/cache');
const { messageQueue } = require('../infrastructure/messageQueue');
const logger = require('../infrastructure/logger');

const router = Router();

router.get('/', (req, res) => {
  const checks = {};
  let healthy = true;

  // --- Database Check ---
  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();
    checks.database = { status: 'healthy', latency: '< 1ms' };
  } catch (err) {
    checks.database = { status: 'unhealthy', error: err.message };
    healthy = false;
  }

  // --- Cache Check ---
  try {
    const metrics = cache.getMetrics();
    checks.cache = {
      status: 'healthy',
      size: metrics.size,
      maxSize: metrics.maxSize,
      hitRate: metrics.hitRate,
    };
  } catch (err) {
    checks.cache = { status: 'unhealthy', error: err.message };
    healthy = false;
  }

  // --- Message Queue Check ---
  try {
    const mqMetrics = messageQueue.getMetrics();
    const pending = Object.values(mqMetrics.queueDepths || {}).reduce((a, b) => a + b, 0);
    checks.messageQueue = {
      status: 'healthy',
      pending,
      processed: mqMetrics.processed,
      failed: mqMetrics.failed,
      dlqSize: mqMetrics.dlqSize,
    };
  } catch (err) {
    checks.messageQueue = { status: 'unhealthy', error: err.message };
    healthy = false;
  }

  const statusCode = healthy ? 200 : 503;

  res.status(statusCode).json({
    status: healthy ? 'healthy' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: require('../../package.json').version,
    environment: process.env.NODE_ENV || 'development',
    memory: {
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
    },
    checks,
  });
});

module.exports = router;
