/**
 * Real-time Canvas Service for Coffee & Canvas.
 * This service manages live drawing synchronization, room presence,
 * and coordinates physics simulations via the Physics Service.
 */

import compression from 'compression';
import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { createClient } from 'redis';
import { Server } from 'socket.io';
import { createAdapter } from 'socket.io-redis';
import { v4 as uuidv4 } from 'uuid';
import {
  calculateChunkKey,
  CoffeePourPayload,
  DatabaseManager,
  JWTPayload,
  Point2D,
  StainResult,
  StrokeBeginPayload,
  StrokeEndPayload,
  StrokeEvent,
  StrokeSegmentPayload,
  CursorPositionPayload,
  StrokeBeginSchema,
  StrokeSegmentSchema,
  StrokeEndSchema,
  CoffeePourSchema,
  CursorMoveSchema,
  createLogger,
} from '@coffee-canvas/shared';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { validateJWT } from './auth';
import { physicsClient, PhysicsClient } from './physics-client';
import {
  metricsRegistry,
  activeConnections,
  socketEventDuration,
  broadcastLatency,
  dbWriteDuration,
  errorTotal,
} from './metrics';

const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/coffeecanvas';

const logger = createLogger('canvas-service');

/**
 * Events emitted from the server to clients.
 */
interface ServerToClientEvents {
  /** Notifies others that a user has joined. */
  'user-joined': (payload: {
    userId: string;
    displayName: string;
    color: string;
    timestamp: number;
  }) => void;
  /** Notifies others that a user has left. */
  'user-left': (payload: {
    userId: string;
    displayName: string;
    timestamp: number;
  }) => void;
  /** Relays the start of a stroke. */
  stroke_begin: (payload: StrokeBeginPayload) => void;
  /** Relays stroke segments. */
  stroke_segment: (payload: StrokeSegmentPayload) => void;
  /** Relays the end of a stroke. */
  stroke_end: (payload: StrokeEndPayload) => void;
  /** Relays the result of a physics simulation. */
  stain_result: (payload: StainResult) => void;
  /** Relays cursor positions. */
  cursor_move: (payload: CursorPositionPayload) => void;
  /** Sends generic error messages. */
  error: (payload: { message: string }) => void;
}

/**
 * Events accepted by the server from clients.
 */
interface ClientToServerEvents {
  /** Signal to start a new drawing stroke. */
  stroke_begin: (payload: StrokeBeginPayload) => void;
  /** Signal to add points to an existing stroke. */
  stroke_segment: (payload: StrokeSegmentPayload) => void;
  /** Signal to complete a drawing stroke. */
  stroke_end: (payload: StrokeEndPayload) => void;
  /** Signal to update cursor position. */
  cursor_move: (payload: CursorPositionPayload) => void;
  /** Signal to trigger a physics coffee pour. */
  coffee_pour: (payload: CoffeePourPayload) => void;
}

/**
 * Events passed between multiple socket.io-redis instances.
 */
interface InterServerEvents {
  // For Redis adapter inter-instance communication
}

/**
 * Custom data attached to each Socket instance.
 */
interface SocketData {
  /** Authenticated user profile from JWT. */
  user: JWTPayload;
}

/**
 * Internal context for strokes passed to the physics simulation.
 */
interface PhysicsStrokeContext {
  strokeId: string;
  userId: string;
  roomId: string;
  tool: string;
  color: string;
  width: number;
  points: { x: number; y: number }[];
  opacity: number;
  timestamp: number;
}

/**
 * Initialization options for the Canvas Service.
 */
