/**
 * MicroDrama OTT - Production Structured Logger (Winston)
 * 
 * Features:
 * - JSON formatted logs for Datadog / CloudWatch / ELK Stack
 * - Automatic PII and credential redaction (passwords, OTPs, auth tokens, secrets)
 * - Request ID correlation support
 */

const winston = require('winston');

// Sensitive field names to redact
const SENSITIVE_FIELDS = [
  'password',
  'otp',
  'devOtp',
  'token',
  'authorization',
  'saltKey',
  'secret',
  'xVerifyChecksum',
  'base64Payload'
];

/**
 * Deep redaction of sensitive object keys
 */
function redactSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitiveData);

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = redactSensitiveData(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

const customFormat = winston.format.printf(({ level, message, timestamp, requestId, ...metadata }) => {
  const cleanMeta = redactSensitiveData(metadata);
  const logObject = {
    timestamp,
    level,
    message,
    ...(requestId ? { requestId } : {}),
    ...(Object.keys(cleanMeta).length > 0 ? { metadata: cleanMeta } : {})
  };
  return JSON.stringify(logObject);
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  defaultMeta: { service: 'microdrama-api', environment: process.env.NODE_ENV || 'production' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development'
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, requestId }) => {
              const req = requestId ? ` [${requestId}]` : '';
              return `${timestamp} ${level}:${req} ${message}`;
            })
          )
        : customFormat
    })
  ]
});

module.exports = logger;
