// Canvas History Replay Utilities
// Implements efficient chunk-based history queries with pagination,
// stroke event reconstruction, and canvas state serialization

import { Point2D, StrokeEvent } from '../../../shared/src/types/index.js';
import { DatabaseManager } from '../../../shared/src/utils/database.js';

export interface CanvasState {
  strokes: Map<string, ReconstructedStroke>;
  stains: StainEffect[];
  lastUpdated: Date;
}

export interface ReconstructedStroke {
  strokeId: string;
  userId: string;
  tool: string;
  color: string;
  width: number;
  points: Point2D[];
  opacity: number;
  createdAt: Date;
  mutations?: StrokeMutation[];
}

export interface StainEffect {
  id: string;
  polygons: StainPolygon[];
  mutations: StrokeMutation[];
  createdAt: Date;
}

export interface StainPolygon {
  id: string;
  path: Point2D[];
  opacity: number;
  color: string;
}

export interface StrokeMutation {
  strokeId: string;
  colorShift: string;
  blurFactor: number;
  opacityDelta: number;
}

export interface SerializedCanvasState {
  strokes: Array<{
    strokeId: string;
    userId: string;
    tool: string;
    color: string;
    width: number;
    points: Point2D[];
    opacity: number;
    createdAt: string;
    mutations?: Array<{
      strokeId: string;
      colorShift: string;
      blurFactor: number;
      opacityDelta: number;
    }>;
  }>;
  stains: Array<{
    id: string;
    polygons: Array<{
      id: string;
      path: Point2D[];
      opacity: number;
      color: string;
    }>;
    createdAt: string;
  }>;
  lastUpdated: string;
}

export interface PaginatedCanvasHistory {
  events: StrokeEvent[];
  cursor?: string;
  hasMore: boolean;
  totalEvents: number;
}

/**
 * Canvas History Manager - handles efficient canvas state reconstruction
 */
export class CanvasHistoryManager {
  constructor(private db: DatabaseManager) {}

  /**
   * Get canvas history with efficient chunk-based pagination
   */
  async getCanvasHistory(
    roomId: string,
    chunkKeys: string[],
    cursor?: string,
    limit: number = 100
  ): Promise<PaginatedCanvasHistory> {
    // Return early for empty chunk keys
    if (chunkKeys.length === 0) {
      return {
        events: [],
        cursor: undefined,
        hasMore: false,
        totalEvents: 0,
      };
    }

    // Validate inputs
    this.validateChunkKeys(chunkKeys);
    const safeLimit = Math.min(Math.max(limit, 1), 500); // Clamp between 1-500

    try {
      // Get paginated events from database
      const cursorDate = cursor ? new Date(cursor) : undefined;
      const result = await this.db.getStrokeEventsInChunksWithPagination(
        roomId,
        chunkKeys,
        cursorDate,
        safeLimit
      );

      // Generate next cursor
      const nextCursor =
        result.hasMore && result.events.length > 0
          ? result.events[result.events.length - 1].createdAt.toISOString()
          : undefined;

      return {
        events: result.events,
        cursor: nextCursor,
        hasMore: result.hasMore,
        totalEvents: result.events.length,
      };
    } catch (error) {
      console.error('Error fetching canvas history:', error);
      throw new Error('Failed to fetch canvas history');
    }
  }

  /**
   * Reconstruct complete canvas state from stroke events
   */
  async reconstructCanvasState(events: StrokeEvent[]): Promise<CanvasState> {
    const canvasState: CanvasState = {
      strokes: new Map(),
      stains: [],
      lastUpdated: new Date(),
    };

    // Group events by stroke ID for reconstruction
    const strokeEventGroups = this.groupEventsByStroke(events);
    const stainEvents = events.filter(e => e.eventType === 'stain');

    // Reconstruct strokes from event sequences
    for (const [strokeId, strokeEvents] of strokeEventGroups) {
      const reconstructedStroke = this.reconstructStroke(
        strokeId,
        strokeEvents
      );
      if (reconstructedStroke) {
        canvasState.strokes.set(strokeId, reconstructedStroke);
      }
    }

    // Process stain effects
    for (const stainEvent of stainEvents) {
      const stainEffect = this.processStainEvent(stainEvent);
      if (stainEffect) {
        canvasState.stains.push(stainEffect);

        // Apply mutations to existing strokes
        this.applyStainMutations(canvasState.strokes, stainEffect.mutations);
      }
    }

    // Update last modified time
    if (events.length > 0) {
      const latestEvent = events.reduce((latest, event) =>
        event.createdAt > latest.createdAt ? event : latest
      );
      canvasState.lastUpdated = latestEvent.createdAt;
    }

    return canvasState;
  }

  /**
   * Serialize canvas state for efficient network transfer
   */
  serializeCanvasState(canvasState: CanvasState): SerializedCanvasState {
    return {
      strokes: Array.from(canvasState.strokes.values()).map(stroke => ({
        strokeId: stroke.strokeId,
        userId: stroke.userId,
        tool: stroke.tool,
        color: stroke.color,
        width: Math.round(stroke.width * 100) / 100,
        points: this.compressPoints(stroke.points),
        opacity: Math.round(stroke.opacity * 1000) / 1000,
        createdAt: stroke.createdAt.toISOString(),
        mutations: stroke.mutations?.map(m => ({
          strokeId: m.strokeId,
          colorShift: m.colorShift,
          blurFactor: Math.round(m.blurFactor * 1000) / 1000,
          opacityDelta: Math.round(m.opacityDelta * 1000) / 1000,
        })),
      })),
      stains: canvasState.stains.map(stain => ({
        id: stain.id,
        polygons: stain.polygons.map(polygon => ({
          id: polygon.id,
          path: this.compressPoints(polygon.path),
          opacity: Math.round(polygon.opacity * 1000) / 1000,
          color: polygon.color,
        })),
        createdAt: stain.createdAt.toISOString(),
      })),
      lastUpdated: canvasState.lastUpdated.toISOString(),
    };
  }

