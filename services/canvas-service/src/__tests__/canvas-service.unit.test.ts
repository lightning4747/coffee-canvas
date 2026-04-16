import { Server } from 'socket.io';
import { initializeCanvasService, CanvasServiceOptions } from '../index';
import { DatabaseManager } from '@coffee-canvas/shared';
import { validateJWT } from '../auth';

// Mock everything
jest.mock('socket.io');
jest.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: jest.fn().mockImplementation(() => ({
    consume: jest.fn().mockResolvedValue({}),
  })),
}));
jest.mock('../auth');
jest.mock('@coffee-canvas/shared', () => ({
  ...jest.requireActual('@coffee-canvas/shared'),
  DatabaseManager: jest.fn().mockImplementation(() => ({
    insertStrokeEvent: jest.fn().mockResolvedValue({}),
    batchInsertStrokeEvents: jest.fn().mockResolvedValue({}),
    insertStainEvent: jest.fn().mockResolvedValue({}),
  })),
}));

describe('CanvasService Unit Tests', () => {
  let mockIo: any;
  let mockSocket: any;
  let mockRedisClient: any;
  let mockDbManager: any;
  let mockPhysicsClient: any;
  let socketListeners: Record<string, any> = {};

  const testPayload = {
    userId: '550e8400-e29b-41d4-a716-446655440001',
    roomId: '550e8400-e29b-41d4-a716-446655440000',
    displayName: 'Painter',
    color: '#ff0000',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    socketListeners = {};

    mockSocket = {
      id: 'socket-1',
      handshake: {
        query: { token: 'valid-token' },
        auth: { token: 'valid-token' },
      },
      data: { user: testPayload },
      join: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
      on: jest.fn().mockImplementation((event, cb) => {
        socketListeners[event] = cb;
      }),
      disconnect: jest.fn(),
    };

    mockIo = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      adapter: jest
        .fn()
        .mockReturnValue({ remoteJoin: jest.fn().mockResolvedValue({}) }),
      use: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
    };

    // The Server constructor mock
    (Server as unknown as jest.Mock).mockReturnValue(mockIo);

    // Mock Redis Client
    mockRedisClient = {
      ping: jest.fn().mockResolvedValue('PONG'),
      on: jest.fn(),
      hset: jest.fn().mockResolvedValue(1),
      hget: jest.fn().mockResolvedValue(JSON.stringify(testPayload)),
      hgetall: jest.fn().mockResolvedValue({
        'stroke-1': JSON.stringify({ roomId: 'room-1' }),
      }),
      lpush: jest.fn().mockResolvedValue(1),
      lrange: jest.fn().mockResolvedValue([]),
      ltrim: jest.fn().mockResolvedValue('OK'),
      sadd: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      srem: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(1),
    };

    mockDbManager = new DatabaseManager('mock-url');

    mockPhysicsClient = {
      computeSpread: jest.fn().mockResolvedValue({
        pourId: 'pour-1',
        stainPolygons: [
          {
            id: 'stain-1',
            path: [
              { x: 90, y: 90 },
              { x: 110, y: 110 },
            ],
            opacity: 0.5,
            color: '#ff0000',
          },
        ],
        strokeMutations: [],
        computationMs: 10,
      }),
    };

    (validateJWT as jest.Mock).mockResolvedValue(testPayload);
  });

  const setupService = async () => {
    const options: CanvasServiceOptions = {
      redisClient: mockRedisClient,
      dbManager: mockDbManager,
      physicsClient: mockPhysicsClient,
      redisUrl: 'mock',
    };
    await initializeCanvasService({} as any, options);
    // Find the connection handler
    const connectionHandler = mockIo.on.mock.calls.find(
      (call: any) => call[0] === 'connection'
    )[1];
    return connectionHandler;
  };

  it('should handle user connection and join room', async () => {
    const connectionHandler = await setupService();
    await connectionHandler(mockSocket);

    expect(mockSocket.join).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('should handle stroke_begin and cache in Redis', async () => {
    const connectionHandler = await setupService();
    await connectionHandler(mockSocket);

    const strokeBeginHandler = socketListeners['stroke_begin'];
    const payload = {
      strokeId: '550e8400-e29b-41d4-a716-446655440002',
      roomId: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      color: '#0000ff',
      width: 5,
      tool: 'pen',
      timestamp: Date.now(),
      point: { x: 10, y: 10 },
    };

    await strokeBeginHandler(payload);

    expect(mockRedisClient.hset).toHaveBeenCalledWith(
      `canvas:stroke:550e8400-e29b-41d4-a716-446655440002`,
      expect.objectContaining({
        userId: '550e8400-e29b-41d4-a716-446655440001',
        roomId: '550e8400-e29b-41d4-a716-446655440000',
      })
    );
  });

  it('should handle coffee_pour and interact with Physics client', async () => {
    const connectionHandler = await setupService();
    await connectionHandler(mockSocket);

    const pourHandler = socketListeners['coffee_pour'];
    const payload = {
      pourId: '550e8400-e29b-41d4-a716-446655440003',
      roomId: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      origin: { x: 100, y: 100 },
      intensity: 5,
      timestamp: Date.now(),
    };

    await pourHandler(payload);

    expect(mockPhysicsClient.computeSpread).toHaveBeenCalled();
    expect(mockIo.to).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('should handle disconnect', async () => {
    const connectionHandler = await setupService();
    await connectionHandler(mockSocket);

    const disconnectHandler = socketListeners['disconnect'];
    await disconnectHandler();
    expect(mockRedisClient.srem).toHaveBeenCalled();
  });
});
