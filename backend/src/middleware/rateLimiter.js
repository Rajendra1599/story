/**
 * MicroDrama OTT - Distributed Rate Limiter Middleware
 * 
 * Features:
 * - Protects Authentication, Payment Initiation, and Video Uploads
 * - Redis-backed sliding-window counter for multi-instance clusters
 * - Emits RateLimit-* HTTP standard headers
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');

function createLimiter(windowMs, max, message) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'RATE_LIMIT_EXCEEDED', message }
  };

  if (redis.client && redis.isConnected()) {
    try {
      options.store = new RedisStore({
        sendCommand: (...args) => redis.client.call(...args),
        prefix: 'rl:'
      });
    } catch (e) {
      // Fallback to in-memory
    }
  }

  return rateLimit(options);
}

module.exports = {
  // General API: 600 requests per minute
  apiLimiter: createLimiter(60 * 1000, 600, 'Too many requests. Please slow down.'),

  // Auth & OTP: 15 attempts per 5 minutes
  authLimiter: createLimiter(5 * 60 * 1000, 15, 'Too many authentication attempts. Please try again later.'),

  // Payment: 12 attempts per minute
  paymentLimiter: createLimiter(60 * 1000, 12, 'Too many payment requests. Please wait a moment.'),

  // Video Upload: 20 uploads per hour
  uploadLimiter: createLimiter(60 * 60 * 1000, 20, 'Hourly video upload limit reached.')
};
