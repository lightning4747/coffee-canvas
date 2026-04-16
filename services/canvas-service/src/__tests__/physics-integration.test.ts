import { EventEmitter } from 'events';
import { initializeCanvasService } from '../index';

jest.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: jest.fn().mockImplementation(() => ({
    consume: jest.fn().mockResolvedValue({}),
  })),
}));

// --- Mocks ---

// Mock Redis
const mockRedisClient = {
  ping: jest.fn().mockResolvedValue('PONG'),
  on: jest.fn(),
  hset: jest.fn().mockResolvedValue(1),
  hgetall: jest.fn().mockResolvedValue({
    userId: '550e8400-e29b-41d4-a716-446655440001',
    roomId: '550e8400-e29b-41d4-a716-446655440000',
    tool: 'pen',
    color: '#000',
    width: '2',
    startTime: Date.now().toString(),
    status: 'active',
  }),
  sadd: jest.fn().mockResolvedValue(1),
  smembers: jest
    .fn()
    .mockResolvedValue(['550e8400-e29b-41d4-a716-446655440012']),
  srem: jest.fn().mockResolvedValue(1),
  rpush: jest.fn().mockResolvedValue(1),
  lpush: jest.fn().mockResolvedValue(1),
  lrange: jest.fn().mockResolvedValue([JSON.stringify({ x: 10, y: 10 })]),
  expire: jest.fn().mockResolvedValue(true),
};

jest.mock('ioredis', () => ({
  Redis: jest.fn(() => mockRedisClient),
}));

interface MockSocket extends EventEmitter {
  id: string;
  handshake: {
    auth: { token: string };
    headers: Record<string, string | string[] | undefined>;
  };
  data: { user: { userId: string; roomId: string; displayName: string } };
  join: jest.Mock;
  to: jest.Mock;
}

// Mock Physics Client - Handled locally in beforeEach and initializeCanvasService

jest.mock('@coffee-canvas/shared', () => {
  const original = jest.requireActual('@coffee-canvas/shared');
  return {
    ...original,
    DatabaseManager: jest.fn().mockImplementation(() => ({
      healthCheck: jest.fn().mockResolvedValue(true),
      insertStrokeEvent: jest.fn().mockResolvedValue({}),
      batchInsertStrokeEvents: jest.fn().mockResolvedValue({}),
    })),
  };
});

// Mock Socket.IO globally to avoid adapter issues
jest.mock('socket.io', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const EventEmitter = require('events');
  return {
    Server: jest.fn().mockImplementation(() => {
      const ee = new EventEmitter();
      const ioMock = ee as EventEmitter & {
        use: jest.Mock;
        to: jest.Mock;
        close: jest.Mock;
        adapter: jest.Mock;
      };
      ioMock.use = jest.fn();
      ioMock.to = jest.fn().mockReturnValue({ emit: jest.fn() });
      ioMock.close = jest.fn().mockImplementation(cb => {
        if (cb) cb();
        return Promise.resolve();
      });
      ioMock.adapter = jest.fn();
      return ioMock;
    }),
  };
});

// Mock JWT Validation
jest.mock('../auth', () => ({
  validateJWT: jest.fn().mockResolvedValue({
    userId: '550e8400-e29b-41d4-a716-446655440001',
    roomId: '550e8400-e29b-41d4-a716-446655440000',
    displayName: 'Test User',
    color: '#F00',
  }),
}));

