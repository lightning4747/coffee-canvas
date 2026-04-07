/**
 * General utility functions for the Coffee & Canvas shared package.
 * Includes spatial chunking, validation, and ID generation logic.
 */

import { Point2D } from '../types';

/**
 * Dimension of a square spatial chunk in pixels.
 * Used to partition the infinite canvas for efficient storage and retrieval.
 */
export const CHUNK_SIZE = 1000;

/**
 * Calculates a unique string key for the spatial chunk containing a given point.
 * Format is "X:Y" where X and Y are integer multiples of CHUNK_SIZE.
 *
 * @param point - The canvas coordinate to map.
 * @returns A normalized chunk key string.
 */
export function calculateChunkKey(point: Point2D): string {
  let chunkX = Math.floor(point.x / CHUNK_SIZE);
  let chunkY = Math.floor(point.y / CHUNK_SIZE);

  // Normalize -0 to 0 to ensure consistent string representation in Redis/Postgres
  if (Object.is(chunkX, -0)) chunkX = 0;
  if (Object.is(chunkY, -0)) chunkY = 0;

  return `${chunkX}:${chunkY}`;
}

/**
 * Maps an array of points to a unique set of chunk keys they occupy.
 * Useful for determining which chunks are affected by a long stroke.
 *
 * @param points - Array of path points.
 * @returns Array of unique chunk keys.
 */
export function calculateChunkKeys(points: Point2D[]): string[] {
  const chunkSet = new Set<string>();

  for (const point of points) {
    chunkSet.add(calculateChunkKey(point));
  }

  return Array.from(chunkSet);
}

/**
 * Returns a list of keys for chunks immediately surrounding a specific chunk.
 * Includes the center chunk itself (3x3 grid).
 *
 * @param chunkKey - The center chunk identifier.
 * @returns Array of 9 chunk keys.
 */
export function getAdjacentChunks(chunkKey: string): string[] {
  const [x, y] = chunkKey.split(':').map(Number);
  const adjacent: string[] = [];

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      adjacent.push(`${x + dx}:${y + dy}`);
    }
  }

  return adjacent;
}

/**
 * Type guard for validating Point2D objects.
 * Ensures properties exist, are finite, and within reasonable canvas bounds.
 */
export function isValidPoint2D(point: unknown): point is Point2D {
  if (typeof point !== 'object' || point === null) return false;
  const p = point as Record<string, unknown>;
  return (
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    isFinite(p.x) &&
    isFinite(p.y) &&
    Math.abs(p.x) <= 1e6 &&
    Math.abs(p.y) <= 1e6
  );
}

/**
 * Validates a hex color string (e.g. #FFFFFF).
 */
export function isValidColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Generates a unique, timestamp-prefixed identifier.
 * @param prefix - Key category (e.g. 'stroke', 'pour').
 * @returns A unique string.
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generates a random 6-character uppercase alphanumeric room code.
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Re-export specific utility managers for cleaner imports from the shared package
export * from './database';
export * from './redis-client';
export * from './redis-utils';
