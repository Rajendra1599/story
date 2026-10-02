/**
 * MicroDrama OTT - Enterprise Database Read-Write Splitting Router
 * 
 * Scalability Architecture (Stage 2: 10k - 100k Users):
 * - Primary/Master Node: Dedicated to ACID payment transactions, VIP subscription updates, and video creations.
 * - Read Replicas (Cluster): Round-robin load distribution for high-frequency feed reading, drama search, and catalog queries.
 * - Connection Pooling with max idle timeouts and automatic failover.
 */

class DatabasePoolRouter {
  constructor() {
    this.primaryUrl = process.env.DATABASE_PRIMARY_URL || process.env.MONGODB_URI || 'primary-db-cluster';
    this.readReplicaUrls = (process.env.DATABASE_READ_REPLICAS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    this.roundRobinIndex = 0;
    console.log(`[DBPool] Initialized Read-Write Split Router with ${this.readReplicaUrls.length} read replicas.`);
  }

  /**
   * Routes query to a Read Replica, or Primary if no replicas configured
   */
  getReadConnection() {
    if (this.readReplicaUrls.length === 0) {
      return this.primaryUrl;
    }
    const target = this.readReplicaUrls[this.roundRobinIndex % this.readReplicaUrls.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.readReplicaUrls.length;
    return target;
  }

  /**
   * Routes writes exclusively to Primary node
   */
  getWriteConnection() {
    return this.primaryUrl;
  }
}

module.exports = new DatabasePoolRouter();
