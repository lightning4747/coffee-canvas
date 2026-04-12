import { ApolloServer } from 'apollo-server-express';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import { createLogger, DatabaseManager } from '@coffee-canvas/shared';
import { CanvasHistoryManager } from './canvas-history';
import { resolvers } from './resolvers';
import { typeDefs } from './schema';
import { metricsRegistry, graphqlQueryDuration, errorTotal } from './metrics';

const app = express();
app.use(compression());
const PORT = process.env.PORT || 3002;
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/coffeecanvas';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const logger = createLogger('room-service');

// Rate limiting configuration
const rateLimiter = new RateLimiterMemory({
  points: 5, // Lowered for diagnostic testing
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
    origin: (origin, callback) => {
      const allowedOrigins = [
        process.env.CORS_ORIGIN || 'http://localhost:3000',
        'http://localhost:3001', // Canvas service health checks/inter-service if needed
      ];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.warn(`Blocked request from unauthorized origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
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
    logger.info('Room Service starting...');

    // Initialize database connection
    const db = new DatabaseManager(DATABASE_URL);

    // Test database connection
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connection established');

    // Initialize Redis for caching
    const redisClient = createClient({ url: REDIS_URL });
    await redisClient.connect();
    logger.info('Redis connected for history caching');

    // Initialize canvas history manager
    const canvasHistoryManager = new CanvasHistoryManager(
      db,
      redisClient as any
    );
    logger.info('Canvas history manager initialized with caching');

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
      plugins: [
        {
          async requestDidStart(requestContext) {
            const start = performance.now();
            const opName = requestContext.request.operationName || 'unnamed';
            return {
              async willSendResponse(responseContext) {
                const duration = (performance.now() - start) / 1000;
                const status = responseContext.errors ? 'error' : 'success';
                graphqlQueryDuration.observe(
                  { operation_name: opName, status },
                  duration
                );
                if (responseContext.errors) {
                  errorTotal.inc({ error_type: 'graphql_error' });
                }
              },
            };
          },
        },
      ],
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

    // Prometheus metrics endpoint
    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', metricsRegistry.contentType);
        res.end(await metricsRegistry.metrics());
      } catch (err) {
        res.status(500).send(err instanceof Error ? err.message : String(err));
      }
    });

    // Start HTTP server
    const httpServer = app.listen(PORT, () => {
      logger.info(`Room Service running on port ${PORT}`);
      logger.info(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Room Service shutting down...');
      httpServer.close();
      await server.stop();
      await db.close();
      await redisClient.quit();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error(
      'Room Service failed to initialize:',
      error instanceof Error ? error.stack || error.message : String(error)
    );
    process.exit(1);
  }
}

startServer();
