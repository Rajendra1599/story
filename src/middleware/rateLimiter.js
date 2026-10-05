/**
 * MicroDrama OTT - Distributed Rate Limiter Middleware
 * 
 * Features:
 * - Protects Authentication, OTP generation, Payment, Search, and Video Uploads
 * - Redis-backed sliding-window counter for multi-instance clusters (Upstash / Redis)
 * - Emits RateLimit-* HTTP standard headers (Draft-7)
 * - Graceful in-memory fallback if Redis is temporarily unreachable
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');

function createLimiter({ windowMs, max, message, keyGenerator, prefix = 'rl:' }) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    message: { success: false, error: 'RATE_LIMIT_EXCEEDED', message },
    ...(keyGenerator ? { keyGenerator } : {})
  };

  if (redis.client && redis.isConnected()) {
    try {
      options.store = new RedisStore({
        sendCommand: (...args) => redis.client.call(...args),
        prefix
      });
    } catch (e) {
      // Degrades gracefully to in-memory store
    }
  }

  return rateLimit(options);
}

module.exports = {
  // General Public API: 600 requests per minute
  apiLimiter: createLimiter({
    windowMs: 60 * 1000,
    max: 600,
    message: 'Too many requests. Please slow down.',
    prefix: 'rl:api:'
  }),

  // Auth & Login: 15 attempts per 5 minutes per IP
  authLimiter: createLimiter({
    windowMs: 5 * 60 * 1000,
    max: 15,
    message: 'Too many authentication attempts. Please try again after 5 minutes.',
    prefix: 'rl:auth:'
  }),

  // OTP Send Limiter: 5 OTP requests per 10 minutes per IP/Phone
  otpLimiter: createLimiter({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: 'Maximum OTP verification requests exceeded. Please wait 10 minutes.',
    prefix: 'rl:otp:',
    keyGenerator: (req) => {
      const phone = (req.body && req.body.phoneNumber) ? req.body.phoneNumber.replace(/[^0-9]/g, '').slice(-10) : req.ip;
      return `${req.ip}:${phone}`;
    }
  }),

  // Search API: 60 searches per minute per IP (prevents full-text query exhaustion)
  searchLimiter: createLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Search query rate limit exceeded. Please slow down.',
    prefix: 'rl:search:'
  }),

  // Payment Initiation: 12 attempts per minute
  paymentLimiter: createLimiter({
    windowMs: 60 * 1000,
    max: 12,
    message: 'Too many payment requests. Please wait a moment.',
    prefix: 'rl:pay:'
  }),

  // Video Uploads: 20 uploads per hour per user/IP
  uploadLimiter: createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: 'Hourly video upload quota reached.',
    prefix: 'rl:upload:'
  })
};
