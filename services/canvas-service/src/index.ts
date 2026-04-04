import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from 'socket.io-redis';
import { createClient } from 'redis';
import {
  JWTPayload,
  StrokeBeginPayload,
  StrokeSegmentPayload,
  StrokeEndPayload,
  CoffeePourPayload,
  StainResult,
} from '@coffee-canvas/shared';
import { validateJWT } from './auth';
import { physicsClient } from './physics-client';

const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface ServerToClientEvents {
  'user-joined': (payload: {
    userId: string;
    displayName: string;
    color: string;
    timestamp: number;
  }) => void;
  'user-left': (payload: {
    userId: string;
    displayName: string;
    timestamp: number;
  }) => void;
  stroke_begin: (payload: StrokeBeginPayload) => void;
  stroke_segment: (payload: StrokeSegmentPayload) => void;
  stroke_end: (payload: StrokeEndPayload) => void;
  stain_result: (payload: StainResult) => void;
  error: (payload: { message: string }) => void;
}

interface ClientToServerEvents {
  stroke_begin: (payload: StrokeBeginPayload) => void;
  stroke_segment: (payload: StrokeSegmentPayload) => void;
  stroke_end: (payload: StrokeEndPayload) => void;
  coffee_pour: (payload: CoffeePourPayload) => void;
}

interface InterServerEvents {
  // For Redis adapter inter-instance communication
}

interface SocketData {
  user: JWTPayload;
}

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

export async function initializeCanvasService(
  httpServer: HttpServer,
  redisUrl: string = REDIS_URL
) {
  // Redis client for caching active strokes
  const redisClient = createClient({ url: redisUrl });

  redisClient.on('error', err => console.error('Redis Client Error', err));

  try {
    await redisClient.connect();
    console.log('Connected to Redis for stroke caching');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
  }

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
    io.adapter(createAdapter(redisUrl));
    console.log('Canvas Service initializing with Redis adapter...');
  } else {
    console.log(
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
  io.on('connection', socket => {
    const { user } = socket.data;
    if (!user) return; // Should not happen due to middleware
    const { userId, roomId, displayName } = user;

    console.log(
      `User ${displayName} (${userId}) connected to room ${roomId} (socket: ${socket.id})`
    );

    // --- Drawing Event Handlers ---

    // Handle stroke_begin
    socket.on('stroke_begin', async (payload: StrokeBeginPayload) => {
      try {
        const { strokeId } = payload;

        // Basic validation: must be in the same room as the JWT
        if (payload.roomId !== roomId) {
          return console.warn(
            `Invalid room ID in stroke_begin: ${payload.roomId} (expected ${roomId})`
          );
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

        // Broadcast to others in the room
        socket.to(roomId).emit('stroke_begin', payload);
      } catch (error) {
        console.error(`Error in stroke_begin for user ${userId}:`, error);
      }
    });

    // Handle stroke_segment
    socket.on('stroke_segment', async (payload: StrokeSegmentPayload) => {
      try {
        if (payload.roomId !== roomId) return;

        const strokeId = payload.strokeId;
        const pointsKey = `canvas:stroke:${strokeId}:points`;

        // Store points in Redis list (as JSON strings)
        if (payload.points && payload.points.length > 0) {
          const serializedPoints = payload.points.map(p => JSON.stringify(p));
          await redisClient.rPush(pointsKey, serializedPoints);
          await redisClient.expire(pointsKey, 3600);
        }

        // Broadcast to others
        socket.to(roomId).emit('stroke_segment', payload);
      } catch (error) {
        console.error(`Error in stroke_segment for user ${userId}:`, error);
      }
    });

    // Handle stroke_end
    socket.on('stroke_end', async (payload: StrokeEndPayload) => {
      try {
        if (payload.roomId !== roomId) return;

        const strokeId = payload.strokeId;
        console.log(`Stroke end: ${strokeId} by ${userId}`);

        // Mark stroke as complete in Redis
        await redisClient.hSet(
          `canvas:stroke:${strokeId}`,
          'status',
          'completed'
        );

        // Remove from active strokes set
        await redisClient.sRem(
          `canvas:room:${roomId}:active_strokes`,
          strokeId
        );

        // Finalize expire time
        await redisClient.expire(`canvas:stroke:${strokeId}`, 300); // Keep for 5 mins for late joiners
        await redisClient.expire(`canvas:stroke:${strokeId}:points`, 300);

        // Broadcast to others
        socket.to(roomId).emit('stroke_end', payload);
      } catch (error) {
        console.error(`Error in stroke_end for user ${userId}:`, error);
      }
    });

    // Handle coffee_pour
    socket.on('coffee_pour', async (payload: CoffeePourPayload) => {
      try {
        if (payload.roomId !== roomId) return;

        const { pourId, origin, intensity } = payload;
        console.log(
          `Coffee pour triggered: ${pourId} by ${userId} in ${roomId}`
        );

        // 1. Fetch nearby/active strokes for simulation context
        const activeStrokeIds = await redisClient.sMembers(
          `canvas:room:${roomId}:active_strokes`
        );

        const strokeDataList: PhysicsStrokeContext[] = [];
        for (const strokeId of activeStrokeIds) {
          const strokeMeta = await redisClient.hGetAll(
            `canvas:stroke:${strokeId}`
          );
          if (!strokeMeta.roomId) continue;

          // Fetch points
          const pointsJson = await redisClient.lRange(
            `canvas:stroke:${strokeId}:points`,
            0,
            -1
          );
          const points = pointsJson.map(p => JSON.parse(p));

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
        const result = await physicsClient.computeSpread(
          roomId,
          pourId,
          origin,
          intensity,
          strokeDataList
        );

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

        // 4. Broadcast stain result to room participants
        io.to(roomId).emit('stain_result', result);

        console.log(
          `Physics simulation complete for ${pourId} (${result.computationMs}ms)`
        );
      } catch (error) {
        console.error(`Error in coffee_pour for user ${userId}:`, error);
        socket.emit('error', {
          message: 'Failed to compute coffee pour simulation',
        });
      }
    });

    // --- Connection / Presence Handlers ---

    // Join the user to their specific room
    socket.join(roomId);

    // Broadcast user-joined event to others in the room
    socket.to(roomId).emit('user-joined', {
      userId,
      displayName,
      color: user.color,
      timestamp: Date.now(),
    });

    // Handle disconnection
    socket.on('disconnect', reason => {
      console.log(
        `User ${displayName} disconnected from room ${roomId} (reason: ${reason})`
      );

      // Notify others in the room
      socket.to(roomId).emit('user-left', {
        userId,
        displayName,
        timestamp: Date.now(),
      });
    });

    // Error handling for the socket
    socket.on('error', error => {
      console.error(`Socket error for user ${userId}:`, error);
    });
  });

  return { io, redisClient };
}

const app = express();
const httpServer = createServer(app);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'canvas-service',
    timestamp: new Date().toISOString(),
  });
});

// Initialize and start service
if (require.main === module) {
  initializeCanvasService(httpServer).then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Canvas Service running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('Canvas Service shutting down...');
      httpServer.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  });
}
