/**
 * MicroDrama OTT - Prometheus Telemetry & Observability Middleware
 * 
 * Tracks:
 * - HTTP Request Latency (p50, p95, p99)
 * - Error Rates (4xx, 5xx)
 * - Process Heap Memory, CPU, and Event Loop Lag
 * - Cache Hit / Miss Ratio (Redis)
 * - Database Query Latency
 * - Authentication Failure Counters
 * - Exposes /metrics for Prometheus scraping
 */

const client = require('prom-client');

// Collect default Node runtime metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'microdrama_' });

// HTTP Request Duration Histogram
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'microdrama_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

// Total Requests Counter
const httpRequestsTotal = new client.Counter({
  name: 'microdrama_http_requests_total',
  help: 'Total number of HTTP requests handled',
  labelNames: ['method', 'route', 'status_code']
});

// Cache Hit / Miss Counters
const cacheHitsTotal = new client.Counter({
  name: 'microdrama_cache_hits_total',
  help: 'Total number of Redis cache hits',
  labelNames: ['cache_type']
});

const cacheMissesTotal = new client.Counter({
  name: 'microdrama_cache_misses_total',
  help: 'Total number of Redis cache misses',
  labelNames: ['cache_type']
});

// Database Query Duration Histogram
const dbQueryDurationSeconds = new client.Histogram({
  name: 'microdrama_db_query_duration_seconds',
  help: 'Database query execution time in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2]
});

// Authentication Failures Counter
const authFailuresTotal = new client.Counter({
  name: 'microdrama_auth_failures_total',
  help: 'Total number of failed authentication attempts',
  labelNames: ['reason']
});

module.exports = {
  // Middleware to measure HTTP request latency & counts
  metricsMiddleware(req, res, next) {
    const start = process.hrtime();

    res.on('finish', () => {
      const diff = process.hrtime(start);
      const durationInSeconds = diff[0] + diff[1] / 1e9;
      const route = req.route ? req.route.path : req.path;

      httpRequestDurationMicroseconds
        .labels(req.method, route, res.statusCode)
        .observe(durationInSeconds);

      httpRequestsTotal
        .labels(req.method, route, res.statusCode)
        .inc();
    });

    next();
  },

  // Observability Helper Functions
  recordCacheHit(cacheType = 'general') {
    cacheHitsTotal.labels(cacheType).inc();
  },

  recordCacheMiss(cacheType = 'general') {
    cacheMissesTotal.labels(cacheType).inc();
  },

  recordDbQuery(operation, collection, durationSeconds) {
    dbQueryDurationSeconds.labels(operation, collection).observe(durationSeconds);
  },

  recordAuthFailure(reason = 'invalid_credentials') {
    authFailuresTotal.labels(reason).inc();
  },

  // Handler for /metrics endpoint
  async getMetricsHandler(req, res) {
    res.setHeader('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.send(metrics);
  }
};
