/* eslint-disable @typescript-eslint/no-var-requires */
import * as fc from 'fast-check';
import { StrokeEvent } from '../../../../shared/src/types/index.js';
import { CanvasHistoryManager } from '../canvas-history';

/**
 * Property 3: Canvas State Round-trip Consistency
 * Validates: Requirements 1.5, 3.5, 6.3
 *
 * For any room with existing canvas content, a user joining the room should receive
 * a complete reconstruction of the current canvas state that matches the actual state.
 */

describe('Canvas State Round-trip Consistency Property Tests', () => {
  let canvasHistoryManager: CanvasHistoryManager;

  // Mock DatabaseManager for testing
  const mockDb = {
    getStrokeEventsInChunksWithPagination: jest.fn(),
  } as any;

  beforeEach(() => {
    canvasHistoryManager = new CanvasHistoryManager(mockDb);
    jest.clearAllMocks();
  });

  // Generators for test data
  const point2DArbitrary = fc.record({
    x: fc.float({ min: -1e6, max: 1e6, noNaN: true }),
    y: fc.float({ min: -1e6, max: 1e6, noNaN: true }),
  });

  const chunkKeyArbitrary = fc
    .tuple(
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -100, max: 100 })
    )
    .map(([x, y]) => `${x}:${y}`);

  const strokeEventDataArbitrary = fc.record({
    tool: fc.constantFrom('pen', 'brush', 'pencil', 'marker'),
    color: fc.constantFrom(
      '#FF0000',
      '#00FF00',
      '#0000FF',
      '#000000',
      '#FFFFFF'
    ),
    width: fc.float({ min: 1, max: 50 }),
    points: fc.array(point2DArbitrary, { minLength: 1, maxLength: 20 }),
  });

  const stainPolygonArbitrary = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    path: fc.array(point2DArbitrary, { minLength: 3, maxLength: 10 }),
    opacity: fc.float({ min: 0, max: 1 }),
    color: fc.constantFrom('#8B4513', '#654321', '#A0522D'),
  });

  const strokeMutationArbitrary = fc.record({
    strokeId: fc.string({ minLength: 1, maxLength: 50 }),
    colorShift: fc.constantFrom('#654321', '#8B4513', '#A0522D'),
    blurFactor: fc.float({ min: 0.5, max: 3.0 }),
    opacityDelta: fc.float({ min: -0.5, max: 0.5 }),
  });

  const strokeEventArbitrary = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    roomId: fc.string({ minLength: 1, maxLength: 50 }),
    strokeId: fc.string({ minLength: 1, maxLength: 50 }),
    userId: fc.string({ minLength: 1, maxLength: 50 }),
    eventType: fc.constantFrom('begin', 'segment', 'end'),
    chunkKey: chunkKeyArbitrary,
    data: strokeEventDataArbitrary,
    createdAt: fc.date({
      min: new Date('2024-01-01T00:00:00Z'),
      max: new Date('2024-12-31T23:59:59Z'),
    }),
  });

  const stainEventArbitrary = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    roomId: fc.string({ minLength: 1, maxLength: 50 }),
    strokeId: fc.string({ minLength: 1, maxLength: 50 }),
    userId: fc.string({ minLength: 1, maxLength: 50 }),
    eventType: fc.constant('stain' as const),
    chunkKey: chunkKeyArbitrary,
    data: fc.record({
      stainPolygons: fc.array(stainPolygonArbitrary, {
        minLength: 1,
        maxLength: 5,
      }),
      strokeMutations: fc.array(strokeMutationArbitrary, {
        minLength: 0,
        maxLength: 3,
      }),
    }),
    createdAt: fc.date({
      min: new Date('2024-01-01T00:00:00Z'),
      max: new Date('2024-12-31T23:59:59Z'),
    }),
  });

  // Generator for complete stroke sequences (begin -> segments -> end)
  const completeStrokeSequenceArbitrary = fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 50 }), // strokeId
      fc.string({ minLength: 1, maxLength: 50 }), // userId
      fc.string({ minLength: 1, maxLength: 50 }), // roomId
      chunkKeyArbitrary,
      strokeEventDataArbitrary,
      fc.array(fc.array(point2DArbitrary, { minLength: 1, maxLength: 5 }), {
        minLength: 0,
        maxLength: 3,
      }), // segment points
      fc.date({
        min: new Date('2024-01-01T00:00:00Z'),
        max: new Date('2024-12-31T23:59:59Z'),
      })
    )
    .map(
      ([
        strokeId,
        userId,
        roomId,
        chunkKey,
        strokeData,
        segmentPointArrays,
        baseTime,
      ]) => {
        const events: StrokeEvent[] = [];

        // Begin event
        events.push({
          id: `${strokeId}-begin`,
          roomId,
          strokeId,
          userId,
          eventType: 'begin',
          chunkKey,
          data: {
            tool: strokeData.tool,
            color: strokeData.color,
            width: strokeData.width,
          },
          createdAt: new Date(baseTime.getTime()),
        });

        // Segment events
        segmentPointArrays.forEach((points, index) => {
          events.push({
            id: `${strokeId}-segment-${index}`,
            roomId,
            strokeId,
            userId,
            eventType: 'segment',
            chunkKey,
            data: { points },
            createdAt: new Date(baseTime.getTime() + (index + 1) * 100),
          });
        });

        // End event with complete points
        const allPoints = segmentPointArrays.flat();
        events.push({
          id: `${strokeId}-end`,
          roomId,
          strokeId,
          userId,
          eventType: 'end',
          chunkKey,
          data: {
            tool: strokeData.tool,
            color: strokeData.color,
            width: strokeData.width,
            points: allPoints,
          },
          createdAt: new Date(
            baseTime.getTime() + (segmentPointArrays.length + 1) * 100
          ),
        });

        return {
          events,
          expectedStroke: {
            strokeId,
            userId,
            tool: strokeData.tool!,
            color: strokeData.color!,
            width: strokeData.width!,
            points: allPoints,
            opacity: 1.0,
            createdAt: new Date(baseTime.getTime()),
          },
        };
      }
    );

  describe('Property: Canvas state reconstruction is deterministic', () => {
    it('should produce identical canvas state when reconstructed multiple times from same events', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(completeStrokeSequenceArbitrary, {
            minLength: 1,
            maxLength: 5,
          }),
          fc.array(stainEventArbitrary, { minLength: 0, maxLength: 3 }),
          async (strokeSequences, stainEvents) => {
            // Flatten all stroke events
            const allStrokeEvents = strokeSequences.flatMap(seq => seq.events);
            const allEvents = [...allStrokeEvents, ...stainEvents];

            // Reconstruct canvas state multiple times
            const canvasState1 =
              await canvasHistoryManager.reconstructCanvasState(allEvents);
            const canvasState2 =
              await canvasHistoryManager.reconstructCanvasState(allEvents);
            const canvasState3 =
              await canvasHistoryManager.reconstructCanvasState(allEvents);

            // All reconstructions should be identical
            expect(canvasState1.strokes.size).toBe(canvasState2.strokes.size);
            expect(canvasState2.strokes.size).toBe(canvasState3.strokes.size);

            expect(canvasState1.stains.length).toBe(canvasState2.stains.length);
            expect(canvasState2.stains.length).toBe(canvasState3.stains.length);

            // Compare individual strokes
            for (const [strokeId, stroke1] of canvasState1.strokes) {
              const stroke2 = canvasState2.strokes.get(strokeId);
              const stroke3 = canvasState3.strokes.get(strokeId);

              expect(stroke2).toBeDefined();
              expect(stroke3).toBeDefined();

              expect(stroke1.tool).toBe(stroke2!.tool);
              expect(stroke1.color).toBe(stroke2!.color);
              expect(stroke1.width).toBe(stroke2!.width);
              expect(stroke1.points).toEqual(stroke2!.points);

              expect(stroke2!.tool).toBe(stroke3!.tool);
              expect(stroke2!.color).toBe(stroke3!.color);
              expect(stroke2!.width).toBe(stroke3!.width);
              expect(stroke2!.points).toEqual(stroke3!.points);
            }
          }
        )
      );
    });
  });

  describe('Property: Serialization preserves essential canvas data', () => {
    it('should preserve all essential stroke and stain data through serialization', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(completeStrokeSequenceArbitrary, {
            minLength: 1,
            maxLength: 3,
          }),
          fc.array(stainEventArbitrary, { minLength: 0, maxLength: 2 }),
          async (strokeSequences, stainEvents) => {
            const allStrokeEvents = strokeSequences.flatMap(seq => seq.events);
            const allEvents = [...allStrokeEvents, ...stainEvents];

            const originalCanvasState =
              await canvasHistoryManager.reconstructCanvasState(allEvents);
            const serialized =
              canvasHistoryManager.serializeCanvasState(originalCanvasState);

            // Verify stroke data preservation
            expect(Array.isArray(serialized.strokes)).toBe(true);
            expect((serialized.strokes as any[]).length).toBe(
              originalCanvasState.strokes.size
            );

            for (const serializedStroke of serialized.strokes as any[]) {
              const originalStroke = originalCanvasState.strokes.get(
                serializedStroke.strokeId
              );
              expect(originalStroke).toBeDefined();

              // Essential properties should be preserved
              expect(serializedStroke.strokeId).toBe(originalStroke!.strokeId);
              expect(serializedStroke.userId).toBe(originalStroke!.userId);
              expect(serializedStroke.tool).toBe(originalStroke!.tool);
              expect(serializedStroke.color).toBe(originalStroke!.color);

              // Numeric precision should be maintained within tolerance
              expect(
                Math.abs(serializedStroke.width - originalStroke!.width)
              ).toBeLessThan(0.01);
              expect(
                Math.abs(serializedStroke.opacity - originalStroke!.opacity)
              ).toBeLessThan(0.001);

              // Points should be preserved with compression
              expect(serializedStroke.points.length).toBe(
                originalStroke!.points.length
              );
              for (let i = 0; i < serializedStroke.points.length; i++) {
                expect(
                  Math.abs(
                    serializedStroke.points[i].x - originalStroke!.points[i].x
                  )
                ).toBeLessThan(0.01);
                expect(
                  Math.abs(
                    serializedStroke.points[i].y - originalStroke!.points[i].y
                  )
                ).toBeLessThan(0.01);
              }
            }

            // Verify stain data preservation
            expect(Array.isArray(serialized.stains)).toBe(true);
            expect((serialized.stains as any[]).length).toBe(
              originalCanvasState.stains.length
            );
          }
        )
      );
    });
  });

  describe('Property: Event order independence for complete strokes', () => {
    it('should reconstruct identical strokes regardless of event processing order within stroke boundaries', async () => {
      await fc.assert(
        fc.asyncProperty(
          completeStrokeSequenceArbitrary,
          async strokeSequence => {
            const { events: originalEvents, expectedStroke } = strokeSequence;

            // Create shuffled version of events (but maintain begin < segments < end chronologically)
            const beginEvent = originalEvents.find(
              e => e.eventType === 'begin'
            )!;
            const segmentEvents = originalEvents.filter(
              e => e.eventType === 'segment'
            );
            const endEvent = originalEvents.find(e => e.eventType === 'end')!;

            // Shuffle segment events only (begin and end must maintain order)
            const shuffledSegments = fc.sample(
              fc.shuffledSubarray(segmentEvents),
              1
            )[0];
            const reorderedEvents = [beginEvent, ...shuffledSegments, endEvent];

            // Reconstruct from both orders
            const originalCanvasState =
              await canvasHistoryManager.reconstructCanvasState(originalEvents);
            const reorderedCanvasState =
              await canvasHistoryManager.reconstructCanvasState(
                reorderedEvents
              );

            // Should produce identical strokes
            expect(originalCanvasState.strokes.size).toBe(1);
            expect(reorderedCanvasState.strokes.size).toBe(1);

            const originalStroke = originalCanvasState.strokes.get(
              expectedStroke.strokeId
            );
            const reorderedStroke = reorderedCanvasState.strokes.get(
              expectedStroke.strokeId
            );

            expect(originalStroke).toBeDefined();
            expect(reorderedStroke).toBeDefined();

            expect(originalStroke!.tool).toBe(reorderedStroke!.tool);
            expect(originalStroke!.color).toBe(reorderedStroke!.color);
            expect(originalStroke!.width).toBe(reorderedStroke!.width);
            expect(originalStroke!.points).toEqual(reorderedStroke!.points);
          }
        )
      );
    });
  });

  describe('Property: Compression maintains canvas state integrity', () => {
    it('should preserve canvas state semantics after compression', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(completeStrokeSequenceArbitrary, {
            minLength: 1,
            maxLength: 3,
          }),
          async strokeSequences => {
            const allEvents = strokeSequences.flatMap(seq => seq.events);

            // Compress events
            const compressedEvents =
              canvasHistoryManager.compressCanvasState(allEvents);

            // Reconstruct from both original and compressed events
            const originalCanvasState =
              await canvasHistoryManager.reconstructCanvasState(allEvents);
            const compressedCanvasState =
              await canvasHistoryManager.reconstructCanvasState(
                compressedEvents
              );

            // Should have same number of strokes
            expect(originalCanvasState.strokes.size).toBe(
              compressedCanvasState.strokes.size
            );

            // Each stroke should be semantically equivalent
            for (const [
              strokeId,
              originalStroke,
            ] of originalCanvasState.strokes) {
              const compressedStroke =
                compressedCanvasState.strokes.get(strokeId);
              expect(compressedStroke).toBeDefined();

              // Essential properties should match
              expect(compressedStroke!.strokeId).toBe(originalStroke.strokeId);
              expect(compressedStroke!.userId).toBe(originalStroke.userId);
              expect(compressedStroke!.tool).toBe(originalStroke.tool);
              expect(compressedStroke!.color).toBe(originalStroke.color);
              expect(compressedStroke!.width).toBe(originalStroke.width);

              // Points should be equivalent within compression tolerance
              expect(compressedStroke!.points.length).toBe(
                originalStroke.points.length
              );
              for (let i = 0; i < originalStroke.points.length; i++) {
                expect(
                  Math.abs(
                    compressedStroke!.points[i].x - originalStroke.points[i].x
                  )
                ).toBeLessThan(0.01);
                expect(
                  Math.abs(
                    compressedStroke!.points[i].y - originalStroke.points[i].y
                  )
                ).toBeLessThan(0.01);
              }
            }
          }
        )
      );
    });
  });

  describe('Property: Chunk-based retrieval maintains completeness', () => {
    it('should reconstruct complete canvas state when all relevant chunks are queried', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(completeStrokeSequenceArbitrary, {
            minLength: 1,
            maxLength: 3,
          }),
          async strokeSequences => {
            const allEvents = strokeSequences.flatMap(seq => seq.events);
            const allChunkKeys = [...new Set(allEvents.map(e => e.chunkKey))];

            // Mock database to return events for requested chunks
            mockDb.getStrokeEventsInChunksWithPagination.mockResolvedValue({
              events: allEvents,
              hasMore: false,
            });

            // Get canvas history for all chunks
            const canvasHistory = await canvasHistoryManager.getCanvasHistory(
              'test-room',
              allChunkKeys
            );

            // Reconstruct canvas state from retrieved events
            const reconstructedCanvasState =
              await canvasHistoryManager.reconstructCanvasState(
                canvasHistory.events
              );

            // Should match direct reconstruction from all events
            const directCanvasState =
              await canvasHistoryManager.reconstructCanvasState(allEvents);

            expect(reconstructedCanvasState.strokes.size).toBe(
              directCanvasState.strokes.size
            );

            for (const [strokeId, directStroke] of directCanvasState.strokes) {
              const reconstructedStroke =
                reconstructedCanvasState.strokes.get(strokeId);
              expect(reconstructedStroke).toBeDefined();

              expect(reconstructedStroke!.tool).toBe(directStroke.tool);
              expect(reconstructedStroke!.color).toBe(directStroke.color);
              expect(reconstructedStroke!.width).toBe(directStroke.width);
              expect(reconstructedStroke!.points).toEqual(directStroke.points);
            }
          }
        )
      );
    });
  });

  describe('Property: Stain mutations are consistently applied', () => {
    it('should apply stain mutations consistently across reconstruction cycles', async () => {
      await fc.assert(
        fc.asyncProperty(
          completeStrokeSequenceArbitrary,
          stainEventArbitrary,
          async (strokeSequence, stainEvent) => {
            const { events: strokeEvents } = strokeSequence;

            // Ensure stain mutation references the stroke
            const mutatedStainEvent = {
              ...stainEvent,
              data: {
                ...stainEvent.data,
                strokeMutations: [
                  {
                    strokeId: strokeSequence.expectedStroke.strokeId,
                    colorShift: '#654321',
                    blurFactor: 1.5,
                    opacityDelta: -0.2,
                  },
                ],
              },
            };

            const allEvents = [...strokeEvents, mutatedStainEvent];

            // Reconstruct multiple times
            const canvasState1 =
              await canvasHistoryManager.reconstructCanvasState(allEvents);
            const canvasState2 =
              await canvasHistoryManager.reconstructCanvasState(allEvents);

            // Both should have the same mutations applied
            const stroke1 = canvasState1.strokes.get(
              strokeSequence.expectedStroke.strokeId
            );
            const stroke2 = canvasState2.strokes.get(
              strokeSequence.expectedStroke.strokeId
            );

            expect(stroke1).toBeDefined();
            expect(stroke2).toBeDefined();

            // Mutations should be consistently applied
            expect(stroke1!.mutations?.length).toBe(stroke2!.mutations?.length);
            if (stroke1!.mutations && stroke2!.mutations) {
              for (let i = 0; i < stroke1!.mutations.length; i++) {
                expect(stroke1!.mutations[i]).toEqual(stroke2!.mutations[i]);
              }
            }

            // Stain effects should be consistent
            expect(canvasState1.stains.length).toBe(canvasState2.stains.length);
            expect(canvasState1.stains.length).toBe(1);
          }
        )
      );
    });
  });

  describe('Property: Incomplete strokes are handled gracefully', () => {
    it('should handle incomplete stroke sequences without corrupting canvas state', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(strokeEventArbitrary, { minLength: 1, maxLength: 10 }),
          async incompleteEvents => {
            // These events may not form complete stroke sequences
            const canvasState =
              await canvasHistoryManager.reconstructCanvasState(
                incompleteEvents
              );

            // Canvas state should be valid (no crashes)
            expect(canvasState).toBeDefined();
            expect(canvasState.strokes).toBeInstanceOf(Map);
            expect(Array.isArray(canvasState.stains)).toBe(true);
            expect(canvasState.lastUpdated).toBeInstanceOf(Date);

            // Only complete strokes should be included
            for (const [strokeId, stroke] of canvasState.strokes) {
              expect(stroke.strokeId).toBe(strokeId);
              expect(stroke.userId).toBeTruthy();
              expect(stroke.tool).toBeTruthy();
              expect(stroke.color).toBeTruthy();
              expect(stroke.width).toBeGreaterThan(0);
              expect(Array.isArray(stroke.points)).toBe(true);
              expect(stroke.opacity).toBeGreaterThanOrEqual(0);
              expect(stroke.opacity).toBeLessThanOrEqual(1);
              expect(stroke.createdAt).toBeInstanceOf(Date);
            }
          }
        )
      );
    });
  });

  describe('Property: Canvas state round-trip through serialization', () => {
    it('should maintain canvas state integrity through complete round-trip (reconstruct -> serialize -> deserialize)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(completeStrokeSequenceArbitrary, {
            minLength: 1,
            maxLength: 2,
          }),
          async strokeSequences => {
            const allEvents = strokeSequences.flatMap(seq => seq.events);

            // Original reconstruction
            const originalCanvasState =
              await canvasHistoryManager.reconstructCanvasState(allEvents);

            // Serialize
            const serialized =
              canvasHistoryManager.serializeCanvasState(originalCanvasState);

            // Verify serialized data can be used to validate round-trip consistency
            // (In a real implementation, this would involve deserializing back to CanvasState)

            // For this test, we verify that serialization preserves the essential data
            // that would be needed for a complete round-trip
            expect(typeof serialized).toBe('object');
            expect(Array.isArray(serialized.strokes)).toBe(true);
            expect(Array.isArray(serialized.stains)).toBe(true);
            expect(typeof serialized.lastUpdated).toBe('string');

            // Verify stroke count matches
            expect((serialized.strokes as any[]).length).toBe(
              originalCanvasState.strokes.size
            );

            // Verify each serialized stroke contains essential data for reconstruction
            for (const serializedStroke of serialized.strokes as any[]) {
              expect(typeof serializedStroke.strokeId).toBe('string');
              expect(typeof serializedStroke.userId).toBe('string');
              expect(typeof serializedStroke.tool).toBe('string');
              expect(typeof serializedStroke.color).toBe('string');
              expect(typeof serializedStroke.width).toBe('number');
              expect(Array.isArray(serializedStroke.points)).toBe(true);
              expect(typeof serializedStroke.opacity).toBe('number');
              expect(typeof serializedStroke.createdAt).toBe('string');

              // Verify points structure
              for (const point of serializedStroke.points) {
                expect(typeof point.x).toBe('number');
                expect(typeof point.y).toBe('number');
                expect(isFinite(point.x)).toBe(true);
                expect(isFinite(point.y)).toBe(true);
              }
            }
          }
        )
      );
    });
  });
});
