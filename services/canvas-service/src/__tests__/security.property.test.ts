import * as fc from 'fast-check';
import {
  StrokeBeginSchema,
  StrokeSegmentSchema,
  CoffeePourSchema,
} from '@coffee-canvas/shared';

describe('Security Property Tests: Input Validation (@coffee-canvas/shared)', () => {
  const hexColorArb = fc.stringMatching(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/);

  const timestampArb = fc.integer({
    min: 1600000000000,
    max: Number.MAX_SAFE_INTEGER,
  });

  describe('StrokeBeginSchema Validation', () => {
    it('should accept valid stroke_begin payloads', () => {
      const validArb = fc.record({
        roomId: fc.uuid(),
        userId: fc.uuid(),
        strokeId: fc.uuid(),
        tool: fc.constantFrom(
          'pen',
          'brush',
          'eraser',
          'marker',
          'calligraphy'
        ),
        color: hexColorArb,
        // FIX: Use double and exclude NaN/Infinity
        width: fc.double({
          min: 0.5,
          max: 500,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        timestamp: timestampArb,
      });

      fc.assert(
        fc.property(validArb, payload => {
          const result = StrokeBeginSchema.safeParse(payload);
          expect(result.success).toBe(true);
        })
      );
    });

    it('should reject out-of-bounds width', () => {
      // FIX: Use double to avoid the 32-bit float constraint error
      const invalidWidthArb = fc.oneof(
        fc.double({ max: 0.49, noNaN: true }),
        fc.double({ min: 500.01, noNaN: true })
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
            timestamp: 1712864000000,
          };
          const result = StrokeBeginSchema.safeParse(payload);
          expect(result.success).toBe(false);
        })
      );
    });

    it('should reject whitespace-only IDs', () => {
      const whitespaceArb = fc
        .stringMatching(/^\s+$/)
        .filter(s => s.length > 0);

      fc.assert(
        fc.property(whitespaceArb, blankId => {
          const payload = {
            roomId: blankId,
            userId: '550e8400-e29b-41d4-a716-446655440001',
            strokeId: '550e8400-e29b-41d4-a716-446655440002',
            tool: 'pen',
            color: '#000000',
            width: 5,
            timestamp: 1712864000000,
          };
          const result = StrokeBeginSchema.safeParse(payload);
          expect(result.success).toBe(false);
        })
      );
    });
  });

  describe('Coordinate Bounds Check (PointSchema)', () => {
    it('should reject coordinates outside ±1,000,000', () => {
      // FIX: Use double
      const hugeCoordArb = fc.oneof(
        fc.record({
          x: fc.double({ min: 1000001, noNaN: true }),
          y: fc.double({ noNaN: true }),
        }),
        fc.record({
          x: fc.double({ max: -1000001, noNaN: true }),
          y: fc.double({ noNaN: true }),
        }),
        fc.record({
          x: fc.double({ noNaN: true }),
          y: fc.double({ min: 1000001, noNaN: true }),
        }),
        fc.record({
          x: fc.double({ noNaN: true }),
          y: fc.double({ max: -1000001, noNaN: true }),
        })
      );

      fc.assert(
        fc.property(hugeCoordArb, invalidPoint => {
          const payload = {
            roomId: '550e8400-e29b-41d4-a716-446655440000',
            userId: '550e8400-e29b-41d4-a716-446655440001',
            strokeId: '550e8400-e29b-41d4-a716-446655440002',
            points: [invalidPoint],
            timestamp: 1712864000000,
          };
          const result = StrokeSegmentSchema.safeParse(payload);
          expect(result.success).toBe(false);
        })
      );
    });
  });

  describe('CoffeePourSchema Validation', () => {
    it('should reject extreme intensity values', () => {
      // FIX: Use double
      const invalidIntensityArb = fc.oneof(
        fc.double({ max: 0.09, noNaN: true }),
        fc.double({ min: 10.01, noNaN: true })
      );

      fc.assert(
        fc.property(invalidIntensityArb, invalidIntensity => {
          const payload = {
            roomId: '550e8400-e29b-41d4-a716-446655440000',
            userId: '550e8400-e29b-41d4-a716-446655440001',
            pourId: '550e8400-e29b-41d4-a716-446655440002',
            origin: { x: 0, y: 0 },
            intensity: invalidIntensity,
            timestamp: 1712864000000,
          };
          const result = CoffeePourSchema.safeParse(payload);
          expect(result.success).toBe(false);
        })
      );
    });
  });
});
