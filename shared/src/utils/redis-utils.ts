// Redis utility functions for Coffee & Canvas
// Provides standardized Redis operations with TTL policies

import { Point2D, StrokeData, User } from '../types/index.js';

export class RedisUtils {
  /**
   * Generate Redis key for active stroke caching
   */
  static getActiveStrokeKey(roomId: string, strokeId: string): string {
    return `stroke:active:${roomId}:${strokeId}`;
  }

  /**
   * Generate Redis key for room presence tracking
   */
  static getRoomPresenceKey(roomId: string): string {
    return `room:presence:${roomId}`;
  }

  /**
   * Generate Redis channel for room events
   */
  static getRoomEventChannel(roomId: string): string {
    return `room:${roomId}:events`;
  }

  /**
   * Generate Redis key for coffee pour coordination
   */
  static getActivePourKey(roomId: string, pourId: string): string {
    return `pour:active:${roomId}:${pourId}`;
  }

  /**
   * Generate Redis key for rate limiting
   */
  static getRateLimitKey(userId: string, action: 'stroke' | 'pour'): string {
    return `rate:${userId}:${action}`;
  }

  /**
   * TTL constants for different data types
   */
  static readonly TTL = {
    ACTIVE_STROKE: 30, // 30 seconds
    ROOM_PRESENCE: 60, // 60 seconds
    POUR_EVENT: 10, // 10 seconds
    RATE_LIMIT_STROKE: 1, // 1 second
    RATE_LIMIT_POUR: 3, // 3 seconds
  } as const;

  /**
   * Rate limiting thresholds
   */
  static readonly RATE_LIMITS = {
    STROKES_PER_SECOND: 120,
    POURS_PER_WINDOW: 1,
  } as const;

  /**
   * Serialize stroke data for Redis storage
   */
  static serializeStrokeData(
    stroke: Partial<StrokeData>
  ): Record<string, string> {
    return {
      strokeId: stroke.strokeId || '',
      userId: stroke.userId || '',
      roomId: stroke.roomId || '',
      tool: stroke.tool || '',
      color: stroke.color || '',
      width: stroke.width?.toString() || '1',
      points: JSON.stringify(stroke.points || []),
      opacity: stroke.opacity?.toString() || '1',
      timestamp: stroke.timestamp?.toString() || Date.now().toString(),
    };
  }

  /**
   * Deserialize stroke data from Redis
   */
  static deserializeStrokeData(
    data: Record<string, string>
  ): Partial<StrokeData> {
    return {
      strokeId: data.strokeId,
      userId: data.userId,
      roomId: data.roomId,
      tool: data.tool,
      color: data.color,
      width: parseFloat(data.width) || 1,
      points: JSON.parse(data.points || '[]') as Point2D[],
      opacity: parseFloat(data.opacity) || 1,
      timestamp: parseInt(data.timestamp) || Date.now(),
    };
  }

  /**
   * Serialize user presence data
   */
  static serializeUserPresence(user: User): string {
    return JSON.stringify({
      displayName: user.displayName,
      color: user.color,
      lastSeen: Date.now(),
    });
  }

  /**
   * Deserialize user presence data
   */
  static deserializeUserPresence(data: string): {
    displayName: string;
    color: string;
    lastSeen: number;
  } {
    try {
      return JSON.parse(data);
    } catch {
      return { displayName: 'Unknown', color: '#000000', lastSeen: 0 };
    }
  }

  /**
   * Serialize coffee pour event data
   */
  static serializePourEvent(pourData: {
    pourId: string;
    userId: string;
    origin: Point2D;
    intensity: number;
    status: 'pending' | 'computing' | 'completed' | 'failed';
  }): Record<string, string> {
    return {
      pourId: pourData.pourId,
      userId: pourData.userId,
      origin: JSON.stringify(pourData.origin),
      intensity: pourData.intensity.toString(),
      status: pourData.status,
      timestamp: Date.now().toString(),
    };
  }

  /**
   * Deserialize coffee pour event data
   */
  static deserializePourEvent(data: Record<string, string>): {
    pourId: string;
    userId: string;
    origin: Point2D;
    intensity: number;
    status: string;
    timestamp: number;
  } {
    return {
      pourId: data.pourId,
      userId: data.userId,
      origin: JSON.parse(data.origin || '{"x":0,"y":0}') as Point2D,
      intensity: parseFloat(data.intensity) || 0,
      status: data.status || 'pending',
      timestamp: parseInt(data.timestamp) || Date.now(),
    };
  }

  /**
   * Create standardized event payload for pub/sub
   */
  static createEventPayload(type: string, data: unknown): string {
    return JSON.stringify({
      type,
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Parse event payload from pub/sub
   */
  static parseEventPayload(payload: string): {
    type: string;
    data: unknown;
    timestamp: number;
  } {
    try {
      return JSON.parse(payload);
    } catch {
      return { type: 'unknown', data: {}, timestamp: Date.now() };
    }
  }

  /**
   * Calculate spatial chunk key for stroke distribution
   */
  static calculateChunkKey(
    x: number,
    y: number,
    chunkSize: number = 1000
  ): string {
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    return `${chunkX}:${chunkY}`;
  }

  /**
   * Get all chunk keys for a set of points
   */
  static getChunkKeysForPoints(
    points: Point2D[],
    chunkSize: number = 1000
  ): string[] {
    const chunkKeys = new Set<string>();

    for (const point of points) {
      chunkKeys.add(this.calculateChunkKey(point.x, point.y, chunkSize));
    }

    return Array.from(chunkKeys);
  }

  /**
   * Get chunk keys within a bounding box (for viewport queries)
   */
  static getChunkKeysInBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    chunkSize: number = 1000
  ): string[] {
    const chunkKeys: string[] = [];

    const startChunkX = Math.floor(minX / chunkSize);
    const startChunkY = Math.floor(minY / chunkSize);
    const endChunkX = Math.floor(maxX / chunkSize);
    const endChunkY = Math.floor(maxY / chunkSize);

    for (let x = startChunkX; x <= endChunkX; x++) {
      for (let y = startChunkY; y <= endChunkY; y++) {
        chunkKeys.push(`${x}:${y}`);
      }
    }

    return chunkKeys;
  }
}
