// Core geometric types
export interface Point2D {
  x: number;
  y: number;
}

// Drawing stroke data structures
export interface StrokeData {
  strokeId: string;
  userId: string;
  roomId: string;
  tool: string;
  color: string;
  width: number;
  points: Point2D[];
  opacity: number;
  timestamp: number;
}

// Socket.IO event payloads
export interface StrokeBeginPayload {
  roomId: string;
  userId: string;
  strokeId: string;
  tool: string;
  color: string;
  width: number;
  timestamp: number;
}

export interface StrokeSegmentPayload {
  roomId: string;
  userId: string;
  strokeId: string;
  points: Point2D[];
  timestamp: number;
}

export interface StrokeEndPayload {
  roomId: string;
  userId: string;
  strokeId: string;
  timestamp: number;
}

// Coffee pour physics types
export interface CoffeePourPayload {
  roomId: string;
  userId: string;
  pourId: string;
  origin: Point2D;
  intensity: number;
  timestamp: number;
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

export interface StainResult {
  pourId: string;
  stainPolygons: StainPolygon[];
  strokeMutations: StrokeMutation[];
  computationMs: number;
}

// Room and user management
export interface Room {
  id: string;
  code: string;
  name?: string;
  capacity: number;
  createdAt: Date;
  participantCount: number;
}

export interface User {
  id: string;
  displayName: string;
  color: string;
  joinedAt: Date;
  leftAt?: Date;
}

// Authentication
export interface JWTPayload {
  userId: string;
  roomId: string;
  displayName: string;
  color: string;
  iat: number;
  exp: number;
}

export interface AuthPayload {
  token: string;
  user: User;
  room: Room;
}

// Database event types
export interface StrokeEvent {
  id: string;
  roomId: string;
  strokeId: string;
  userId: string;
  eventType: 'begin' | 'segment' | 'end' | 'stain';
  chunkKey: string;
  data: StrokeEventData;
  createdAt: Date;
}

export interface StrokeEventData {
  // For begin events
  tool?: string;
  color?: string;
  width?: number;
  
  // For segment events
  points?: Point2D[];
  
  // For stain events
  stainPolygons?: StainPolygon[];
  strokeMutations?: StrokeMutation[];
}