export interface CanvasServiceOptions {
  /** Optional override for Redis URL. */
  redisUrl?: string;
  /** Optional pre-configured Redis client (useful for mocking). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redisClient?: any;
  /** Optional custom DatabaseManager instance. */
  dbManager?: DatabaseManager;
  /** Optional custom PhysicsClient instance. */
  physicsClient?: PhysicsClient;
  /** Optional custom RateLimiter instance for drawing. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawingRateLimiter?: any;
  /** Optional custom RateLimiter instance for coffee pours. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pourRateLimiter?: any;
}

/**
 * Bootstraps the Canvas Service logic on top of an existing HTTP server.
 * Handles Redis/DB connections, Socket.IO setup, and event routing.
 *
 * @param httpServer - The standard Node.js/Express HTTP server.
 * @param options - Configuration overrides for dependencies.
 * @returns Object containing the io server and cleanup utilities.
 */
export async function initializeCanvasService(
  httpServer: HttpServer,
  options: CanvasServiceOptions | string = {}
) {
  /** Tracking set for background persistence operations to ensure graceful shutdown. */
  const pendingPersistenceTasks = new Set<Promise<void>>();

  // Metrics counters
  let totalStrokesSaved = 0;
  let totalPhysicsSimulations = 0;

  const normalizedOptions =
    typeof options === 'string' ? { redisUrl: options } : options;
  const redisUrl = normalizedOptions.redisUrl || REDIS_URL;

  // 1. Initialize Redis Client
  const redisClient =
    normalizedOptions.redisClient ||
    createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: retries => {
          if (retries > 10) {
            logger.error('Redis reconnection failed after 10 attempts');
            return new Error('Redis reconnection failed');
          }
          const delay = Math.min(retries * 100, 3000);
          logger.warn(
            `Redis reconnecting in ${delay}ms... (attempt ${retries})`
          );
          return delay;
        },
      },
    });

  if (!normalizedOptions.redisClient) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (redisClient as any).on('error', (err: Error) =>
      logger.error('Redis Client Error:', err)
    );
    (redisClient as any).on('connect', () =>
      logger.info('Redis client connecting...')
    );
    (redisClient as any).on('ready', () => logger.info('Redis client ready'));
    (redisClient as any).on('reconnecting', () =>
      logger.warn('Redis client reconnecting...')
    );
  }

  // 2. Initialize Database Manager
  const dbManager =
    normalizedOptions.dbManager ||
    new DatabaseManager(process.env.DATABASE_URL || DATABASE_URL);

  // 3. Initialize Physics Client (default from import if not provided)
  const effectivePhysicsClient =
    normalizedOptions.physicsClient || physicsClient;

  try {
    await redisClient.connect();
    logger.info('Connected to Redis for stroke caching');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    throw err;
  }

  // 4. Initialize Rate Limiters
  const effectiveDrawingRateLimiter =
    normalizedOptions.drawingRateLimiter ||
    new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'ratelimit:drawing',
      points: 120,
      duration: 1,
    });

  const effectivePourRateLimiter =
    normalizedOptions.pourRateLimiter ||
    new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'ratelimit:pour',
      points: 1,
      duration: 3,
    });

  // Initialize Socket.IO with CORS and Redis adapter
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Configure Redis adapter for horizontal scaling (skip if 'mock' for testing)
  if (redisUrl !== 'mock') {
    try {
      // Create dedicated clients for the adapter to ensure we can handle their errors
      const pubClient = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: retries => Math.min(retries * 100, 3000),
        },
      });
      const subClient = pubClient.duplicate();

      const handleAdapterError = (type: string) => (err: Error) => {
        logger.error(`Redis Adapter ${type} Error:`, err);
      };

      pubClient.on('error', handleAdapterError('Pub'));
      subClient.on('error', handleAdapterError('Sub'));

      await Promise.all([pubClient.connect(), subClient.connect()]);

      io.adapter(createAdapter({ pubClient, subClient }));
      logger.info(
        `Canvas Service initialized with Redis adapter at ${redisUrl}`
      );
    } catch (adapterErr) {
      logger.error(
        'Failed to initialize Redis adapter, falling back to in-memory:',
        adapterErr
      );
    }
  } else {
    logger.info(
      'Canvas Service initializing with default adapter (testing mode)'
    );
  }

  // JWT Authentication Middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        console.warn(
          `Connection attempt rejected: No token provided (socket: ${socket.id})`
        );
        return next(new Error('Authentication required'));
      }

      const payload = await validateJWT(token);
      // Attach payload to socket data for use in handlers
      socket.data.user = payload;

      next();
    } catch (error) {
      console.error(
        `Authentication failed for socket ${socket.id}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      next(new Error('Invalid authentication token'));
    }
  });

  // Connection handling
  io.on('connection', async socket => {
    const { user } = socket.data || {};
    if (!user) {
      console.warn(
        `Socket ${socket.id} connected without user data. Disconnecting.`
      );
      socket.disconnect();
      return;
    }
    const { userId, roomId, displayName } = user;

    // IMPORTANT: Join the room IMMEDIATELY so handlers can broadcast accurately.
    await socket.join(roomId);

    activeConnections.inc({ room_id: roomId });
    console.log(
      `User ${displayName} (${userId}) connected and joined room ${roomId} (socket: ${socket.id})`
    );

    // --- Drawing Event Handlers ---

    /**
     * Cache the initial stroke state and metadata.
     */
    socket.on('stroke_begin', async (payload: StrokeBeginPayload) => {
      const endTimer = socketEventDuration.startTimer({
        event_type: 'stroke_begin',
        room_id: roomId,
      });
      try {
        // 1. Rate Limiting
        try {
          await effectiveDrawingRateLimiter.consume(userId);
        } catch (rej) {
          console.warn(`Rate limit exceeded for user ${userId} (stroke_begin)`);
          return socket.emit('error', {
            message: 'Rate limit exceeded for drawing',
          });
        }

        // 2. Validation
        const validation = StrokeBeginSchema.safeParse(payload);
        if (!validation.success) {
          console.warn(
            `Validation failed for stroke_begin:`,
            validation.error.format()
          );
          return socket.emit('error', { message: 'Invalid stroke data' });
        }

        const { strokeId } = payload;

        // 3. Room context verification
        if (payload.roomId !== roomId || payload.userId !== userId) {
          console.error(
            `Security violation: User ${userId} tried to draw in room ${payload.roomId} or as user ${payload.userId}`
          );
          return socket.disconnect(); // Immediate disconnect for identity spoofing
        }

        console.log(`Stroke begin: ${strokeId} by ${userId} in ${roomId}`);

        // Cache stroke metadata in Redis
        const strokeKey = `canvas:stroke:${strokeId}`;
        await redisClient.hSet(strokeKey, {
          userId,
          roomId,
          tool: payload.tool,
          color: payload.color,
          width: payload.width.toString(),
          startTime: payload.timestamp.toString(),
          status: 'active',
        });

        // Add to room's active strokes
        await redisClient.sAdd(
          `canvas:room:${roomId}:active_strokes`,
          strokeId
        );

        // Set expiration for safety (cleanup if stroke_end never arrives)
        await redisClient.expire(strokeKey, 3600); // 1 hour

        // 7. Broadcast to others in the room
        socket.to(roomId).emit('stroke_begin', payload);
        endTimer();
        console.debug(
          `[Sync] Broadcasted stroke_begin ${strokeId} to room ${roomId}`
        );
      } catch (error) {
        console.error(`Error in stroke_begin for user ${userId}:`, error);
      }
    });

    /**
     * Incremental buffer of drawing points in Redis.
     */
    socket.on('stroke_segment', async (payload: StrokeSegmentPayload) => {
      const endTimer = socketEventDuration.startTimer({
        event_type: 'stroke_segment',
        room_id: roomId,
      });
      try {
        // 1. Rate Limiting
        try {
          await effectiveDrawingRateLimiter.consume(userId);
        } catch (rej) {
          return; // Silently drop segments exceeding rate (jitter prevention)
        }

        // 2. Validation
        const validation = StrokeSegmentSchema.safeParse(payload);
        if (!validation.success) return;

        // 3. Room/User verification
        if (payload.roomId !== roomId || payload.userId !== userId) return;

        const strokeId = payload.strokeId;
        const pointsKey = `canvas:stroke:${strokeId}:points`;

        // Store points in Redis list (as JSON strings)
        if (payload.points && payload.points.length > 0) {
          const serializedPoints = payload.points.map((p: Point2D) =>
            JSON.stringify(p)
          );
          await redisClient.rPush(pointsKey, serializedPoints);
          await redisClient.expire(pointsKey, 3600);
        }

        // Broadcast to others
        socket.to(roomId).emit('stroke_segment', payload);
        endTimer();
        // Throttle logging for segments to avoid flooding
        if (Math.random() < 0.1) {
          console.debug(
            `[Sync] Broadcasted stroke_segment for ${strokeId} (${payload.points.length} points)`
          );
        }
      } catch (error) {
        console.error(`Error in stroke_segment for user ${userId}:`, error);
      }
    });

    /**
     * Broadcast cursor movement to other participants.
     */
    socket.on('cursor_move', (payload: CursorPositionPayload) => {
      // 1. Rate Limiting (Cursors are 60fps usually, let's limit to 120/s)
      effectiveDrawingRateLimiter.consume(userId).catch(() => {}); // Fire and forget

      // 2. Validation
      const validation = CursorMoveSchema.safeParse(payload);
      if (!validation.success) return;

      // 3. Room validation
      if (payload.roomId !== roomId) return;

      // Ensure user info matches the socket context
      payload.userId = userId;
      payload.userName = displayName;
      payload.userColor = user.color || '#cccccc';

      // Ephemeral broadcast (no Redis/DB caching needed for cursors)
      socket.to(roomId).emit('cursor_move', payload);
    });

    /**
     * Finalizes stroke and triggers asynchronous persistence to PostgreSQL.
     */
    socket.on('stroke_end', async (payload: StrokeEndPayload) => {
      const endTimer = socketEventDuration.startTimer({
        event_type: 'stroke_end',
        room_id: roomId,
      });
      const startTimestamp = performance.now();
      try {
        // 1. Validation
        const validation = StrokeEndSchema.safeParse(payload);
        if (!validation.success) return;

        // 2. Room/User verification
        if (payload.roomId !== roomId || payload.userId !== userId) return;

        const strokeId = payload.strokeId;
        const strokeKey = `canvas:stroke:${strokeId}`;

        // Check if stroke exists before marking it complete
        // Requirement 1.5: Prevent stray stroke_end events from creating new keys
        const exists = await redisClient.exists(strokeKey);
        if (!exists) return;

        // Mark stroke as complete in Redis
        await redisClient.hSet(strokeKey, 'status', 'completed');

        // Remove from active strokes set
        await redisClient.sRem(
          `canvas:room:${roomId}:active_strokes`,
          strokeId
        );

        // Finalize expire time
        await redisClient.expire(`canvas:stroke:${strokeId}`, 300); // Keep for 5 mins for late joiners
        await redisClient.expire(`canvas:stroke:${strokeId}:points`, 300);

        // --- ASYNCHRONOUS PERSISTENCE (Task 5.6) ---
        // We do this asynchronously to maintain zero-latency for users
        const p = (async () => {
          try {
            const dbTimer = dbWriteDuration.startTimer({
              operation_type: 'stroke_persistence',
            });
            // 1. Fetch metadata and all points
            const [strokeMeta, pointsJson] = await Promise.all([
              redisClient.hGetAll(`canvas:stroke:${strokeId}`),
              redisClient.lRange(`canvas:stroke:${strokeId}:points`, 0, -1),
            ]);

            if (!strokeMeta.roomId || pointsJson.length === 0) return;

            const points = pointsJson.map(
              (p: string) => JSON.parse(p) as { x: number; y: number }
            );
            const firstPoint = points[0];
            const chunkKey = calculateChunkKey(firstPoint);

            // 2. Prepare batch events
            const events: Omit<StrokeEvent, 'id' | 'createdAt'>[] = [];

            // Begin event
            events.push({
              roomId,
              strokeId,
              userId,
              eventType: 'begin',
              chunkKey,
              data: {
                tool: strokeMeta.tool,
                color: strokeMeta.color,
                width: parseFloat(strokeMeta.width),
              },
            });

            // Segment event (contains all points for the history record)
            events.push({
              roomId,
              strokeId,
              userId,
              eventType: 'segment',
              chunkKey,
              data: { points },
            });

            // End event
            events.push({
              roomId,
              strokeId,
              userId,
              eventType: 'end',
              chunkKey,
              data: {},
            });

            // 3. Batch insert to PostgreSQL
            await dbManager.batchInsertStrokeEvents(events);
            dbTimer();
            totalStrokesSaved++;
          } catch (err) {
            console.error(`Failed to persist stroke ${strokeId}:`, err);
            errorTotal.inc({
              error_type: 'db_persistence_error',
              room_id: roomId,
            });
          }
        })();
        pendingPersistenceTasks.add(p);
        p.finally(() => pendingPersistenceTasks.delete(p));

        // Broadcast to others
        socket.to(roomId).emit('stroke_end', payload);
        endTimer();
        broadcastLatency.observe(
          { event_type: 'stroke_end', room_id: roomId },
          (performance.now() - startTimestamp) / 1000
        );
      } catch (error) {
        console.error(`Error in stroke_end for user ${userId}:`, error);
      }
    });

    /**
     * Handles coffee pour events by coordinating with the gRPC Physics Service
     * and persisting the generated stains.
     */
    socket.on('coffee_pour', async (payload: CoffeePourPayload) => {
      const endTimer = socketEventDuration.startTimer({
        event_type: 'coffee_pour',
        room_id: roomId,
      });
      const startTimestamp = performance.now();
      const pourId = payload.pourId;
      try {
        // 1. Rate Limiting (1 per 3 seconds)
        try {
          await effectivePourRateLimiter.consume(userId);
        } catch (rej) {
          console.warn(`Rate limit exceeded for user ${userId} (coffee_pour)`);
          return socket.emit('error', {
            message: 'Coffee pour is on cooldown',
          });
        }

        // 2. Validation
        const validation = CoffeePourSchema.safeParse(payload);
        if (!validation.success) {
          return socket.emit('error', { message: 'Invalid pour data' });
        }

        // 3. Room/User verification
        if (payload.roomId !== roomId || payload.userId !== userId) {
          return socket.disconnect();
        }

        const { origin, intensity } = payload;

        // 1. Fetch nearby/active strokes for simulation context
        const activeStrokeIds = (await redisClient.sMembers(
          `canvas:room:${roomId}:active_strokes`
        )) as string[];

        const strokeDataList: PhysicsStrokeContext[] = [];
        for (const strokeId of activeStrokeIds) {
          const strokeMeta = await redisClient.hGetAll(
            `canvas:stroke:${strokeId}`
          );
          if (!strokeMeta.roomId) {
            await redisClient.sRem(
              `canvas:room:${roomId}:active_strokes`,
              strokeId
            );
            continue;
          }

          // Fetch points
          const pointsJson = await redisClient.lRange(
            `canvas:stroke:${strokeId}:points`,
            0,
            -1
          );
          const points = pointsJson.map(
            (p: string) => JSON.parse(p) as { x: number; y: number }
          );

          strokeDataList.push({
            strokeId,
            userId: strokeMeta.userId,
            roomId: strokeMeta.roomId,
            tool: strokeMeta.tool,
            color: strokeMeta.color,
            width: parseFloat(strokeMeta.width),
            points,
            opacity: 1.0, // Default for now
            timestamp: parseInt(strokeMeta.startTime),
          });
        }

        // 2. Call Physics Service via gRPC
        const result = await effectivePhysicsClient.computeSpread(
          roomId,
          pourId,
          origin,
          intensity,
          strokeDataList
        );
        totalPhysicsSimulations++;

        // 3. Cache stain result in Redis for history replay
        // Requirement 1.5, 6.2: Ensure all participants (including future ones) see the result
        await redisClient.lPush(
          `canvas:room:${roomId}:stains`,
          JSON.stringify({
            ...result,
            timestamp: Date.now(),
            userId,
          })
        );
        // Set a generous TTL or ensure permanent storage in 5.6
        await redisClient.expire(`canvas:room:${roomId}:stains`, 3600); // 1 hour buffer until persistence

        // --- ASYNCHRONOUS PERSISTENCE (Task 5.6) ---
        // NOTE: queued BEFORE broadcast so persistence runs even if broadcast fails
        const chunkKey = calculateChunkKey(origin);
        const p = (async () => {
          try {
            const dbTimer = dbWriteDuration.startTimer({
              operation_type: 'stain_persistence',
            });
            await dbManager.insertStrokeEvent({
              roomId,
              strokeId: pourId, // Use pourId as strokeId for stains
              userId,
              eventType: 'stain',
              chunkKey,
              data: {
                stainPolygons: result.stainPolygons,
                strokeMutations: result.strokeMutations,
              },
            });
            dbTimer();
            console.log(
              `Persisted stain ${pourId} to PostgreSQL (chunk: ${chunkKey})`
            );
          } catch (err) {
            console.error(`Failed to persist stain ${pourId}:`, err);
            errorTotal.inc({
              error_type: 'db_persistence_error',
              room_id: roomId,
            });
          }
        })();
        pendingPersistenceTasks.add(p);
        p.finally(() => pendingPersistenceTasks.delete(p));

        // 4. Broadcast stain result to room participants
        try {
          io.to(roomId).emit('stain_result', result);
        } catch (broadcastErr) {
          console.warn(
            `Failed to broadcast stain_result for ${pourId}:`,
            broadcastErr
          );
        }

        console.log(
          `Physics simulation complete for ${pourId} (${result.computationMs}ms)`
        );
        endTimer();
        broadcastLatency.observe(
          { event_type: 'coffee_pour', room_id: roomId },
          (performance.now() - startTimestamp) / 1000
        );
      } catch (error) {
        logger.error(`Error in coffee_pour for user ${userId}:`, error);

        // Graceful Degradation (Task 11.1): Fallback to a simple circular stain
        const fallbackResult: StainResult = {
          pourId,
          stainPolygons: [
            {
              id: uuidv4(),
              path: Array.from({ length: 12 }).map((_, i) => ({
                x:
                  (payload.origin as Point2D).x +
                  Math.cos((i * Math.PI) / 6) * payload.intensity * 2,
                y:
                  (payload.origin as Point2D).y +
                  Math.sin((i * Math.PI) / 6) * payload.intensity * 2,
              })),
              color: '#4B2C20',
              opacity: 0.6,
            },
          ],
          strokeMutations: [],
          computationMs: 0,
        };

        io.to(roomId).emit('stain_result', fallbackResult);

        socket.emit('error', {
          message: 'Physics service unavailable - using simplified simulation',
        });
      }
    });

    // --- Connection / Presence Handlers ---

    // Track user presence in Redis
    try {
      await redisClient.sAdd(`canvas:room:${roomId}:active_users`, userId);
    } catch (presenceErr) {
      console.warn(`Failed to track presence for user ${userId}:`, presenceErr);
    }

    // Broadcast user-joined event to others in the room
    socket.to(roomId).emit('user-joined', {
      userId,
      displayName,
      color: user.color,
      timestamp: Date.now(),
    });

    // Handle disconnection
    socket.on('disconnect', async reason => {
      try {
        console.log(
          `User ${displayName} disconnected from room ${roomId} (reason: ${reason})`
        );
        activeConnections.dec({ room_id: roomId });

        // Notify others in the room
        socket.to(roomId).emit('user-left', {
          userId,
          displayName,
          timestamp: Date.now(),
        });

        // Remove from room's active users in Redis
        // Requirement 1.3: Ensure user metadata is cleaned up to prevent stale presence
        await redisClient.sRem(`canvas:room:${roomId}:active_users`, userId);
      } catch (error) {
        console.error(
          `Error during disconnect cleanup for user ${userId}:`,
          error
        );
      }
    });

    // Error handling for the socket
    socket.on('error', error => {
      console.error(`Socket error for user ${userId}:`, error);
    });
  });

  /**
   * Utility to await all outstanding persistence promises before shutdown.
   */
  const flushPendingTasks = async (timeoutMs = 10000) => {
    if (pendingPersistenceTasks.size === 0) return;
    console.log(
      `Waiting for ${pendingPersistenceTasks.size} pending persistence tasks to flush...`
    );

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Flush timeout')), timeoutMs)
    );

    try {
      await Promise.race([
        Promise.allSettled(Array.from(pendingPersistenceTasks)),
        timeout,
      ]);
      console.log('All pending persistence tasks flushed.');
    } catch (err: unknown) {
      console.error(
        'Flush failed or timed out:',
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  return {
    io,
    redisClient,
    pubClient:
      redisUrl !== 'mock' ? (io.adapter() as any).pubClient || null : null,
    subClient:
      redisUrl !== 'mock' ? (io.adapter() as any).subClient || null : null,
    dbManager,
    flushPendingTasks,
    getMetrics: () => ({ totalStrokesSaved, totalPhysicsSimulations }),
  };
}

const app = express();
app.use(compression());
const httpServer = createServer(app);

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : String(err));
  }
});

// Initialize and start service
/**
 * Bootstraps the Canvas Service.
 */
async function bootstrap() {
  try {
    const result = await initializeCanvasService(httpServer);
    const {
      io,
      redisClient,
      dbManager,
      flushPendingTasks,
      getMetrics,
      pubClient,
      subClient,
    } = result;

    // Health check endpoint
    app.get('/health', async (req, res) => {
      interface HealthStatus {
        status: string;
        service: string;
        timestamp: string;
        dependencies: Record<string, string>;
        metrics?: Record<string, unknown>;
      }
      const health: HealthStatus = {
        status: 'healthy',
        service: 'canvas-service',
        timestamp: new Date().toISOString(),
        dependencies: {},
      };

      try {
        // 1. Check Redis
        const redisPing = await redisClient.ping();
        health.dependencies.redis = redisPing === 'PONG' ? 'UP' : 'DOWN';

        // 2. Check Database
        const dbHealthy = await dbManager.healthCheck();
        health.dependencies.database = dbHealthy ? 'UP' : 'DOWN';

        // 3. Check Physics Service (Basic connectivity)
        health.dependencies.physics = 'UP'; // Verified during initialization

        // Overall status
        if (
          health.dependencies.redis === 'DOWN' ||
          health.dependencies.database === 'DOWN'
        ) {
          health.status = 'degraded';
          res.status(503);
        } else {
          res.status(200);
        }

        // Add basic metrics info
        const metrics = getMetrics();
        health.metrics = {
          ...metrics,
          uptime: process.uptime(),
        };

        res.json(health);
      } catch (err) {
        res.status(500).json({
          status: 'unhealthy',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    httpServer.listen(PORT, () => {
      logger.info(`Canvas Service running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Canvas Service shutting down...');

      // 1. Stop accepting new connections and close existing ones
      await new Promise<void>(resolve => {
        httpServer.close(() => {
          console.log('HTTP server closed.');
          resolve();
        });
        // Force close after a short delay if many connections are hanging
        setTimeout(() => resolve(), 2000);
      });

      // 2. Shut down Socket.IO (disconnects clients)
      await io.close();

      // 3. Flush pending persistence tasks
      await flushPendingTasks();

      // 4. Disconnect from Redis
      try {
        const disconnects = [redisClient.quit()];
        if (pubClient) disconnects.push(pubClient.quit());
        if (subClient) disconnects.push(subClient.quit());

        await Promise.allSettled(disconnects);
        console.log('Disconnected all Redis clients.');
      } catch (err) {
        console.error('Error during Redis disconnect:', err);
      }

      console.log('Shutdown complete.');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    logger.error(
      'Canvas Service failed to initialize:',
      err instanceof Error ? err.stack || err.message : String(err)
    );
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}
