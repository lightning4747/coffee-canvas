/**
 * Core geometric types for the drawing canvas.
 */
export interface Point2D {
  /** X-coordinate on the infinite canvas. */
  x: number;
  /** Y-coordinate on the infinite canvas. */
  y: number;
}

/**
 * Representation of a completed or active drawing stroke.
 */
export interface StrokeData {
  /** Unique ID for the stroke, typically a UUID. */
  strokeId: string;
  /** ID of the user who created the stroke. */
  userId: string;
  /** ID of the room where the stroke belongs. */
  roomId: string;
  /** The tool used (e.g., 'pen', 'brush', 'eraser'). */
  tool: string;
  /** Hex or CSS color string of the stroke. */
  color: string;
  /** Thickness of the stroke in pixels. */
  width: number;
  /** Array of points forming the stroke path. */
  points: Point2D[];
  /** Transparency level from 0.0 to 1.0. */
  opacity: number;
  /** Epoch timestamp when the stroke began. */
  timestamp: number;
}

/**
 * Payload sent when a user starts a new stroke.
 */
export interface StrokeBeginPayload {
  /** Target room ID. */
  roomId: string;
  /** Originating user ID. */
  userId: string;
  /** Unique ID for the new stroke. */
  strokeId: string;
  /** Tool used for the stroke. */
  tool: string;
  /** Stroke color. */
  color: string;
  /** Stroke thickness. */
  width: number;
  /** Start timestamp. */
  timestamp: number;
}

/**
 * Payload sent for incremental stroke segments during active drawing.
 */
export interface StrokeSegmentPayload {
  /** Target room ID. */
  roomId: string;
  /** Originating user ID. */
  userId: string;
  /** Existing stroke ID. */
  strokeId: string;
  /** New points to append to the stroke. */
  points: Point2D[];
  /** Segment timestamp. */
  timestamp: number;
}

/**
 * Payload sent when a user finishes a stroke.
 */
export interface StrokeEndPayload {
  /** Target room ID. */
  roomId: string;
  /** Originating user ID. */
  userId: string;
  /** Completed stroke ID. */
  strokeId: string;
  /** End timestamp. */
  timestamp: number;
}

/**
 * Request payload for triggering a coffee pour physics simulation.
 */
export interface CoffeePourPayload {
  /** Target room ID. */
  roomId: string;
  /** User who triggered the pour. */
  userId: string;
  /** Unique ID for this specific pour event. */
  pourId: string;
  /** Canvas coordinates where the pour starts. */
  origin: Point2D;
  /** Impact radius or strength of the pour. */
  intensity: number;
  /** Trigger timestamp. */
  timestamp: number;
}

/**
 * Geometrical representation of a coffee stain polygon.
 */
export interface StainPolygon {
  /** Unique ID for the stain part. */
  id: string;
  /** Closed path points forming the stain's outer boundary. */
  path: Point2D[];
  /** Transparency level (usually lower for coffee). */
  opacity: number;
  /** Color of the stain (typically brown variants). */
  color: string;
}

/**
 * Effect of a coffee pour on an existing stroke.
 */
export interface StrokeMutation {
  /** Target stroke ID. */
  strokeId: string;
  /** New color hex after absorption. */
  colorShift: string;
  /** Level of blurring applied to the stroke. */
  blurFactor: number;
  /** Change in opacity (positive or negative). */
  opacityDelta: number;
}

/**
 * Complete result of a coffee pour simulation from the physics service.
 */
export interface StainResult {
  /** Original pour ID. */
  pourId: string;
  /** Generated stain polygons. */
  stainPolygons: StainPolygon[];
  /** Changes applied to existing strokes in the impact area. */
  strokeMutations: StrokeMutation[];
  /** Server-side computation time in milliseconds. */
  computationMs: number;
}

/**
 * Payload for real-time cursor position broadcasting.
 */
export interface CursorPositionPayload {
  /** Target room ID. */
  roomId: string;
  /** Originating user ID. */
  userId: string;
  /** User's display name for labels. */
  userName: string;
  /** User's assigned color for the cursor. */
  userColor: string;
  /** Current canvas coordinate position. */
  position: Point2D;
  /** Movement timestamp. */
  timestamp: number;
}

/**
 * Metadata for a collaborative drawing room.
 */
export interface Room {
  /** Unique room identifier. */
  id: string;
  /** Short human-readable code for joining. */
  code: string;
  /** Optional descriptive name. */
  name?: string;
  /** Maximum allowed participants. */
  capacity: number;
  /** Creation date. */
  createdAt: Date;
  /** Current number of active users. */
  participantCount: number;
}

/**
 * Metadata for a user participating in a session.
 */
export interface User {
  /** Unique user ID. */
  id: string;
  /** Human-readable name. */
  displayName: string;
  /** User's assigned identification color. */
  color: string;
  /** When the user joined the room. */
  joinedAt: Date;
  /** When the user left the room (if applicable). */
  leftAt?: Date;
}

/**
 * Decoded content of an authentication JWT.
 */
export interface JWTPayload {
  /** Unique user ID for the session. */
  userId: string;
  /** Target room ID permitted by this token. */
  roomId: string;
  /** User's chosen display name. */
  displayName: string;
  /** User's assigned UI color. */
  color: string;
  /** Issued-at timestamp (seconds). */
  iat: number;
  /** Expiration timestamp (seconds). */
  exp: number;
}

/**
 * Success response for a login/join request.
 */
export interface AuthPayload {
  /** Signed JWT for service authentication. */
  token: string;
  /** Authenticated user profile. */
  user: User;
  /** Target room details. */
  room: Room;
}

/**
 * Unified event structure stored in the persistence layer (PostgreSQL).
 */
export interface StrokeEvent {
  /** Internal database ID. */
  id: string;
  /** Room where the event occurred. */
  roomId: string;
  /** Identifier for the stroke or pour grouping. */
  strokeId: string;
  /** User who triggered the event. */
  userId: string;
  /** Type of event (lifecycle or physics). */
  eventType: 'begin' | 'segment' | 'end' | 'stain';
  /** Spatial chunk key (e.g. "10:10") for optimized spatial queries. */
  chunkKey: string;
  /** Event-specific payload data. */
  data: StrokeEventData;
  /** ISO timestamp of record creation. */
  createdAt: Date;
}

/**
 * Flexible data container for various stroke and stain event types.
 */
export interface StrokeEventData {
  /** Tool used (for 'begin' events). */
  tool?: string;
  /** Color (for 'begin' events). */
  color?: string;
  /** Width (for 'begin' events). */
  width?: number;

  /** Path points (for 'segment' events). */
  points?: Point2D[];

  /** Physics-generated polygons (for 'stain' events). */
  stainPolygons?: StainPolygon[];
  /** Physics-generated stroke effects (for 'stain' events). */
  strokeMutations?: StrokeMutation[];
}
