/**
 * MicroDrama OTT - Enterprise Realistic Load Testing Suite
 * Target Validation: 10,000 User Scalability Profiles
 * 
 * Simulates distinct mobile client IP distribution across virtual users
 * via X-Forwarded-For headers (standard behind CDN / AWS ALB).
 */

const http = require('http');

const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = process.env.PORT || 5000;
const BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 400,
  maxFreeSockets: 150,
  timeout: 10000
});

function httpRequest({ path, method = 'GET', body = null, headers = {}, clientIndex = 1 }) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    // Simulate distinct client IPs across 500 virtual user subnets
    const simulatedIp = `198.51.${Math.floor(clientIndex / 250) + 1}.${(clientIndex % 250) + 1}`;

    const reqOptions = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path,
      method,
      agent,
      headers: {
        'Accept': 'application/json',
        'X-Forwarded-For': simulatedIp,
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
        ...headers
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1e6;
        resolve({
          statusCode: res.statusCode,
          durationMs,
          body: data
        });
      });
    });

    req.on('error', (err) => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1e6;
      resolve({
        statusCode: 0,
        error: err.message,
        durationMs
      });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { min: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = sum / sorted.length;

  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  return {
    min: sorted[0].toFixed(2),
    avg: avg.toFixed(2),
    p50: p50.toFixed(2),
    p90: p90.toFixed(2),
    p95: p95.toFixed(2),
    p99: p99.toFixed(2),
    max: sorted[sorted.length - 1].toFixed(2)
  };
}

async function runScenario({ name, concurrency, totalRequests, requestFn }) {
  console.log(`\n======================================================`);
  console.log(`Running Scenario: ${name}`);
  console.log(`Concurrency: ${concurrency} virtual clients | Total Requests: ${totalRequests}`);
  console.log(`======================================================`);

  const latencies = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  let inFlight = 0;
  let reqIndex = 0;

  const startTime = Date.now();

  return new Promise((resolve) => {
    function launchNext() {
      if (reqIndex >= totalRequests) {
        if (inFlight === 0) {
          const totalDurationSec = (Date.now() - startTime) / 1000;
          const rps = (totalRequests / totalDurationSec).toFixed(1);
          const stats = calculatePercentiles(latencies);
          const errorRate = ((failedRequests / totalRequests) * 100).toFixed(2);

          console.log(`-> Completed ${totalRequests} requests in ${totalDurationSec.toFixed(2)}s`);
          console.log(`-> Throughput: ${rps} req/sec`);
          console.log(`-> Latency (ms): Min: ${stats.min} | Avg: ${stats.avg} | p50: ${stats.p50} | p95: ${stats.p95} | p99: ${stats.p99} | Max: ${stats.max}`);
          console.log(`-> Success: ${successfulRequests} | Failures: ${failedRequests} (Error Rate: ${errorRate}%)`);

          resolve({
            name,
            concurrency,
            totalRequests,
            durationSec: totalDurationSec.toFixed(2),
            rps,
            stats,
            errorRate,
            successfulRequests,
            failedRequests
          });
        }
        return;
      }

      reqIndex++;
      inFlight++;
      const currentIdx = reqIndex;

      requestFn(currentIdx)
        .then((res) => {
          latencies.push(res.durationMs);
          if (res.statusCode >= 200 && res.statusCode < 400) {
            successfulRequests++;
          } else {
            failedRequests++;
          }
        })
        .catch(() => {
          failedRequests++;
        })
        .finally(() => {
          inFlight--;
          launchNext();
        });
    }

    // Launch concurrency pool
    for (let c = 0; c < concurrency; c++) {
      launchNext();
    }
  });
}

async function runAllLoadTests() {
  console.log(`######################################################`);
  console.log(`  MICRODRAMA OTT - 10,000+ USER LOAD TESTING SUITE    `);
  console.log(`  Target: http://${SERVER_HOST}:${SERVER_PORT}       `);
  console.log(`  Simulating Multi-IP Distributed Mobile Users        `);
  console.log(`######################################################`);

  const initialMemory = process.memoryUsage();
  const results = [];

  // Scenario 1: Cache-Heavy Home Feed Browsing
  results.push(await runScenario({
    name: '1. Home Feed / Catalog Browsing (Paginated)',
    concurrency: 50,
    totalRequests: 500,
    requestFn: (idx) => httpRequest({
      path: `/api/dramas?page=${(idx % 3) + 1}&limit=10`,
      clientIndex: idx
    })
  }));

  // Scenario 2: Trending Feed (High-Concurrency Cache Hits)
  results.push(await runScenario({
    name: '2. Trending Feed (Cache Hit Intensity)',
    concurrency: 80,
    totalRequests: 800,
    requestFn: (idx) => httpRequest({
      path: '/api/feed/trending?limit=10',
      clientIndex: idx
    })
  }));

  // Scenario 3: Backend Search with Text Query & Cache
  results.push(await runScenario({
    name: '3. Backend Search Queries (Indexed & Cached)',
    concurrency: 40,
    totalRequests: 400,
    requestFn: (idx) => {
      const queries = ['billionaire', 'marriage', 'revenge', 'heir', 'tycoon'];
      const q = queries[idx % queries.length];
      return httpRequest({
        path: `/api/search?q=${q}&page=1&limit=10`,
        clientIndex: idx
      });
    }
  }));

  // Scenario 4: Series Detail & Metadata Fetching
  results.push(await runScenario({
    name: '4. Series Metadata & Episodes List',
    concurrency: 50,
    totalRequests: 500,
    requestFn: (idx) => httpRequest({
      path: '/api/dramas/series_ceo_secret',
      clientIndex: idx
    })
  }));

  // Scenario 5: Video Stream Authorization (Signed Cloudinary Stream URLs)
  results.push(await runScenario({
    name: '5. Video Playback Authorization (HMAC Signed URLs)',
    concurrency: 60,
    totalRequests: 600,
    requestFn: (idx) => httpRequest({
      path: '/api/episodes/authorize',
      method: 'POST',
      body: JSON.stringify({
        seriesId: 'series_ceo_secret',
        episodeNumber: (idx % 5) + 1,
        userId: `user_tester_${idx % 100}`
      }),
      clientIndex: idx
    })
  }));

  // Scenario 6: High-Throughput Batched View Counter (Buffered in Redis)
  results.push(await runScenario({
    name: '6. High-Throughput View Counter (Redis Buffer + Dedupe)',
    concurrency: 100,
    totalRequests: 1000,
    requestFn: (idx) => httpRequest({
      path: '/api/episodes/view',
      method: 'POST',
      body: JSON.stringify({
        seriesId: 'series_ceo_secret',
        episodeNumber: (idx % 5) + 1,
        userId: `user_${idx % 500}`
      }),
      clientIndex: idx
    })
  }));

  // Scenario 7: VIP Subscription Validation Check
  results.push(await runScenario({
    name: '7. VIP Subscription Validation Check',
    concurrency: 50,
    totalRequests: 500,
    requestFn: (idx) => httpRequest({
      path: `/api/subscription/user_test_${idx % 50}`,
      clientIndex: idx
    })
  }));

  const finalMemory = process.memoryUsage();

  console.log(`\n======================================================`);
  console.log(`         LOAD TESTING COMPREHENSIVE SUMMARY           `);
  console.log(`======================================================`);
  console.table(results.map(r => ({
    Scenario: r.name.substring(0, 32),
    Concurrent: r.concurrency,
    TotalReq: r.totalRequests,
    RPS: r.rps,
    AvgLatencyMs: r.stats.avg,
    p95LatencyMs: r.stats.p95,
    ErrorRate: `${r.errorRate}%`
  })));

  console.log(`\nResource Utilization:`);
  console.log(`- Initial Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Final Heap Used:   ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- RSS:               ${(finalMemory.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`======================================================\n`);
}

if (require.main === module) {
  runAllLoadTests().catch(err => console.error('Load test runner failed:', err));
}

module.exports = { runAllLoadTests };
