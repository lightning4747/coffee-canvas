import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from 'socket.io-redis';
import { JWTPayload } from '@coffee-canvas/shared';
import { validateJWT } from './auth';

const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const app = express();
const httpServer = createServer(app);

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
}

interface ClientToServerEvents {
  // To be implemented in later tasks
}

interface InterServerEvents {
  // For Redis adapter inter-instance communication
}

interface SocketData {
  user: JWTPayload;
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

// Configure Redis adapter for horizontal scaling
io.adapter(createAdapter(REDIS_URL));

console.log('Canvas Service initializing with Redis adapter...');

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'canvas-service',
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount,
  });
});

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
