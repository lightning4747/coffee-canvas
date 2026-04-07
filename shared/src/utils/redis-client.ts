/**
 * Redis client utility for the Coffee & Canvas ecosystem.
 * This class manages separate Redis connections for general operations,
 * publishing, and subscribing, providing a high-level API for real-time state.
 */

import Redis from 'ioredis';
import { Point2D, StrokeData, User } from '../types/index.js';
import { RedisUtils } from './redis-utils.js';

/**
 * High-level wrapper for Redis operations, including Pub/Sub and caching.
 */
export class RedisClient {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  /** Tracks per-channel message handlers to enable clean unsubscription. */
  private channelHandlers: Map<
    string,
    (channel: string, message: string) => void
  > = new Map();

  /**
   * Initializes the Redis clients with retry strategies.
   * @param redisUrl - Connection string for the Redis instance.
   */
  constructor(redisUrl: string) {
    const commonOptions = {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
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
   * Establishes all three types of Redis connections.
   */
  async connect(): Promise<void> {
    await Promise.all([
      this.client.connect(),
      this.subscriber.connect(),
      this.publisher.connect(),
    ]);
  }

  /**
   * Gracefully shuts down all active Redis connections.
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
   * Caches metadata for an active stroke with a limited TTL.
   * @param roomId - Room where the stroke is occurring.
   * @param strokeData - Partial stroke metadata (must include strokeId).
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
   * Retrieves an active stroke's metadata from the cache.
   * @param roomId - Target room.
   * @param strokeId - Unique stroke identifier.
   * @returns Partial StrokeData or null if not found.
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
   * Updates the point buffer for an active stroke in Redis.
   * @param roomId - Target room.
   * @param strokeId - Unique stroke identifier.
   * @param points - New points to store.
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
   * Explicitly removes a stroke from the active cache.
   * Typically called when a stroke is finalized and persisted to DB.
   */
  async removeActiveStroke(roomId: string, strokeId: string): Promise<void> {
    const key = RedisUtils.getActiveStrokeKey(roomId, strokeId);
    await this.client.del(key);
  }

  /**
   * Scans Redis for keys matching a pattern using incremental SCAN.
   * @param pattern - Redis pattern (e.g. "room:*:stroke:*").
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
   * Retrieves all currently active strokes in a room.
   * Used for initializing the canvas state for new joiners.
   * @param roomId - Target room UUID.
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
          if (
            err ||
            !data ||
            Object.keys(data as Record<string, string>).length === 0
          )
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
   * Updates user presence metadata in a room.
   * Presence data has a short TTL for automatic cleanup of zombie sessions.
   * @param roomId - Target room UUID.
   * @param userId - Unique user ID.
   * @param user - User metadata (display name, color, etc).
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
   * Explicitly removes a user from the room's presence set.
   */
  async removeUserPresence(roomId: string, userId: string): Promise<void> {
    const key = RedisUtils.getRoomPresenceKey(roomId);
    await this.client.hdel(key, userId);
  }

  /**
   * Returns a map of all active users and their metadata in a room.
   * @param roomId - Target room UUID.
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
   * Caches the state of a coffee pour event.
   * @param roomId - Target room.
   * @param pourData - Event metadata for the pour.
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
   * Retrieves a pour event's state.
   */
  async getPourEvent(
    roomId: string,
    pourId: string
  ): Promise<Record<string, unknown> | null> {
    const key = RedisUtils.getActivePourKey(roomId, pourId);
    const data = await this.client.hgetall(key);

    if (Object.keys(data).length === 0) {
      return null;
    }

    return RedisUtils.deserializePourEvent(data);
  }

  /**
   * Updates the simulation status of a specific pour event.
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
   * Enforces a rate limit for stroke frequency per user.
   * @returns true if under limit, false if restricted.
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
   * Enforces a rate limit for physics (coffee pour) events.
   * @returns true if allowed, false if restricted.
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
   * Publishes an event to a room-specific channel for cross-server communication.
   * @param roomId - Target room.
   * @param eventType - Event identifier (e.g. "stroke_begin").
   * @param data - Event payload.
   */
  async publishToRoom(
    roomId: string,
    eventType: string,
    data: unknown
  ): Promise<void> {
    const channel = RedisUtils.getRoomEventChannel(roomId);
    const payload = RedisUtils.createEventPayload(eventType, data);

    await this.publisher.publish(channel, payload);
  }

  /**
   * Subscribes to events on a room-specific channel.
   * Handles automatic parsing of event payloads.
   * @param roomId - Target room.
   * @param callback - Function invoked on each received event.
   */
  async subscribeToRoom(
    roomId: string,
    callback: (eventType: string, data: unknown) => void
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
   * Completely unsubscribes from a room channel and cleans up handlers.
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
   * Verifies the Redis connection by sending a PING command.
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
   * Retrieves health and performance statistics from the Redis instance.
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
   * Utility to force-clear all cached active strokes in a room.
   */
  async clearActiveStrokesInRoom(roomId: string): Promise<void> {
    const pattern = RedisUtils.getActiveStrokeKey(roomId, '*');
    const keys = await this.scanKeysByPattern(pattern);

    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}
