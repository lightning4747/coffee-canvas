import * as fc from 'fast-check';
import {
  StrokeBeginSchema,
  StrokeSegmentSchema,
  CoffeePourSchema,
} from '@coffee-canvas/shared';

/**
 * Property 11: Input Validation and Sanitization
 * Validates: Requirements 9.3, 10.4
 */

describe('Security Property Tests: Input Validation (@coffee-canvas/shared)', () => {
  // Arbitrary for UUIDs
  const uuidArb = fc.uuid();

  // Arbitrary for Point2D

  // Arbitrary for hex colors
  const hexColorArb = fc.stringMatching(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/);

  describe('StrokeBeginSchema Validation', () => {
    it('should accept valid stroke_begin payloads', () => {
      const validArb = fc.record({
        roomId: uuidArb,
        userId: uuidArb,
        strokeId: uuidArb,
        tool: fc.constantFrom(
          'pen',
          'brush',
          'eraser',
          'marker',
          'calligraphy'
        ),
        color: hexColorArb,
        width: fc.float({ min: Math.fround(0.5), max: Math.fround(500) }),
        timestamp: fc.integer({ min: 1 }),
      });

      fc.assert(
        fc.property(validArb, payload => {
          const result = StrokeBeginSchema.safeParse(payload);
          expect(result.success).toBe(true);
        })
      );
    });

    it('should reject out-of-bounds width', () => {
      const invalidWidthArb = fc.oneof(
        fc.float({ max: Math.fround(0.49) }),
        fc.float({ min: Math.fround(500.01) })
      );

      fc.assert(
        fc.property(invalidWidthArb, invalidWidth => {
          const payload = {
            roomId: '550e8400-e29b-41d4-a716-446655440000',
            userId: '550e8400-e29b-41d4-a716-446655440001',
            strokeId: '550e8400-e29b-41d4-a716-446655440002',
            tool: 'pen',
            color: '#000000',
            width: invalidWidth,
            timestamp: Date.now(),
          };
          const result = StrokeBeginSchema.safeParse(payload);
          expect(result.success).toBe(false);
        })
      );
    });

    it('should reject whitespace-only IDs', () => {
      // Schema uses string().trim().min(1) — IDs are not required to be UUIDs
      // (design uses non-UUID identifiers like 'room_abc123') but must be non-blank
      const whitespaceArb = fc.stringMatching(/^\s+$/);

      fc.assert(
        fc.property(whitespaceArb, blankId => {
          const payload = {
            roomId: blankId,
            userId: '550e8400-e29b-41d4-a716-446655440001',
            strokeId: '550e8400-e29b-41d4-a716-446655440002',
            tool: 'pen',
            color: '#000000',
            width: 5,
            timestamp: Date.now(),
          };
          const result = StrokeBeginSchema.safeParse(payload);
          expect(result.success).toBe(false);
        })
      );
    });

    it('should accept non-empty, non-whitespace IDs of any format', () => {
      // Design allows any non-blank string as ID (UUID, short-code, nanoid, etc.)
      const nonBlankArb = fc
        .string({ minLength: 1 })
        .filter(s => s.trim().length > 0);

      fc.assert(
        fc.property(nonBlankArb, validId => {
          const payload = {
            roomId: validId.trim(), // trim to match schema pre-processing
            userId: '550e8400-e29b-41d4-a716-446655440001',
            strokeId: '550e8400-e29b-41d4-a716-446655440002',
            tool: 'pen',
            color: '#000000',
            width: 5,
            timestamp: Date.now(),
          };
          const result = StrokeBeginSchema.safeParse(payload);
          expect(result.success).toBe(true);
        })
      );
    });
  });

  describe('Coordinate Bounds Check (PointSchema)', () => {
    it('should reject coordinates outside ±1,000,000', () => {
      const hugeCoordArb = fc.oneof(
        fc.record({
          x: fc.float({ min: Math.fround(1000001) }),
          y: fc.float(),
        }),
        fc.record({
          x: fc.float({ max: Math.fround(-1000001) }),
          y: fc.float(),
        }),
        fc.record({
          x: fc.float(),
          y: fc.float({ min: Math.fround(1000001) }),
        }),
        fc.record({
          x: fc.float(),
          y: fc.float({ max: Math.fround(-1000001) }),
        })
      );

      fc.assert(
        fc.property(hugeCoordArb, invalidPoints => {
          const payload = {
            roomId: '550e8400-e29b-41d4-a716-446655440000',
            userId: '550e8400-e29b-41d4-a716-446655440001',
            strokeId: '550e8400-e29b-41d4-a716-446655440002',
            points: [invalidPoints],
            timestamp: Date.now(),
          };
          const result = StrokeSegmentSchema.safeParse(payload);
          expect(result.success).toBe(false);
        })
      );
    });
  });

  describe('CoffeePourSchema Validation', () => {
    it('should reject extreme intensity values', () => {
      const invalidIntensityArb = fc.oneof(
        fc.float({ max: Math.fround(0.09) }),
        fc.float({ min: Math.fround(10.01) })
      );

      fc.assert(
        fc.property(invalidIntensityArb, invalidIntensity => {
          const payload = {
            roomId: '550e8400-e29b-41d4-a716-446655440000',
            userId: '550e8400-e29b-41d4-a716-446655440001',
            pourId: '550e8400-e29b-41d4-a716-446655440002',
            origin: { x: 0, y: 0 },
            intensity: invalidIntensity,
            timestamp: Date.now(),
          };
          const result = CoffeePourSchema.safeParse(payload);
          expect(result.success).toBe(false);
        })
      );
    });
  });
});
