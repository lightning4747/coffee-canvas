import { Point2D } from '../types';

// Spatial chunking utilities
export const CHUNK_SIZE = 1000; // pixels per chunk

export function calculateChunkKey(point: Point2D): string {
  const chunkX = Math.floor(point.x / CHUNK_SIZE);
  const chunkY = Math.floor(point.y / CHUNK_SIZE);
  return `${chunkX}:${chunkY}`;
}

export function calculateChunkKeys(points: Point2D[]): string[] {
  const chunkSet = new Set<string>();

  for (const point of points) {
    chunkSet.add(calculateChunkKey(point));
  }

  return Array.from(chunkSet);
}

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

// Validation utilities
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

export function isValidColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `${prefix}_${timestamp}_${random}`;
}

// Room code generation
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Export Redis utilities
export * from './database.js';
export * from './redis-client.js';
export * from './redis-utils.js';
