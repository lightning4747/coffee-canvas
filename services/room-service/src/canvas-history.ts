/**
 * Canvas History Replay and Reconstruction Utilities.
 * Provides logic for fetching stroke events from the database and
 * reconstructing the visual state of the canvas for specific spatial chunks.
 */

import { Point2D, StrokeEvent } from '../../../shared/src';
import { DatabaseManager } from '../../../shared/src';
import { dbReadDuration } from './metrics';

/**
 * Represents the complete reconstructed state of a canvas section.
 */
export interface CanvasState {
  /** Map of stroke IDs to their reconstructed data. */
  strokes: Map<string, ReconstructedStroke>;
  /** List of physics-based stain effects. */
  stains: StainEffect[];
  /** Latest timestamp of any event included in this state. */
  lastUpdated: Date;
}

/**
 * A stroke that has been reconstructed from a sequence of begin/segment/end events.
 */
export interface ReconstructedStroke {
  /** Unique stroke identifier. */
  strokeId: string;
  /** User who created the stroke. */
  userId: string;
  /** Tool used (pen, brush, etc.). */
  tool: string;
  /** Final color of the stroke. */
  color: string;
  /** Thickness of the stroke. */
  width: number;
  /** Full set of points forming the path. */
  points: Point2D[];
  /** Initial opacity. */
  opacity: number;
  /** When the stroke first began. */
  createdAt: Date;
  /** Any modifications caused by subsequent coffee pours. */
  mutations?: StrokeMutation[];
}

/**
 * A coffee stain effect on the canvas.
 */
export interface StainEffect {
  /** Unique stain identifier. */
  id: string;
  /** Polygons defining the stain's shape. */
  polygons: StainPolygon[];
  /** Strokes affected by this specific stain. */
  mutations: StrokeMutation[];
  /** When the pour occurred. */
  createdAt: Date;
}

/**
 * Geometrical representation of a stain part.
 */
export interface StainPolygon {
  /** Sub-part identifier. */
  id: string;
  /** Path points for the polygon. */
  path: Point2D[];
  /** Transparency level. */
  opacity: number;
  /** Stain color. */
  color: string;
}

/**
 * Modification applied to a stroke by an external effect (e.g. coffee).
 */
export interface StrokeMutation {
  /** Target stroke ID. */
  strokeId: string;
  /** Resultant color after shift. */
  colorShift: string;
  /** Visual blur amount. */
  blurFactor: number;
  /** Change in transparency. */
  opacityDelta: number;
}

/**
 * Wire-compatible representation of the canvas state for API responses.
 */
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
    mutations: Array<{
      strokeId: string;
      colorShift: string;
      blurFactor: number;
      opacityDelta: number;
    }>;
    createdAt: string;
  }>;
  lastUpdated: string;
}

/**
 * Result of a chunked history query.
 */
export interface PaginatedCanvasHistory {
  /** The raw stroke events retrieved. */
  events: StrokeEvent[];
  /** ISO timestamp for the next page of results. */
  cursor?: string;
  /** Whether more events exist beyond the current page. */
  hasMore: boolean;
  /** Total count of events in this page. */
  totalEvents: number;
}

/**
 * Manager for reconstructing canvas state from event logs.
 * Optimizes history loading through spatial chunking and point compression.
 */
export class CanvasHistoryManager {
  /**
   * Initializes the manager with a database instance.
   */
  constructor(private db: DatabaseManager) {}

  /**
   * Fetches paginated stroke events for a set of spatial chunks.
   *
   * @param roomId - Target room.
   * @param chunkKeys - Spatial identifiers (e.g. "0:0", "1:-1").
   * @param cursor - Pagination cursor from previous request.
   * @param limit - Maximum number of events to return.
   * @returns Paginated event list.
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
      const dbTimer = dbReadDuration.startTimer({
        query_type: 'get_canvas_history',
      });
      const result = await this.db.getStrokeEventsInChunksWithPagination(
        roomId,
        chunkKeys,
        cursorDate,
        safeLimit
      );
      dbTimer();

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
   * Assembles the chronological sequence of events into a coherent canvas state.
   * Processes lifecycle events (begin/segment/end) and physics events (stains).
   *
   * @param events - Raw event sequence from the database.
   * @returns The fully reconstructed visual state.
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
   * Converts internal CanvasState to a format optimized for network transfer.
   * Includes point rounding and date serialization.
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
        mutations: stain.mutations.map(m => ({
          strokeId: m.strokeId,
          colorShift: m.colorShift,
          blurFactor: Math.round(m.blurFactor * 1000) / 1000,
          opacityDelta: Math.round(m.opacityDelta * 1000) / 1000,
        })),
      })),
      lastUpdated: canvasState.lastUpdated.toISOString(),
    };
  }

  /**
   * Refines a set of events by removing intermediate segment redundancy.
   * Useful for periodic database maintenance or high-density history requests.
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
              ...(event.data.points && {
                points: this.compressPoints(event.data.points),
              }),
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

  /** Validates chunk key format against "X:Y" pattern. */
  private validateChunkKeys(chunkKeys: string[]): void {
    const chunkKeyRegex = /^-?\d+:-?\d+$/;
    for (const chunkKey of chunkKeys) {
      if (!chunkKeyRegex.test(chunkKey)) {
        throw new Error(`Invalid chunk key format: ${chunkKey}`);
      }
    }
  }

  /** Maps raw event stream to per-stroke ID groups. */
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

  /**
   * Logic for building a ReconstructedStroke from multiple lifecycle events.
   */
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
      return null;
    }

    // Collect all points from segments
    const allPoints: Point2D[] = [];
    for (const segment of segmentEvents) {
      if (segment.data && segment.data.points) {
        allPoints.push(...segment.data.points);
      }
    }

    // If end event has points, use those as the complete set
    if (endEvent && endEvent.data && endEvent.data.points) {
      allPoints.length = 0; // Clear segment points
      allPoints.push(...endEvent.data.points);
    }

    return {
      strokeId,
      userId: beginEvent.userId,
      tool: beginEvent.data?.tool || 'pen',
      color: beginEvent.data?.color || '#000000',
      width:
        beginEvent.data &&
        typeof beginEvent.data.width === 'number' &&
        isFinite(beginEvent.data.width)
          ? beginEvent.data.width
          : 2,
      points: allPoints,
      opacity: 1.0,
      createdAt: beginEvent.createdAt,
    };
  }

  /** Parses a 'stain' event into a structured effect. */
  private processStainEvent(event: StrokeEvent): StainEffect | null {
    if (!event.data || !event.data.stainPolygons) {
      return null;
    }

    return {
      id: event.id,
      polygons: event.data.stainPolygons.map(polygon => ({
        id: polygon.id,
        path: polygon.path || [],
        opacity:
          typeof polygon.opacity === 'number' && isFinite(polygon.opacity)
            ? polygon.opacity
            : 0.5,
        color: polygon.color || '#8B4513',
      })),
      mutations: event.data.strokeMutations || [],
      createdAt: event.createdAt,
    };
  }

  /** Updates current stroke state with mutations from a stain event. */
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

  /** Rounds coordinates to 2 decimal places to minimize payload size. */
  private compressPoints(points: Point2D[]): Point2D[] {
    return points.map(point => ({
      x: Math.round(point.x * 100) / 100, // 2 decimal places
      y: Math.round(point.y * 100) / 100,
    }));
  }
}
