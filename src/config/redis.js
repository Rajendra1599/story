/**
 * MicroDrama OTT - Production Redis / Upstash Client Configuration
 * 
 * Features:
 * - Upstash Redis & AWS ElastiCache compatibility (TLS rediss:// support)
 * - Robust Connection Pooling & Automatic Exponential Backoff
 * - In-Memory Fallback Adapter for graceful degradation if Redis is offline
 * - Health probe & prefix-based cache invalidation
 */

const Redis = require('ioredis');

const REDIS_URL = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
let redisClient = null;
let isRedisConnected = false;

// In-Memory Fallback Store if Redis is unreachable
const memoryFallback = new Map();

try {
  const isTls = REDIS_URL.startsWith('rediss://');
  const redisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 5000,
    retryStrategy(times) {
      if (times > 10) {
        return null; // Stop retrying excessively; continue on fallback
      }
      return Math.min(times * 150, 3000); // Exponential backoff up to 3s
    },
    reconnectOnError(err) {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    }
  };

  if (isTls) {
    redisOptions.tls = {
      rejectUnauthorized: process.env.NODE_ENV === 'production' && !REDIS_URL.includes('upstash.io')
    };
  }

  redisClient = new Redis(REDIS_URL, redisOptions);

  redisClient.on('connect', () => {
    isRedisConnected = true;
    console.log('[Redis] Connected successfully to Redis / Upstash cluster.');
  });

  redisClient.on('ready', () => {
    isRedisConnected = true;
  });

  redisClient.on('error', (err) => {
    isRedisConnected = false;
    // Suppress repeated spam if running in local standalone dev mode without Redis daemon
    if (err.code !== 'ECONNREFUSED' && err.code !== 'ETIMEDOUT') {
      console.warn('[Redis Alert]:', err.message);
    }
  });

  redisClient.on('close', () => {
    isRedisConnected = false;
  });
} catch (error) {
  console.warn('[Redis] Initialization fallback to in-memory store:', error.message);
}

module.exports = {
  client: redisClient,
  isConnected: () => isRedisConnected,

  async get(key) {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.get(key);
      } catch (e) {
        // Fall through to memory
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
        // Fall through to memory
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
        // Fall through to memory
      }
    }
    memoryFallback.delete(key);
    return 1;
  },

  async delByPrefix(prefix) {
    if (isRedisConnected && redisClient) {
      try {
        const keys = await redisClient.keys(`${prefix}*`);
        if (keys && keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch (e) {
        console.warn('[Redis] delByPrefix error:', e.message);
      }
    }

    // Always clean in-memory fallback
    for (const k of memoryFallback.keys()) {
      if (k.startsWith(prefix)) {
        memoryFallback.delete(k);
      }
    }
    return true;
  },

  async incr(key) {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.incr(key);
      } catch (e) {
        // Fall through to memory
      }
    }
    const current = parseInt(this.get(key) || '0', 10);
    const next = current + 1;
    this.set(key, next);
    return next;
  }
};
