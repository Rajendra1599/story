/**
 * MicroDrama OTT - Prometheus Telemetry & Observability Middleware
 * 
 * Tracks:
 * - HTTP Request Latency (p50, p95, p99)
 * - Error Rates (4xx, 5xx)
 * - Process Heap Memory, CPU, and Event Loop Lag
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
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

// Total Requests Counter
const httpRequestsTotal = new client.Counter({
  name: 'microdrama_http_requests_total',
  help: 'Total number of HTTP requests handled',
  labelNames: ['method', 'route', 'status_code']
});

module.exports = {
  // Middleware to measure latency
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

  // Handler for /metrics endpoint
  async getMetricsHandler(req, res) {
    res.setHeader('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.send(metrics);
  }
};
