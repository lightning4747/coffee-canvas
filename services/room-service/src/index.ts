import { ApolloServer } from 'apollo-server-express';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { DatabaseManager } from '../../../shared/src/utils/database.js';
import { CanvasHistoryManager } from './canvas-history.js';
import { resolvers } from './resolvers.js';
import { typeDefs } from './schema.js';

const app = express();
const PORT = process.env.PORT || 3002;
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/coffeecanvas';

// Rate limiting configuration
const rateLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable for GraphQL Playground in development
  })
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);

// Rate limiting middleware
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip || 'unknown');
    next();
  } catch (rejRes) {
    res.status(429).json({ error: 'Too many requests' });
  }
});

async function startServer() {
  try {
    console.log('Room Service starting...');

    // Initialize database connection
    const db = new DatabaseManager(DATABASE_URL);

    // Test database connection
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database connection failed');
    }
    console.log('Database connection established');

    // Initialize canvas history manager
    const canvasHistoryManager = new CanvasHistoryManager(db);
    console.log('Canvas history manager initialized');

    // Create Apollo Server
    const server = new ApolloServer({
      typeDefs,
      resolvers,
      context: ({ req }) => ({
        db,
        canvasHistoryManager,
        req,
      }),
      introspection: process.env.NODE_ENV !== 'production',
      debug: process.env.NODE_ENV !== 'production',
    });

    await server.start();
    server.applyMiddleware({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app: app as any, // Type assertion needed for Express/Apollo Server compatibility
      path: '/graphql',
      cors: false, // We handle CORS above
    });

    // Health check endpoint
    app.get('/health', async (req, res) => {
      try {
        const isHealthy = await db.healthCheck();
        const stats = await db.getStats();
        const statusCode = isHealthy ? 200 : 503;

        res.status(statusCode).json({
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          service: 'room-service',
          version: process.env.npm_package_version || '1.0.0',
          stats,
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          service: 'room-service',
        });
      }
    });

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`Room Service running on port ${PORT}`);
      console.log(
        `GraphQL endpoint: http://localhost:${PORT}${server.graphqlPath}`
      );
      console.log(`Health check: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('Room Service shutting down...');
      await server.stop();
      await db.close();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Failed to start Room Service:', error);
    process.exit(1);
  }
}

startServer();
