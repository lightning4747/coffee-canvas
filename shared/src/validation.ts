import { z } from 'zod';

/**
 * Geometric point validation.
 * Bounds: ±1,000,000 to prevent numeric overflows in physics/rendering.
 */
export const PointSchema = z.object({
  x: z.number().min(-1000000).max(1000000),
  y: z.number().min(-1000000).max(1000000),
});

/**
 * Validation for starting a new stroke.
 */
export const StrokeBeginSchema = z.object({
  roomId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  strokeId: z.string().trim().min(1),
  tool: z.enum(['pen', 'brush', 'eraser', 'marker', 'calligraphy']),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color'),
  width: z.number().min(0.5).max(500),
  timestamp: z.number().int().positive(),
});

/**
 * Validation for adding segments to an active stroke.
 */
export const StrokeSegmentSchema = z.object({
  roomId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  strokeId: z.string().trim().min(1),
  points: z.array(PointSchema).min(1).max(50), // Batch size limit
  timestamp: z.number().int().positive(),
});

/**
 * Validation for finishing a stroke.
 */
export const StrokeEndSchema = z.object({
  roomId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  strokeId: z.string().trim().min(1),
  timestamp: z.number().int().positive(),
});

/**
 * Validation for triggering a coffee pour simulation.
 */
export const CoffeePourSchema = z.object({
  roomId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  pourId: z.string().trim().min(1),
  origin: PointSchema,
  intensity: z.number().min(0.1).max(10.0),
  timestamp: z.number().int().positive(),
});

/**
 * Validation for cursor movement.
 */
export const CursorMoveSchema = z.object({
  roomId: z.string().trim().min(1),
  userId: z.string().trim().min(1), // May be short-form ID or UUID depending on session
  userName: z.string().min(1).max(50),
  userColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  position: PointSchema,
  timestamp: z.number().int().positive(),
});

/**
 * Room creation input validation.
 */
export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  capacity: z.number().int().min(1).max(50).default(10),
});

/**
 * joining room input validation.
 */
export const JoinRoomSchema = z.object({
  code: z
    .string()
    .min(4)
    .max(12)
    .transform(s => s.toUpperCase()),
  displayName: z.string().min(1).max(50).trim(),
});
