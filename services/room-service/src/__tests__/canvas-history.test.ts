// Unit tests for Canvas History Replay functionality

import { StrokeEvent } from '../../../../shared/src/types/index.js';
import { CanvasHistoryManager } from '../canvas-history';

// Mock DatabaseManager
const mockDb = {
  getStrokeEventsInChunksWithPagination: jest.fn(),
} as any;

describe('CanvasHistoryManager', () => {
  let canvasHistoryManager: CanvasHistoryManager;

  beforeEach(() => {
    canvasHistoryManager = new CanvasHistoryManager(mockDb);
    jest.clearAllMocks();
  });

  describe('getCanvasHistory', () => {
    it('should validate chunk keys format', async () => {
      const invalidChunkKeys = ['invalid', '1:2:3', 'abc:def'];

      for (const invalidKey of invalidChunkKeys) {
        await expect(
          canvasHistoryManager.getCanvasHistory('room1', [invalidKey])
        ).rejects.toThrow('Invalid chunk key format');
      }
    });

    it('should return empty result for empty chunk keys', async () => {
      const result = await canvasHistoryManager.getCanvasHistory('room1', []);

      expect(result).toEqual({
        events: [],
        cursor: undefined,
        hasMore: false,
        totalEvents: 0,
      });
    });

    it('should clamp limit between 1 and 500', async () => {
      mockDb.getStrokeEventsInChunksWithPagination.mockResolvedValue({
        events: [],
        hasMore: false,
      });

      // Test minimum limit
      await canvasHistoryManager.getCanvasHistory(
        'room1',
        ['0:0'],
        undefined,
        0
      );
      expect(mockDb.getStrokeEventsInChunksWithPagination).toHaveBeenCalledWith(
        'room1',
        ['0:0'],
        undefined,
        1
      );

      // Test maximum limit
      await canvasHistoryManager.getCanvasHistory(
        'room1',
        ['0:0'],
        undefined,
        1000
      );
      expect(mockDb.getStrokeEventsInChunksWithPagination).toHaveBeenCalledWith(
        'room1',
        ['0:0'],
        undefined,
        500
      );
    });

    it('should handle valid chunk keys', async () => {
      const validChunkKeys = ['0:0', '-1:1', '100:-50'];
      const mockEvents: StrokeEvent[] = [
        {
          id: 'event1',
          roomId: 'room1',
          strokeId: 'stroke1',
          userId: 'user1',
          eventType: 'begin',
          chunkKey: '0:0',
          data: { tool: 'pen', color: '#000000', width: 2 },
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ];

      mockDb.getStrokeEventsInChunksWithPagination.mockResolvedValue({
        events: mockEvents,
        hasMore: false,
      });

      const result = await canvasHistoryManager.getCanvasHistory(
        'room1',
        validChunkKeys
      );

      expect(result.events).toEqual(mockEvents);
      expect(result.hasMore).toBe(false);
      expect(mockDb.getStrokeEventsInChunksWithPagination).toHaveBeenCalledWith(
        'room1',
        validChunkKeys,
        undefined,
        100
      );
    });
  });

  describe('reconstructCanvasState', () => {
    it('should reconstruct complete strokes from events', async () => {
      const events: StrokeEvent[] = [
        {
          id: 'event1',
          roomId: 'room1',
          strokeId: 'stroke1',
          userId: 'user1',
          eventType: 'begin',
          chunkKey: '0:0',
          data: { tool: 'pen', color: '#FF0000', width: 3 },
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'event2',
          roomId: 'room1',
          strokeId: 'stroke1',
          userId: 'user1',
          eventType: 'segment',
          chunkKey: '0:0',
          data: {
            points: [
              { x: 10, y: 20 },
              { x: 15, y: 25 },
            ],
          },
          createdAt: new Date('2024-01-01T10:00:01Z'),
        },
        {
          id: 'event3',
          roomId: 'room1',
          strokeId: 'stroke1',
          userId: 'user1',
          eventType: 'end',
          chunkKey: '0:0',
          data: {
            points: [
              { x: 10, y: 20 },
              { x: 15, y: 25 },
              { x: 20, y: 30 },
            ],
          },
          createdAt: new Date('2024-01-01T10:00:02Z'),
        },
      ];

      const canvasState =
        await canvasHistoryManager.reconstructCanvasState(events);

      expect(canvasState.strokes.size).toBe(1);

      const stroke = canvasState.strokes.get('stroke1');
      expect(stroke).toBeDefined();
      expect(stroke!.tool).toBe('pen');
      expect(stroke!.color).toBe('#FF0000');
      expect(stroke!.width).toBe(3);
      expect(stroke!.points).toEqual([
        { x: 10, y: 20 },
        { x: 15, y: 25 },
        { x: 20, y: 30 },
      ]);
    });

    it('should handle incomplete strokes gracefully', async () => {
      const events: StrokeEvent[] = [
        {
          id: 'event1',
          roomId: 'room1',
          strokeId: 'stroke1',
          userId: 'user1',
          eventType: 'segment',
          chunkKey: '0:0',
          data: { points: [{ x: 10, y: 20 }] },
          createdAt: new Date('2024-01-01T10:00:01Z'),
        },
      ];

      const canvasState =
        await canvasHistoryManager.reconstructCanvasState(events);

      // Should not include incomplete stroke (missing begin event)
      expect(canvasState.strokes.size).toBe(0);
    });

    it('should process stain events correctly', async () => {
      const events: StrokeEvent[] = [
        {
          id: 'stain1',
          roomId: 'room1',
          strokeId: 'stain1',
          userId: 'user1',
          eventType: 'stain',
          chunkKey: '0:0',
          data: {
            stainPolygons: [
              {
                id: 'polygon1',
                path: [
                  { x: 0, y: 0 },
                  { x: 10, y: 0 },
                  { x: 10, y: 10 },
                ],
                opacity: 0.5,
                color: '#8B4513',
              },
            ],
            strokeMutations: [
              {
                strokeId: 'stroke1',
                colorShift: '#654321',
                blurFactor: 1.2,
                opacityDelta: -0.1,
              },
            ],
          },
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ];

      const canvasState =
        await canvasHistoryManager.reconstructCanvasState(events);

      expect(canvasState.stains).toHaveLength(1);
      expect(canvasState.stains[0].polygons).toHaveLength(1);
      expect(canvasState.stains[0].mutations).toHaveLength(1);
    });
  });

  describe('compressCanvasState', () => {
    it('should compress point coordinates to 2 decimal places', () => {
      const events: StrokeEvent[] = [
        {
          id: 'event1',
          roomId: 'room1',
          strokeId: 'stroke1',
          userId: 'user1',
          eventType: 'segment',
          chunkKey: '0:0',
          data: { points: [{ x: 10.123456, y: 20.987654 }] },
          createdAt: new Date(),
        },
      ];

      const compressed = canvasHistoryManager.compressCanvasState(events);

      expect(compressed[0].data.points).toEqual([{ x: 10.12, y: 20.99 }]);
    });

    it('should preserve essential data for begin events', () => {
      const events: StrokeEvent[] = [
        {
          id: 'event1',
          roomId: 'room1',
          strokeId: 'stroke1',
          userId: 'user1',
          eventType: 'begin',
          chunkKey: '0:0',
          data: {
            tool: 'pen',
            color: '#FF0000',
            width: 2.5,
          },
          createdAt: new Date(),
        },
      ];

      const compressed = canvasHistoryManager.compressCanvasState(events);

      expect(compressed[0].data).toEqual({
        tool: 'pen',
        color: '#FF0000',
        width: 2.5,
      });
    });
  });

  describe('serializeCanvasState', () => {
    it('should serialize canvas state for network transfer', () => {
      const mockCanvasState = {
        strokes: new Map([
          [
            'stroke1',
            {
              strokeId: 'stroke1',
              userId: 'user1',
              tool: 'pen',
              color: '#FF0000',
              width: 2.123456,
              points: [{ x: 10.123456, y: 20.987654 }],
              opacity: 0.987654,
              createdAt: new Date('2024-01-01T10:00:00Z'),
            },
          ],
        ]),
        stains: [
          {
            id: 'stain1',
            polygons: [
              {
                id: 'polygon1',
                path: [{ x: 1.123456, y: 2.987654 }],
                opacity: 0.123456,
                color: '#8B4513',
              },
            ],
            mutations: [],
            createdAt: new Date('2024-01-01T10:00:00Z'),
          },
        ],
        lastUpdated: new Date('2024-01-01T10:00:00Z'),
      };

      const serialized =
        canvasHistoryManager.serializeCanvasState(mockCanvasState);

      expect(serialized.strokes).toHaveLength(1);
      expect((serialized.strokes as any)[0].width).toBe(2.12);
      expect((serialized.strokes as any)[0].points).toEqual([
        { x: 10.12, y: 20.99 },
      ]);
      expect((serialized.strokes as any)[0].opacity).toBe(0.988);

      expect(serialized.stains).toHaveLength(1);
      expect((serialized.stains as any)[0].polygons[0].path).toEqual([
        { x: 1.12, y: 2.99 },
      ]);
      expect((serialized.stains as any)[0].polygons[0].opacity).toBe(0.123);

      expect(serialized.lastUpdated).toBe('2024-01-01T10:00:00.000Z');
    });
  });
});
