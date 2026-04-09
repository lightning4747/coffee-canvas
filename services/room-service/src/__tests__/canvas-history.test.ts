import { Point2D, StrokeEvent } from '@coffee-canvas/shared';
import { DatabaseManager } from '@coffee-canvas/shared';
import {
  CanvasHistoryManager,
  CanvasState,
  ReconstructedStroke,
} from '../canvas-history';

// Mock the database manager
jest.mock('@coffee-canvas/shared');

describe('Canvas History Manager', () => {
  let canvasHistoryManager: CanvasHistoryManager;
  let mockDb: jest.Mocked<DatabaseManager>;

  const mockStrokeEvent: StrokeEvent = {
    id: 'event-1',
    roomId: 'room-123',
    strokeId: 'stroke-1',
    userId: 'user-1',
    eventType: 'begin',
    chunkKey: '0:0',
    data: {
      tool: 'pen',
      color: '#FF0000',
      width: 2,
    },
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  const mockPoints: Point2D[] = [
    { x: 100, y: 200 },
    { x: 101, y: 201 },
    { x: 102, y: 202 },
  ];

  beforeEach(() => {
    mockDb = {
      getStrokeEventsInChunksWithPagination: jest.fn(),
    } as unknown as jest.Mocked<DatabaseManager>;

    canvasHistoryManager = new CanvasHistoryManager(mockDb);
  });

  describe('getCanvasHistory', () => {
    it('should return empty result for empty chunk keys', async () => {
      const result = await canvasHistoryManager.getCanvasHistory(
        'room-123',
        [],
        undefined,
        100
      );

      expect(result.events).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeUndefined();
      expect(result.totalEvents).toBe(0);
    });

    it('should validate chunk key format', async () => {
      const invalidChunkKeys = ['invalid', '1:2:3', 'a:b', ''];

      for (const invalidKey of invalidChunkKeys) {
        await expect(
          canvasHistoryManager.getCanvasHistory(
            'room-123',
            [invalidKey],
            undefined,
            100
          )
        ).rejects.toThrow('Invalid chunk key format');
      }
    });

    it('should accept valid chunk key formats', async () => {
      const validChunkKeys = ['0:0', '1:1', '-1:-1', '100:200', '-50:75'];

      mockDb.getStrokeEventsInChunksWithPagination.mockResolvedValue({
        events: [],
        hasMore: false,
      });

      for (const validKey of validChunkKeys) {
        await expect(
          canvasHistoryManager.getCanvasHistory(
            'room-123',
            [validKey],
            undefined,
            100
          )
        ).resolves.toBeDefined();
      }
    });

    it('should clamp limit between 1 and 500', async () => {
      mockDb.getStrokeEventsInChunksWithPagination.mockResolvedValue({
        events: [],
        hasMore: false,
      });

      // Test minimum limit
      await canvasHistoryManager.getCanvasHistory(
        'room-123',
        ['0:0'],
        undefined,
        0
      );
      expect(mockDb.getStrokeEventsInChunksWithPagination).toHaveBeenCalledWith(
        'room-123',
        ['0:0'],
        undefined,
        1
      );

      // Test maximum limit
      await canvasHistoryManager.getCanvasHistory(
        'room-123',
        ['0:0'],
        undefined,
        1000
      );
      expect(mockDb.getStrokeEventsInChunksWithPagination).toHaveBeenCalledWith(
        'room-123',
        ['0:0'],
        undefined,
        500
      );
    });

    it('should generate cursor from last event timestamp', async () => {
      const events = [
        { ...mockStrokeEvent, createdAt: new Date('2024-01-01T00:00:00Z') },
        {
          ...mockStrokeEvent,
          id: 'event-2',
          createdAt: new Date('2024-01-01T00:01:00Z'),
        },
      ];

      mockDb.getStrokeEventsInChunksWithPagination.mockResolvedValue({
        events,
        hasMore: true,
      });

      const result = await canvasHistoryManager.getCanvasHistory(
        'room-123',
        ['0:0'],
        undefined,
        100
      );

      expect(result.cursor).toBe('2024-01-01T00:01:00.000Z');
      expect(result.hasMore).toBe(true);
    });

    it('should handle database errors', async () => {
      mockDb.getStrokeEventsInChunksWithPagination.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        canvasHistoryManager.getCanvasHistory(
          'room-123',
          ['0:0'],
          undefined,
          100
        )
      ).rejects.toThrow('Failed to fetch canvas history');
    });

    it('should parse cursor date correctly', async () => {
      const cursorDate = '2024-01-01T12:00:00.000Z';

      mockDb.getStrokeEventsInChunksWithPagination.mockResolvedValue({
        events: [],
        hasMore: false,
      });

      await canvasHistoryManager.getCanvasHistory(
        'room-123',
        ['0:0'],
        cursorDate,
        100
      );

      expect(mockDb.getStrokeEventsInChunksWithPagination).toHaveBeenCalledWith(
        'room-123',
        ['0:0'],
        new Date(cursorDate),
        100
      );
    });
  });

  describe('reconstructCanvasState', () => {
    it('should reconstruct complete strokes from event sequence', async () => {
      const events: StrokeEvent[] = [
        {
          ...mockStrokeEvent,
          eventType: 'begin',
          data: { tool: 'pen', color: '#FF0000', width: 2 },
        },
        {
          ...mockStrokeEvent,
          id: 'event-2',
          eventType: 'segment',
          data: { points: mockPoints.slice(0, 2) },
        },
        {
          ...mockStrokeEvent,
          id: 'event-3',
          eventType: 'end',
          data: { points: mockPoints },
        },
      ];

      const canvasState =
        await canvasHistoryManager.reconstructCanvasState(events);

      expect(canvasState.strokes.size).toBe(1);
      const stroke = canvasState.strokes.get('stroke-1');
      expect(stroke).toBeDefined();
      expect(stroke!.tool).toBe('pen');
      expect(stroke!.color).toBe('#FF0000');
      expect(stroke!.width).toBe(2);
      expect(stroke!.points).toEqual(mockPoints);
    });

    it('should handle incomplete strokes gracefully', async () => {
      const events: StrokeEvent[] = [
        {
          ...mockStrokeEvent,
          eventType: 'segment', // Missing begin event
          data: { points: mockPoints },
        },
      ];

      const canvasState =
        await canvasHistoryManager.reconstructCanvasState(events);

      expect(canvasState.strokes.size).toBe(0); // Incomplete stroke should be ignored
    });

    it('should process stain events and apply mutations', async () => {
      const stainEvent: StrokeEvent = {
        ...mockStrokeEvent,
        id: 'stain-1',
        eventType: 'stain',
        data: {
          stainPolygons: [
            {
              id: 'polygon-1',
              path: [
                { x: 50, y: 50 },
                { x: 60, y: 60 },
              ],
              opacity: 0.5,
              color: '#8B4513',
            },
          ],
          strokeMutations: [
            {
              strokeId: 'stroke-1',
              colorShift: '#AA0000',
              blurFactor: 1.2,
              opacityDelta: -0.1,
            },
          ],
        },
      };

      const strokeEvents: StrokeEvent[] = [
        {
          ...mockStrokeEvent,
          eventType: 'begin',
          data: { tool: 'pen', color: '#FF0000', width: 2 },
        },
        {
          ...mockStrokeEvent,
          id: 'event-2',
          eventType: 'end',
          data: { points: mockPoints },
        },
      ];

      const canvasState = await canvasHistoryManager.reconstructCanvasState([
        ...strokeEvents,
        stainEvent,
      ]);

      expect(canvasState.stains).toHaveLength(1);
      expect(canvasState.stains[0].polygons).toHaveLength(1);

      const stroke = canvasState.strokes.get('stroke-1');
      expect(stroke!.mutations).toHaveLength(1);
      expect(stroke!.mutations![0].colorShift).toBe('#AA0000');
    });

    it('should update lastUpdated timestamp', async () => {
      const latestDate = new Date('2024-01-01T12:00:00Z');
      const events: StrokeEvent[] = [
        { ...mockStrokeEvent, createdAt: new Date('2024-01-01T10:00:00Z') },
        { ...mockStrokeEvent, id: 'event-2', createdAt: latestDate },
      ];

      const canvasState =
        await canvasHistoryManager.reconstructCanvasState(events);

      expect(canvasState.lastUpdated).toEqual(latestDate);
    });
  });

  describe('compressCanvasState', () => {
    it('should compress stroke points to 2 decimal places', () => {
      const events: StrokeEvent[] = [
        {
          ...mockStrokeEvent,
          eventType: 'end',
          data: {
            tool: 'pen',
            color: '#FF0000',
            width: 2.123456,
            points: [
              { x: 100.123456, y: 200.987654 },
              { x: 101.555555, y: 201.111111 },
            ],
          },
        },
      ];

      const compressed = canvasHistoryManager.compressCanvasState(events);

      expect(compressed[0].data.points).toEqual([
        { x: 100.12, y: 200.99 },
        { x: 101.56, y: 201.11 },
      ]);
    });

    it('should compress stain polygon data', () => {
      const events: StrokeEvent[] = [
        {
          ...mockStrokeEvent,
          eventType: 'stain',
          data: {
            stainPolygons: [
              {
                id: 'polygon-1',
                path: [{ x: 50.123456, y: 50.987654 }],
                opacity: 0.123456789,
                color: '#8B4513',
              },
            ],
            strokeMutations: [
              {
                strokeId: 'stroke-1',
                colorShift: '#AA0000',
                blurFactor: 1.123456789,
                opacityDelta: -0.123456789,
              },
            ],
          },
        },
      ];

      const compressed = canvasHistoryManager.compressCanvasState(events);

      const stainData = compressed[0].data;
      expect(stainData.stainPolygons![0].path).toEqual([
        { x: 50.12, y: 50.99 },
      ]);
      expect(stainData.stainPolygons![0].opacity).toBe(0.123);
      expect(stainData.strokeMutations![0].blurFactor).toBe(1.123);
      expect(stainData.strokeMutations![0].opacityDelta).toBe(-0.123);
    });

    it('should compress stroke events while preserving structure', () => {
      const events: StrokeEvent[] = [
        { ...mockStrokeEvent, eventType: 'begin' },
        {
          ...mockStrokeEvent,
          id: 'event-2',
          eventType: 'segment',
          data: { points: mockPoints.slice(0, 1) },
        },
        {
          ...mockStrokeEvent,
          id: 'event-3',
          eventType: 'segment',
          data: { points: mockPoints.slice(1, 2) },
        },
        {
          ...mockStrokeEvent,
          id: 'event-4',
          eventType: 'end',
          data: { points: mockPoints },
        },
      ];

      const compressed = canvasHistoryManager.compressCanvasState(events);

      // Should preserve all events but compress the data
      expect(compressed).toHaveLength(4);
      expect(compressed.map(e => e.eventType)).toEqual([
        'begin',
        'segment',
        'segment',
        'end',
      ]);

      // Points should be compressed to 2 decimal places
      const endEvent = compressed.find(e => e.eventType === 'end');
      expect(endEvent?.data.points).toEqual([
        { x: 100, y: 200 },
        { x: 101, y: 201 },
        { x: 102, y: 202 },
      ]);
    });
  });

  describe('serializeCanvasState', () => {
    it('should serialize canvas state for network transfer', () => {
      const stroke: ReconstructedStroke = {
        strokeId: 'stroke-1',
        userId: 'user-1',
        tool: 'pen',
        color: '#FF0000',
        width: 2.123456,
        points: [{ x: 100.123456, y: 200.987654 }],
        opacity: 0.987654321,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        mutations: [
          {
            strokeId: 'stroke-1',
            colorShift: '#AA0000',
            blurFactor: 1.123456789,
            opacityDelta: -0.123456789,
          },
        ],
      };

      const canvasState: CanvasState = {
        strokes: new Map([['stroke-1', stroke]]),
        stains: [
          {
            id: 'stain-1',
            polygons: [
              {
                id: 'polygon-1',
                path: [{ x: 50.123456, y: 50.987654 }],
                opacity: 0.123456789,
                color: '#8B4513',
              },
            ],
            mutations: [],
            createdAt: new Date('2024-01-01T01:00:00Z'),
          },
        ],
        lastUpdated: new Date('2024-01-01T02:00:00Z'),
      };

      const serialized = canvasHistoryManager.serializeCanvasState(canvasState);

      expect(serialized.strokes).toHaveLength(1);
      expect(serialized.strokes[0].width).toBe(2.12); // Rounded to 2 decimal places
      expect(serialized.strokes[0].opacity).toBe(0.988); // Rounded to 3 decimal places
      expect(serialized.strokes[0].points).toEqual([{ x: 100.12, y: 200.99 }]);
      expect(serialized.strokes[0].mutations?.[0].blurFactor).toBe(1.123);

      expect(serialized.stains).toHaveLength(1);
      expect(serialized.stains[0].polygons[0].path).toEqual([
        { x: 50.12, y: 50.99 },
      ]);
      expect(serialized.stains[0].polygons[0].opacity).toBe(0.123);

      expect(serialized.lastUpdated).toBe('2024-01-01T02:00:00.000Z');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle events with missing data fields', async () => {
      const events: StrokeEvent[] = [
        {
          ...mockStrokeEvent,
          eventType: 'begin',
          data: {}, // Missing tool, color, width
        },
        {
          ...mockStrokeEvent,
          id: 'event-2',
          eventType: 'end',
          data: { points: mockPoints },
        },
      ];

      const canvasState =
        await canvasHistoryManager.reconstructCanvasState(events);

      const stroke = canvasState.strokes.get('stroke-1');
      expect(stroke!.tool).toBe('pen'); // Default value
      expect(stroke!.color).toBe('#000000'); // Default value
      expect(stroke!.width).toBe(2); // Default value
    });

    it('should handle stain events with missing polygons', async () => {
      const events: StrokeEvent[] = [
        {
          ...mockStrokeEvent,
          eventType: 'stain',
          data: {}, // Missing stainPolygons
        },
      ];

      const canvasState =
        await canvasHistoryManager.reconstructCanvasState(events);

      expect(canvasState.stains).toHaveLength(0);
    });

    it('should handle empty events array', async () => {
      const canvasState = await canvasHistoryManager.reconstructCanvasState([]);

      expect(canvasState.strokes.size).toBe(0);
      expect(canvasState.stains).toHaveLength(0);
      expect(canvasState.lastUpdated).toBeInstanceOf(Date);
    });

    it('should handle events with null/undefined points', () => {
      const events: StrokeEvent[] = [
        {
          ...mockStrokeEvent,
          eventType: 'end',
          data: {
            tool: 'pen',
            color: '#FF0000',
            width: 2,
            points: undefined as unknown as Point2D[],
          },
        },
      ];

      const compressed = canvasHistoryManager.compressCanvasState(events);

      expect(compressed[0].data.points).toBeUndefined();
    });
  });
});
