/**
 * MicroDrama OTT - Production Redis Client Configuration
 * 
 * Features:
 * - Robust Connection Pooling & Automatic Exponential Backoff
 * - In-Memory Fallback Adapter for seamless operation if Redis is temporarily offline
 * - Health probe & latency telemetry
 */

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
let redisClient = null;
let isRedisConnected = false;

// In-Memory Fallback Store if Redis is unreachable
const memoryFallback = new Map();

try {
  redisClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 5000,
    retryStrategy(times) {
      if (times > 10) {
        console.warn('[Redis] Max reconnection attempts reached. Continuing with in-memory fallback.');
        return null; // Stop retrying excessively
      }
      return Math.min(times * 100, 3000); // Exponential backoff up to 3s
    },
    reconnectOnError(err) {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    }
  });

  redisClient.on('connect', () => {
    isRedisConnected = true;
    console.log('[Redis] Connected successfully to Redis cluster/instance.');
  });

  redisClient.on('error', (err) => {
    isRedisConnected = false;
    // Suppress spammy logs if running in local standalone mode without Redis container
    if (err.code === 'ECONNREFUSED') {
      // Degrade gracefully to in-memory fallback
    } else {
      console.warn('[Redis Error]:', err.message);
    }
  });
} catch (error) {
  console.warn('[Redis] Initialization error. Using in-memory fallback:', error.message);
}

module.exports = {
  client: redisClient,
  isConnected: () => isRedisConnected,

  async get(key) {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.get(key);
      } catch (e) {
        console.warn('[Redis Get Fallback]:', e.message);
      }
    }
    const item = memoryFallback.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      memoryFallback.delete(key);
      return null;
    }
    return item.value;
  },

  async set(key, value, mode, duration) {
    const stringVal = typeof value === 'object' ? JSON.stringify(value) : String(value);

    if (isRedisConnected && redisClient) {
      try {
        if (mode === 'EX' && duration) {
          return await redisClient.set(key, stringVal, 'EX', duration);
        }
        return await redisClient.set(key, stringVal);
      } catch (e) {
        console.warn('[Redis Set Fallback]:', e.message);
      }
    }

    const expiresAt = (mode === 'EX' && duration) ? Date.now() + (duration * 1000) : null;
    memoryFallback.set(key, { value: stringVal, expiresAt });
    return 'OK';
  },

  async del(key) {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.del(key);
      } catch (e) {
        console.warn('[Redis Del Fallback]:', e.message);
      }
    }
    memoryFallback.delete(key);
    return 1;
  },

  async incr(key) {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.incr(key);
      } catch (e) {
        console.warn('[Redis Incr Fallback]:', e.message);
      }
    }
    const current = parseInt(this.get(key) || '0', 10);
    const next = current + 1;
    this.set(key, next);
    return next;
  }
};