  /**
   * Compress canvas state by removing redundant data
   */
  compressCanvasState(events: StrokeEvent[]): StrokeEvent[] {
    const compressedEvents: StrokeEvent[] = [];
    const processedStrokes = new Set<string>();

    // Process events in chronological order
    const sortedEvents = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    for (const event of sortedEvents) {
      switch (event.eventType) {
        case 'begin':
          // Always include begin events
          compressedEvents.push({
            ...event,
            data: {
              tool: event.data.tool,
              color: event.data.color,
              width: event.data.width,
            },
          });
          break;

        case 'segment':
          // Compress segment points and skip if stroke already processed
          if (!processedStrokes.has(event.strokeId)) {
            compressedEvents.push({
              ...event,
              data: {
                points: this.compressPoints(event.data.points || []),
              },
            });
          }
          break;

        case 'end':
          // Mark stroke as processed and include compressed end event
          processedStrokes.add(event.strokeId);
          compressedEvents.push({
            ...event,
            data: {
              tool: event.data.tool,
              color: event.data.color,
              width: event.data.width,
              points: this.compressPoints(event.data.points || []),
            },
          });
          break;

        case 'stain':
          // Compress stain data
          compressedEvents.push({
            ...event,
            data: {
              stainPolygons: event.data.stainPolygons?.map(polygon => ({
                ...polygon,
                path: this.compressPoints(polygon.path || []),
                opacity: Math.round(polygon.opacity * 1000) / 1000,
              })),
              strokeMutations: event.data.strokeMutations?.map(mutation => ({
                ...mutation,
                blurFactor: Math.round(mutation.blurFactor * 1000) / 1000,
                opacityDelta: Math.round(mutation.opacityDelta * 1000) / 1000,
              })),
            },
          });
          break;
      }
    }

    return compressedEvents;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private validateChunkKeys(chunkKeys: string[]): void {
    const chunkKeyRegex = /^-?\d+:-?\d+$/;
    for (const chunkKey of chunkKeys) {
      if (!chunkKeyRegex.test(chunkKey)) {
        throw new Error(`Invalid chunk key format: ${chunkKey}`);
      }
    }
  }

  private groupEventsByStroke(
    events: StrokeEvent[]
  ): Map<string, StrokeEvent[]> {
    const groups = new Map<string, StrokeEvent[]>();

    for (const event of events) {
      if (event.eventType !== 'stain') {
        if (!groups.has(event.strokeId)) {
          groups.set(event.strokeId, []);
        }
        groups.get(event.strokeId)!.push(event);
      }
    }

    return groups;
  }

  private reconstructStroke(
    strokeId: string,
    events: StrokeEvent[]
  ): ReconstructedStroke | null {
    // Sort events chronologically
    const sortedEvents = events.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    const beginEvent = sortedEvents.find(e => e.eventType === 'begin');
    const segmentEvents = sortedEvents.filter(e => e.eventType === 'segment');
    const endEvent = sortedEvents.find(e => e.eventType === 'end');

    // Must have at least a begin event
    if (!beginEvent) {
      console.warn(`Incomplete stroke: ${strokeId} - missing begin event`);
      return null;
    }

    // Collect all points from segments
    const allPoints: Point2D[] = [];
    for (const segment of segmentEvents) {
      if (segment.data.points) {
        allPoints.push(...segment.data.points);
      }
    }

    // If end event has points, use those as the complete set
    if (endEvent?.data.points) {
      allPoints.length = 0; // Clear segment points
      allPoints.push(...endEvent.data.points);
    }

    return {
      strokeId,
      userId: beginEvent.userId,
      tool: beginEvent.data.tool || 'pen',
      color: beginEvent.data.color || '#000000',
      width: beginEvent.data.width || 2,
      points: allPoints,
      opacity: 1.0,
      createdAt: beginEvent.createdAt,
    };
  }

  private processStainEvent(event: StrokeEvent): StainEffect | null {
    if (!event.data.stainPolygons) {
      return null;
    }

    return {
      id: event.id,
      polygons: event.data.stainPolygons.map(polygon => ({
        id: polygon.id,
        path: polygon.path || [],
        opacity: polygon.opacity || 0.5,
        color: polygon.color || '#8B4513',
      })),
      mutations: event.data.strokeMutations || [],
      createdAt: event.createdAt,
    };
  }

  private applyStainMutations(
    strokes: Map<string, ReconstructedStroke>,
    mutations: StrokeMutation[]
  ): void {
    for (const mutation of mutations) {
      const stroke = strokes.get(mutation.strokeId);
      if (stroke) {
        if (!stroke.mutations) {
          stroke.mutations = [];
        }
        stroke.mutations.push(mutation);
      }
    }
  }

  private compressPoints(points: Point2D[]): Point2D[] {
    return points.map(point => ({
      x: Math.round(point.x * 100) / 100, // 2 decimal places
      y: Math.round(point.y * 100) / 100,
    }));
  }
}
