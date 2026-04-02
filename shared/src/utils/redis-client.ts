// Redis client utility for Coffee & Canvas
// Provides connection management and standardized operations

import Redis from 'ioredis';
import { Point2D, StrokeData, User } from '../types/index.js';
import { RedisUtils } from './redis-utils.js';

export class RedisClient {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  // Tracks per-channel message handlers so they can be removed on unsubscribe
  private channelHandlers: Map<
    string,
    (channel: string, message: string) => void
  > = new Map();

  constructor(redisUrl: string) {
    const commonOptions = {
      // Remove retryDelayOnFailover (it doesn't exist)
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      // If you want custom delay logic, use this instead:
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

    // Main client for general operations
    this.client = new Redis(redisUrl, commonOptions);

    // Dedicated subscriber client for pub/sub
    this.subscriber = new Redis(redisUrl, commonOptions);

    // Dedicated publisher client for pub/sub
    this.publisher = new Redis(redisUrl, commonOptions);

    // Error handling
    this.client.on('error', err => console.error('Redis Client Error:', err));
    this.subscriber.on('error', err =>
      console.error('Redis Subscriber Error:', err)
    );
    this.publisher.on('error', err =>
      console.error('Redis Publisher Error:', err)
    );
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    await Promise.all([
      this.client.connect(),
      this.subscriber.connect(),
      this.publisher.connect(),
    ]);
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.disconnect(),
      this.subscriber.disconnect(),
      this.publisher.disconnect(),
    ]);
  }

  // ============================================================================
  // ACTIVE STROKE OPERATIONS
  // ============================================================================

  /**
   * Cache active stroke with TTL.
   * strokeId is required and must be present in strokeData.
   */
  async cacheActiveStroke(
    roomId: string,
    strokeData: Partial<StrokeData> & Pick<StrokeData, 'strokeId'>
  ): Promise<void> {
    if (!strokeData.strokeId) {
      throw new Error(
        'cacheActiveStroke: strokeId is required to cache active stroke'
      );
    }

    const key = RedisUtils.getActiveStrokeKey(roomId, strokeData.strokeId);
    const serialized = RedisUtils.serializeStrokeData(strokeData);

    const pipeline = this.client.pipeline();
    pipeline.hmset(key, serialized);
    pipeline.expire(key, RedisUtils.TTL.ACTIVE_STROKE);

    await pipeline.exec();
  }

  /**
   * Get active stroke from cache
   */
  async getActiveStroke(
    roomId: string,
    strokeId: string
  ): Promise<Partial<StrokeData> | null> {
    const key = RedisUtils.getActiveStrokeKey(roomId, strokeId);
    const data = await this.client.hgetall(key);

    if (Object.keys(data).length === 0) {
      return null;
    }

    return RedisUtils.deserializeStrokeData(data);
  }

  /**
   * Update active stroke points
   */
  async updateActiveStrokePoints(
    roomId: string,
    strokeId: string,
    points: Point2D[]
  ): Promise<void> {
    const key = RedisUtils.getActiveStrokeKey(roomId, strokeId);

    const pipeline = this.client.pipeline();
    pipeline.hset(key, 'points', JSON.stringify(points));
    pipeline.hset(key, 'timestamp', Date.now().toString());
    pipeline.expire(key, RedisUtils.TTL.ACTIVE_STROKE);

    await pipeline.exec();
  }

  /**
   * Remove active stroke from cache
   */
  async removeActiveStroke(roomId: string, strokeId: string): Promise<void> {
    const key = RedisUtils.getActiveStrokeKey(roomId, strokeId);
    await this.client.del(key);
  }

  /**
   * Scan Redis for keys matching a pattern using the incremental SCAN command,
   * avoiding the blocking O(N) KEYS command.
   */
  private async scanKeysByPattern(pattern: string): Promise<string[]> {
    const stream = this.client.scanStream({ match: pattern });
    const keys: string[] = [];

    return new Promise<string[]>((resolve, reject) => {
      stream.on('data', (resultKeys: string[]) => {
        for (const key of resultKeys) {
          keys.push(key);
        }
      });

      stream.on('end', () => {
        resolve(keys);
      });

      stream.on('error', err => {
        reject(err);
      });
    });
  }

  /**
   * Get all active strokes in room
   */
  async getActiveStrokesInRoom(roomId: string): Promise<Partial<StrokeData>[]> {
    const pattern = RedisUtils.getActiveStrokeKey(roomId, '*');
    const keys = await this.scanKeysByPattern(pattern);

    if (keys.length === 0) {
      return [];
    }

    const pipeline = this.client.pipeline();
    keys.forEach(key => pipeline.hgetall(key));

    const results = await pipeline.exec();

    return (
      results
        ?.map(([err, data]) => {
          if (err || !data || Object.keys(data as any).length === 0)
            return null;
          return RedisUtils.deserializeStrokeData(
            data as Record<string, string>
          );
        })
        .filter((stroke): stroke is Partial<StrokeData> => stroke !== null) ||
      []
    );
  }

  // ============================================================================
  // ROOM PRESENCE OPERATIONS
  // ============================================================================

  /**
   * Update user presence in room
   */
  async updateUserPresence(
    roomId: string,
    userId: string,
    user: User
  ): Promise<void> {
    const key = RedisUtils.getRoomPresenceKey(roomId);
    const serialized = RedisUtils.serializeUserPresence(user);

    const pipeline = this.client.pipeline();
    pipeline.hset(key, userId, serialized);
    pipeline.expire(key, RedisUtils.TTL.ROOM_PRESENCE);

    await pipeline.exec();
  }

  /**
   * Remove user from room presence
   */
  async removeUserPresence(roomId: string, userId: string): Promise<void> {
    const key = RedisUtils.getRoomPresenceKey(roomId);
    await this.client.hdel(key, userId);
  }

  /**
   * Get all active users in room
   */
  async getRoomPresence(
    roomId: string
  ): Promise<
    Record<string, { displayName: string; color: string; lastSeen: number }>
  > {
    const key = RedisUtils.getRoomPresenceKey(roomId);
    const data = await this.client.hgetall(key);

    const presence: Record<
      string,
      { displayName: string; color: string; lastSeen: number }
    > = {};

    for (const [userId, userData] of Object.entries(data)) {
      presence[userId] = RedisUtils.deserializeUserPresence(userData);
    }

    return presence;
  }

  // ============================================================================
  // COFFEE POUR OPERATIONS
  // ============================================================================

  /**
   * Cache coffee pour event
   */
  async cachePourEvent(
    roomId: string,
    pourData: {
      pourId: string;
      userId: string;
      origin: Point2D;
      intensity: number;
      status: 'pending' | 'computing' | 'completed' | 'failed';
    }
  ): Promise<void> {
    const key = RedisUtils.getActivePourKey(roomId, pourData.pourId);
    const serialized = RedisUtils.serializePourEvent(pourData);

    const pipeline = this.client.pipeline();
    pipeline.hmset(key, serialized);
    pipeline.expire(key, RedisUtils.TTL.POUR_EVENT);

    await pipeline.exec();
  }

  /**
   * Get pour event from cache
   */
  async getPourEvent(roomId: string, pourId: string): Promise<any | null> {
    const key = RedisUtils.getActivePourKey(roomId, pourId);
    const data = await this.client.hgetall(key);

    if (Object.keys(data).length === 0) {
      return null;
    }

    return RedisUtils.deserializePourEvent(data);
  }

  /**
   * Update pour event status
   */
  async updatePourEventStatus(
    roomId: string,
    pourId: string,
    status: string
  ): Promise<void> {
    const key = RedisUtils.getActivePourKey(roomId, pourId);
    await this.client.hset(key, 'status', status);
  }

  // ============================================================================
  // RATE LIMITING OPERATIONS
  // ============================================================================

  /**
   * Check and increment rate limit for strokes
   */
  async checkStrokeRateLimit(userId: string): Promise<boolean> {
    const key = RedisUtils.getRateLimitKey(userId, 'stroke');
    const current = await this.client.incr(key);

    if (current === 1) {
      await this.client.expire(key, RedisUtils.TTL.RATE_LIMIT_STROKE);
    }

    return current <= RedisUtils.RATE_LIMITS.STROKES_PER_SECOND;
  }

  /**
   * Check and set rate limit for coffee pours
   */
  async checkPourRateLimit(userId: string): Promise<boolean> {
    const key = RedisUtils.getRateLimitKey(userId, 'pour');
    const exists = await this.client.exists(key);

    if (exists) {
      return false; // Rate limited
    }

    await this.client.setex(key, RedisUtils.TTL.RATE_LIMIT_POUR, '1');
    return true;
  }

  // ============================================================================
  // PUB/SUB OPERATIONS
  // ============================================================================

  /**
   * Publish event to room channel
   */
  async publishToRoom(
    roomId: string,
    eventType: string,
    data: any
  ): Promise<void> {
    const channel = RedisUtils.getRoomEventChannel(roomId);
    const payload = RedisUtils.createEventPayload(eventType, data);

    await this.publisher.publish(channel, payload);
  }

  /**
   * Subscribe to room events.
   * Manages a single message handler per channel to prevent handler accumulation.
   */
  async subscribeToRoom(
    roomId: string,
    callback: (eventType: string, data: any) => void
  ): Promise<void> {
    const channel = RedisUtils.getRoomEventChannel(roomId);

    // Remove any existing handler for this channel before adding a new one
    const existingHandler = this.channelHandlers.get(channel);
    if (existingHandler) {
      this.subscriber.removeListener('message', existingHandler);
    }

    const handler = (receivedChannel: string, message: string) => {
      if (receivedChannel === channel) {
        const { type, data } = RedisUtils.parseEventPayload(message);
        callback(type, data);
      }
    };

    this.channelHandlers.set(channel, handler);
    this.subscriber.on('message', handler);

    await this.subscriber.subscribe(channel);
  }

  /**
   * Unsubscribe from room events
   */
  async unsubscribeFromRoom(roomId: string): Promise<void> {
    const channel = RedisUtils.getRoomEventChannel(roomId);

    // Clean up the stored handler to prevent memory leaks
    const handler = this.channelHandlers.get(channel);
    if (handler) {
      this.subscriber.removeListener('message', handler);
      this.channelHandlers.delete(channel);
    }

    await this.subscriber.unsubscribe(channel);
  }

  // ============================================================================
  // UTILITY OPERATIONS
  // ============================================================================

  /**
   * Health check - verify Redis connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Redis memory usage statistics
   */
  async getMemoryStats(): Promise<{
    usedMemory: number;
    maxMemory: number;
    memoryUsagePercent: number;
    connectedClients: number;
  }> {
    const info = await this.client.info('memory');
    const clients = await this.client.info('clients');

    const usedMemory = parseInt(info.match(/used_memory:(\d+)/)?.[1] || '0');
    const maxMemory = parseInt(info.match(/maxmemory:(\d+)/)?.[1] || '0');
    const connectedClients = parseInt(
      clients.match(/connected_clients:(\d+)/)?.[1] || '0'
    );

    return {
      usedMemory,
      maxMemory,
      memoryUsagePercent: maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0,
      connectedClients,
    };
  }

  /**
   * Clear all active strokes in room (cleanup utility)
   */
  async clearActiveStrokesInRoom(roomId: string): Promise<void> {
    const pattern = RedisUtils.getActiveStrokeKey(roomId, '*');
    const keys = await this.scanKeysByPattern(pattern);

    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}
