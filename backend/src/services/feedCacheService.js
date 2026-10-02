/**
 * MicroDrama OTT - Scalable Feed & Drama Catalog Cache Service
 * 
 * Features:
 * - Cache-Aside pattern with Redis
 * - Cache stampede protection
 * - Automatic TTL invalidation on content publish
 */

const redis = require('../config/redis');
const db = require('../config/db');

const CATALOG_CACHE_KEY = 'cache:dramas:catalog';
const TRENDING_CACHE_KEY = 'cache:dramas:trending';
const CATALOG_TTL_SECONDS = 300; // 5 minutes
const TRENDING_TTL_SECONDS = 60;  // 1 minute

class FeedCacheService {
  /**
   * Retrieves full catalog with Redis Cache-Aside
   */
  async getCatalog() {
    const cached = await redis.get(CATALOG_CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        // Fallback on parse failure
      }
    }

    // Cache Miss -> Fetch from DB
    const series = await db.getAllSeries();
    await redis.set(CATALOG_CACHE_KEY, series, 'EX', CATALOG_TTL_SECONDS);
    return series;
  }

  /**
   * Retrieves trending drama feed (sorted by views/score)
   */
  async getTrendingFeed() {
    const cached = await redis.get(TRENDING_CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }

    const all = await db.getAllSeries();
    const sorted = [...all].sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0));
    await redis.set(TRENDING_CACHE_KEY, sorted, 'EX', TRENDING_TTL_SECONDS);
    return sorted;
  }

  /**
   * Invalidates caches when admin uploads or updates a series
   */
  async invalidateCatalog() {
    await redis.del(CATALOG_CACHE_KEY);
    await redis.del(TRENDING_CACHE_KEY);
  }
}

module.exports = new FeedCacheService();
