/**
 * Redis utility functions for the Coffee & Canvas application.
 * Provides standardized key generation, TTL policies, and serialization
 * logic for real-time state management and coordination.
 */

import { Point2D, StrokeData, User } from '../types/index';

/**
 * Static utility class for Redis-related operations.
 * Centralizes key naming conventions and serialization formats.
 */
export class RedisUtils {
  /**
   * Generates a Redis key for caching an active, in-progress stroke.
   * @param roomId - The room where the stroke is occurring.
   * @param strokeId - Unique stroke identifier.
   */
  static getActiveStrokeKey(roomId: string, strokeId: string): string {
    return `stroke:active:${roomId}:${strokeId}`;
  }

  /**
   * Generates a Redis key for tracking user presence in a room.
   * @param roomId - The target room ID.
   */
  static getRoomPresenceKey(roomId: string): string {
    return `room:presence:${roomId}`;
  }

  /**
   * Generates a Redis Pub/Sub channel name for room-specific events.
   * @param roomId - The target room ID.
   */
  static getRoomEventChannel(roomId: string): string {
    return `room:${roomId}:events`;
  }

  /**
   * Generates a Redis key for coordinating a coffee pour event.
   * Used to prevent race conditions during physics simulations.
   * @param roomId - The target room ID.
   * @param pourId - Unique pour identifier.
   */
  static getActivePourKey(roomId: string, pourId: string): string {
    return `pour:active:${roomId}:${pourId}`;
  }

  /**
   * Generates a Redis key for action-based rate limiting.
   * @param userId - The user to limit.
   * @param action - The type of action (stroke or pour).
   */
  static getRateLimitKey(userId: string, action: 'stroke' | 'pour'): string {
    return `rate:${userId}:${action}`;
  }

  /**
   * Standard Time-To-Live (TTL) constants in seconds.
   */
  static readonly TTL = {
    /** How long to keep a partial stroke in cache before it must be persisted to PG. */
    ACTIVE_STROKE: 30,
    /** Heartbeat interval for user presence. */
    ROOM_PRESENCE: 60,
    /** Expiration for pour coordination locks. */
    POUR_EVENT: 10,
    /** Short window for stroke rate limiting. */
    RATE_LIMIT_STROKE: 1,
    /** Longer window for physics-heavy pour events. */
    RATE_LIMIT_POUR: 3,
  } as const;

  /**
   * Configurable rate limiting thresholds.
   */
  static readonly RATE_LIMITS = {
    /** Max stroke segments per second per user. */
    STROKES_PER_SECOND: 120,
    /** Max pours per rate limit window. */
    POURS_PER_WINDOW: 1,
  } as const;

  /**
   * Converts a StrokeData object into a Redis-friendly hash map.
   * @param stroke - Partial stroke data to serialize.
   * @returns Key-value pairs for HSET.
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
   * Reconstructs a StrokeData object from a Redis hash map.
   * @param data - Raw string data from HGETALL.
   * @returns Partially reconstructed StrokeData.
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
   * Serializes user metadata for presence tracking.
   */
  static serializeUserPresence(user: User): string {
    return JSON.stringify({
      displayName: user.displayName,
      color: user.color,
      lastSeen: Date.now(),
    });
  }

  /**
   * Parses user presence data from a Redis string.
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
   * Converts coffee pour metadata into a Redis hash map.
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
   * Parses coffee pour metadata from a Redis hash map.
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
   * Wraps data in a typed event envelope for Pub/Sub messages.
   */
  static createEventPayload(type: string, data: unknown): string {
    return JSON.stringify({
      type,
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Extracts data from a Pub/Sub event envelope.
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
   * Maps pixel coordinates to a spatial chunk key string.
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
   * Returns all unique chunk keys touched by a set of points.
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
   * Finds all chunk keys within a rectangular world bounding box.
   * Useful for loading canvas history in the current viewport.
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
