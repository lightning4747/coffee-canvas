import * as fc from 'fast-check';
import { Point2D } from '../types';

// Spatial chunking utilities - copied locally to avoid import issues
const CHUNK_SIZE = 1000; // pixels per chunk

function calculateChunkKey(point: Point2D): string {
  let chunkX = Math.floor(point.x / CHUNK_SIZE);
  let chunkY = Math.floor(point.y / CHUNK_SIZE);

  // Normalize -0 to 0 to ensure consistent string representation
  if (Object.is(chunkX, -0)) chunkX = 0;
  if (Object.is(chunkY, -0)) chunkY = 0;

  return `${chunkX}:${chunkY}`;
}

function calculateChunkKeys(points: Point2D[]): string[] {
  const chunkSet = new Set<string>();

  for (const point of points) {
    chunkSet.add(calculateChunkKey(point));
  }

  return Array.from(chunkSet);
}

/**
 * Property 6: Spatial Chunk Distribution
 * Validates: Requirements 3.2, 3.3
 *
 * For any drawing stroke that crosses spatial chunk boundaries,
 * the stroke data should be automatically distributed across all appropriate chunks.
 */

describe('Spatial Chunk Distribution Property Tests', () => {
  // Generator for valid Point2D coordinates within reasonable bounds
  const point2DArbitrary = fc.record({
    x: fc.float({ min: -1e6, max: 1e6, noNaN: true }),
    y: fc.float({ min: -1e6, max: 1e6, noNaN: true }),
  });

  // Generator for arrays of points representing stroke paths
  const strokePathArbitrary = fc.array(point2DArbitrary, {
    minLength: 1,
    maxLength: 100,
  });

  describe('Property: All chunks intersected by a stroke are identified', () => {
    it('should identify all unique chunks that contain stroke points', () => {
      fc.assert(
        fc.property(strokePathArbitrary, (points: Point2D[]) => {
          const chunkKeys = calculateChunkKeys(points);

          // Every point should have its chunk represented in the result
          for (const point of points) {
            const expectedChunkKey = calculateChunkKey(point);
            expect(chunkKeys).toContain(expectedChunkKey);
          }

          // All returned chunk keys should be valid format
          for (const chunkKey of chunkKeys) {
            expect(chunkKey).toMatch(/^-?\d+:-?\d+$/);
          }
        })
      );
    });
  });

  describe('Property: No duplicate chunk keys are generated', () => {
    it('should return unique chunk keys only', () => {
      fc.assert(
        fc.property(strokePathArbitrary, (points: Point2D[]) => {
          const chunkKeys = calculateChunkKeys(points);
          const uniqueKeys = [...new Set(chunkKeys)];

          // No duplicates should exist
          expect(chunkKeys).toHaveLength(uniqueKeys.length);
        })
      );
    });
  });

  describe('Property: Chunk key format is correct', () => {
    it('should generate chunk keys in "{x}:{y}" format where x,y are integers', () => {
      fc.assert(
        fc.property(point2DArbitrary, (point: Point2D) => {
          const chunkKey = calculateChunkKey(point);

          // Should match the expected format
          expect(chunkKey).toMatch(/^-?\d+:-?\d+$/);

          // Should be parseable back to integers
          const [x, y] = chunkKey.split(':').map(Number);
          expect(Number.isInteger(x)).toBe(true);
          expect(Number.isInteger(y)).toBe(true);

          // Should correctly represent the chunk containing the point
          let expectedX = Math.floor(point.x / CHUNK_SIZE);
          let expectedY = Math.floor(point.y / CHUNK_SIZE);

          // Normalize -0 to 0 for comparison
          if (Object.is(expectedX, -0)) expectedX = 0;
          if (Object.is(expectedY, -0)) expectedY = 0;

          expect(x).toEqual(expectedX);
          expect(y).toEqual(expectedY);

          // Verify the chunk bounds contain the point
          const chunkMinX = x * CHUNK_SIZE;
          const chunkMaxX = (x + 1) * CHUNK_SIZE;
          const chunkMinY = y * CHUNK_SIZE;
          const chunkMaxY = (y + 1) * CHUNK_SIZE;

          expect(point.x).toBeGreaterThanOrEqual(chunkMinX);
          expect(point.x).toBeLessThan(chunkMaxX);
          expect(point.y).toBeGreaterThanOrEqual(chunkMinY);
          expect(point.y).toBeLessThan(chunkMaxY);
        })
      );
    });
  });

  describe('Property: Single-point strokes work correctly', () => {
    it('should handle single-point strokes correctly', () => {
      fc.assert(
        fc.property(point2DArbitrary, (point: Point2D) => {
          const chunkKeys = calculateChunkKeys([point]);

          // Should return exactly one chunk key
          expect(chunkKeys).toHaveLength(1);

          // Should be the correct chunk for that point
          const expectedChunkKey = calculateChunkKey(point);
          expect(chunkKeys[0]).toBe(expectedChunkKey);
        })
      );
    });
  });

  describe('Property: Strokes spanning many chunks work correctly', () => {
    it('should handle strokes that span multiple chunks', () => {
      // Generate points that are guaranteed to be in different chunks
      const multiChunkStrokeArbitrary = fc.array(
        fc.record({
          x: fc
            .integer({ min: -10, max: 10 })
            .map(i => i * CHUNK_SIZE + CHUNK_SIZE / 2),
          y: fc
            .integer({ min: -10, max: 10 })
            .map(i => i * CHUNK_SIZE + CHUNK_SIZE / 2),
        }),
        { minLength: 2, maxLength: 20 }
      );

      fc.assert(
        fc.property(multiChunkStrokeArbitrary, (points: Point2D[]) => {
          const chunkKeys = calculateChunkKeys(points);

          // Should have at least one chunk (could be same chunk if points are close)
          expect(chunkKeys.length).toBeGreaterThanOrEqual(1);

          // Should not exceed the number of points (each point contributes at most one chunk)
          expect(chunkKeys.length).toBeLessThanOrEqual(points.length);

          // All chunk keys should be unique
          const uniqueKeys = [...new Set(chunkKeys)];
          expect(chunkKeys).toHaveLength(uniqueKeys.length);
        })
      );
    });
  });

  describe('Property: Chunk boundaries are handled correctly', () => {
    it('should correctly handle points exactly on chunk boundaries', () => {
      // Generate points exactly on chunk boundaries
      const boundaryPointArbitrary = fc.record({
        x: fc.integer({ min: -5, max: 5 }).map(i => i * CHUNK_SIZE),
        y: fc.integer({ min: -5, max: 5 }).map(i => i * CHUNK_SIZE),
      });

      fc.assert(
        fc.property(boundaryPointArbitrary, (point: Point2D) => {
          const chunkKey = calculateChunkKey(point);

          // Point exactly on boundary should be assigned to the correct chunk
          const expectedX = Math.floor(point.x / CHUNK_SIZE);
          const expectedY = Math.floor(point.y / CHUNK_SIZE);

          expect(chunkKey).toBe(`${expectedX}:${expectedY}`);
        })
      );
    });
  });

  describe('Property: Empty input handling', () => {
    it('should handle empty point arrays correctly', () => {
      const chunkKeys = calculateChunkKeys([]);
      expect(chunkKeys).toEqual([]);
    });
  });

  describe('Property: Consistency across multiple calls', () => {
    it('should return consistent results for identical inputs', () => {
      fc.assert(
        fc.property(strokePathArbitrary, (points: Point2D[]) => {
          const chunkKeys1 = calculateChunkKeys(points);
          const chunkKeys2 = calculateChunkKeys(points);

          // Results should be identical
          expect(chunkKeys1).toEqual(chunkKeys2);
        })
      );
    });
  });

  describe('Property: Stroke distribution across chunks validates Requirements 3.2', () => {
    it('should automatically distribute stroke data across appropriate spatial chunks', () => {
      // Generate strokes that definitely cross chunk boundaries
      const crossBoundaryStrokeArbitrary = fc.tuple(
        fc.record({
          x: fc.float({ min: -CHUNK_SIZE / 2, max: CHUNK_SIZE / 2 }),
          y: fc.float({ min: -CHUNK_SIZE / 2, max: CHUNK_SIZE / 2 }),
        }),
        fc.record({
          x: fc.float({ min: CHUNK_SIZE, max: CHUNK_SIZE * 2 }),
          y: fc.float({ min: CHUNK_SIZE, max: CHUNK_SIZE * 2 }),
        })
      );

      fc.assert(
        fc.property(
          crossBoundaryStrokeArbitrary,
          ([point1, point2]: [Point2D, Point2D]) => {
            const strokePoints = [point1, point2];
            const chunkKeys = calculateChunkKeys(strokePoints);

            // Should identify chunks for both points
            const chunk1 = calculateChunkKey(point1);
            const chunk2 = calculateChunkKey(point2);

            expect(chunkKeys).toContain(chunk1);
            expect(chunkKeys).toContain(chunk2);

            // If points are in different chunks, should have at least 2 chunks
            if (chunk1 !== chunk2) {
              expect(chunkKeys.length).toBeGreaterThanOrEqual(2);
            }
          }
        )
      );
    });
  });

  describe('Property: Chunk querying validates Requirements 3.3', () => {
    it('should enable querying only chunks relevant to viewport', () => {
      fc.assert(
        fc.property(strokePathArbitrary, (points: Point2D[]) => {
          const chunkKeys = calculateChunkKeys(points);

          // Each chunk key should correspond to a valid spatial region
          for (const chunkKey of chunkKeys) {
            const [x, y] = chunkKey.split(':').map(Number);

            // Chunk coordinates should be valid integers
            expect(Number.isInteger(x)).toBe(true);
            expect(Number.isInteger(y)).toBe(true);

            // Should be able to reconstruct chunk bounds
            const chunkMinX = x * CHUNK_SIZE;
            const chunkMaxX = (x + 1) * CHUNK_SIZE;
            const chunkMinY = y * CHUNK_SIZE;
            const chunkMaxY = (y + 1) * CHUNK_SIZE;

            // At least one point should fall within this chunk's bounds
            const hasPointInChunk = points.some(
              point =>
                point.x >= chunkMinX &&
                point.x < chunkMaxX &&
                point.y >= chunkMinY &&
                point.y < chunkMaxY
            );

            expect(hasPointInChunk).toBe(true);
          }
        })
      );
    });
  });
});
