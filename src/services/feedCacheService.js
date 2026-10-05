/**
 * MicroDrama OTT - Scalable Feed & Drama Catalog Cache Service (Upstash Redis)
 * 
 * Features:
 * - Cache-Aside pattern with Upstash / Redis
 * - Paginated cache key namespaces (prevents giant single-key bottlenecks)
 * - Cache stampede mitigation via reasonable short-to-medium TTLs
 * - Cache hit/miss observability telemetry
 * - Instant prefix-based invalidation upon new drama/episode publish
 */

const redis = require('../config/redis');
const db = require('../config/db');
const { recordCacheHit, recordCacheMiss } = require('../middleware/metrics');

const CATALOG_PREFIX = 'cache:dramas:catalog';
const TRENDING_PREFIX = 'cache:dramas:trending';
const SEARCH_PREFIX = 'cache:search';

const CATALOG_TTL_SECONDS = 300; // 5 minutes
const TRENDING_TTL_SECONDS = 60;  // 1 minute
const SEARCH_TTL_SECONDS = 120;   // 2 minutes

class FeedCacheService {
  /**
   * Retrieves paginated catalog with fine-grained Redis Cache-Aside
   */
  async getCatalog({ page = 1, limit = 20, genre = '', sortBy = 'trending' } = {}) {
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const cacheKey = `${CATALOG_PREFIX}:p${safePage}:l${safeLimit}:g${genre || 'all'}:s${sortBy}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        recordCacheHit('catalog');
        return JSON.parse(cached);
      }
    } catch (e) {
      // Degrade gracefully to DB
    }

    recordCacheMiss('catalog');

    // DB Fetch with projection & pagination
    const result = await db.getAllSeries({ page: safePage, limit: safeLimit, genre, sortBy });

    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CATALOG_TTL_SECONDS);
    } catch (e) {}

    return result;
  }

  /**
   * Retrieves trending drama feed (sorted by views/score)
   */
  async getTrendingFeed(limit = 10) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const cacheKey = `${TRENDING_PREFIX}:l${safeLimit}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        recordCacheHit('trending');
        return JSON.parse(cached);
      }
    } catch (e) {}

    recordCacheMiss('trending');

    const result = await db.getAllSeries({ page: 1, limit: safeLimit, sortBy: 'trending' });

    try {
      await redis.set(cacheKey, JSON.stringify(result.data), 'EX', TRENDING_TTL_SECONDS);
    } catch (e) {}

    return result.data;
  }

  /**
   * Caches high-frequency search queries in Redis
   */
  async searchDramas(query, { page = 1, limit = 20 } = {}) {
    const cleanQuery = (query || '').trim().toLowerCase();
    if (!cleanQuery) {
      return { data: [], page: 1, limit: 20, total: 0, totalPages: 0 };
    }

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const cacheKey = `${SEARCH_PREFIX}:${encodeURIComponent(cleanQuery)}:p${safePage}:l${safeLimit}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        recordCacheHit('search');
        return JSON.parse(cached);
      }
    } catch (e) {}

    recordCacheMiss('search');

    const result = await db.searchSeries({ query: cleanQuery, page: safePage, limit: safeLimit });

    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', SEARCH_TTL_SECONDS);
    } catch (e) {}

    return result;
  }

  /**
   * Invalidates caches when admin/creator uploads or updates content
   */
  async invalidateCatalog() {
    try {
      await Promise.all([
        redis.delByPrefix('cache:dramas:'),
        redis.delByPrefix('cache:search:')
      ]);
    } catch (e) {
      console.warn('[FeedCache] Invalidation warning:', e.message);
    }
  }

  async invalidateCache() {
    return this.invalidateCatalog();
  }
}

module.exports = new FeedCacheService();