describe('Physics Integration Verification', () => {
  let io: EventEmitter & { to: jest.Mock; close?: (cb?: () => void) => void };
  let flushPendingTasks: (timeoutMs?: number) => Promise<void>;
  let mockPhysicsClient: { computeSpread: jest.Mock };

  beforeEach(async () => {
    const mockHttpServer = new EventEmitter();

    // Explicitly define mock behavior for each test run to ensure reference integrity
    mockPhysicsClient = {
      computeSpread: jest.fn().mockResolvedValue({
        pourId: '550e8400-e29b-41d4-a716-446655440003',
        stainPolygons: [
          {
            id: 'stain-1',
            path: [{ x: 5, y: 5 }],
            opacity: 0.8,
            color: '#442200',
          },
        ],
        strokeMutations: [],
        computationMs: 15,
      }),
    };

    const result = await initializeCanvasService(
      mockHttpServer as unknown as Parameters<
        typeof initializeCanvasService
      >[0],
      {
        redisUrl: 'mock',
        redisClient: mockRedisClient,
        physicsClient: mockPhysicsClient as any,
        drawingRateLimiter: { consume: jest.fn().mockResolvedValue({}) },
        pourRateLimiter: { consume: jest.fn().mockResolvedValue({}) },
      }
    );
    io = result.io as unknown as EventEmitter & {
      to: jest.Mock;
      close: (cb?: () => void) => void;
    };
    flushPendingTasks = result.flushPendingTasks;
    // Note: io.to and io.close are already mocked by the global jest.mock
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (io && io.close) {
      await new Promise<void>(resolve => io.close!(() => resolve()));
    }
  });

  it('Should handle coffee_pour, call physics service, and broadcast stain_result', async () => {
    const roomId = '550e8400-e29b-41d4-a716-446655440000';
    const userId = '550e8400-e29b-41d4-a716-446655440001';

    // Mock socket setup
    const socket = new EventEmitter() as MockSocket;
    socket.id = 'socket-1';
    socket.handshake = { auth: { token: 'valid-token' }, headers: {} };
    socket.data = { user: { userId, roomId, displayName: 'Test User' } };
    socket.join = jest.fn();

    const broadcastEmit = jest.fn();
    socket.to = jest.fn().mockReturnValue({ emit: broadcastEmit });

    // Register handlers
    const connectionListeners = io.listeners('connection') as Array<
      (s: EventEmitter) => void
    >;
    connectionListeners.forEach(l => l(socket));
    // wait for connection handler to register listeners (Task 8.2 synchronization)
    await new Promise(resolve => setTimeout(resolve, 50));

    // Payload for coffee_pour
    const pourPayload = {
      roomId,
      userId,
      pourId: '550e8400-e29b-41d4-a716-446655440003',
      origin: { x: 100, y: 100 },
      intensity: 5,
      timestamp: Date.now(),
    };

    // Trigger coffee_pour
    socket.emit('coffee_pour', pourPayload);

    // Wait for the simulation to complete and broadcast (Task 8.2 deterministic sync)
    // We poll the mock calls since we're using a mocked Socket.IO
    await new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (mockPhysicsClient.computeSpread.mock.calls.length > 0) {
          resolve(true);
        } else if (Date.now() - start > 2000) {
          reject(new Error('Timeout waiting for computeSpread call'));
        } else {
          setTimeout(check, 20);
        }
      };
      check();
    });

    // Also wait for background persistence tasks
    await flushPendingTasks();

    // Assertions
    // 1. Should have fetched active strokes from Redis
    expect(mockRedisClient.smembers).toHaveBeenCalledWith(
      `canvas:room:${roomId}:active_strokes`
    );

    // 2. Should have called physics client with correct data
    expect(mockPhysicsClient.computeSpread).toHaveBeenCalledWith(
      roomId,
      '550e8400-e29b-41d4-a716-446655440003',
      pourPayload.origin,
      pourPayload.intensity,
      expect.arrayContaining([
        expect.objectContaining({
          strokeId: '550e8400-e29b-41d4-a716-446655440012',
          points: [{ x: 10, y: 10 }],
        }),
      ])
    );

    // 3. Should have cached the result in Redis
    expect(mockRedisClient.lpush).toHaveBeenCalledWith(
      `canvas:room:${roomId}:stains`,
      expect.stringContaining('"pourId":"550e8400-e29b-41d4-a716-446655440003"')
    );
    expect(mockRedisClient.expire).toHaveBeenCalledWith(
      `canvas:room:${roomId}:stains`,
      3600
    );

    // 4. Should have broadcast stain_result to the room
    expect(io.to).toHaveBeenCalledWith(roomId);
    const toMock = io.to as jest.Mock;
    const emitMock = toMock.mock.results[0].value.emit;
    expect(emitMock).toHaveBeenCalledWith(
      'stain_result',
      expect.objectContaining({
        pourId: '550e8400-e29b-41d4-a716-446655440003',
        stainPolygons: expect.any(Array),
      })
    );
  });
});
