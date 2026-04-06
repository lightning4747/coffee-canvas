import { Server } from 'socket.io';
import { initializeCanvasService, CanvasServiceOptions } from '../index';
import { DatabaseManager } from '@coffee-canvas/shared';
import { validateJWT } from '../auth';

// Mock everything
jest.mock('socket.io');
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
    userId: 'user-1',
    roomId: 'room-1',
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
      connect: jest.fn().mockResolvedValue({}),
      on: jest.fn(),
      hSet: jest.fn().mockResolvedValue(1),
      hGet: jest.fn().mockResolvedValue(JSON.stringify(testPayload)),
      hGetAll: jest.fn().mockResolvedValue({
        'stroke-1': JSON.stringify({ roomId: 'room-1' }),
      }),
      lPush: jest.fn().mockResolvedValue(1),
      lRange: jest.fn().mockResolvedValue([]),
      lTrim: jest.fn().mockResolvedValue('OK'),
      sAdd: jest.fn().mockResolvedValue(1),
      sMembers: jest.fn().mockResolvedValue([]),
      sRem: jest.fn().mockResolvedValue(1),
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

    expect(mockSocket.join).toHaveBeenCalledWith('room-1');
  });

  it('should handle stroke_begin and cache in Redis', async () => {
    const connectionHandler = await setupService();
    await connectionHandler(mockSocket);

    const strokeBeginHandler = socketListeners['stroke_begin'];
    const payload = {
      strokeId: 'stroke-1',
      roomId: 'room-1',
      color: '#0000ff',
      width: 5,
      tool: 'pen',
      timestamp: Date.now(),
      point: { x: 10, y: 10 },
    };

    await strokeBeginHandler(payload);

    expect(mockRedisClient.hSet).toHaveBeenCalledWith(
      `canvas:stroke:stroke-1`,
      expect.objectContaining({ userId: 'user-1', roomId: 'room-1' })
    );
  });

  it('should handle coffee_pour and interact with Physics client', async () => {
    const connectionHandler = await setupService();
    await connectionHandler(mockSocket);

    const pourHandler = socketListeners['coffee_pour'];
    const payload = {
      pourId: 'pour-1',
      roomId: 'room-1',
      origin: { x: 100, y: 100 },
      intensity: 50,
      color: '#4B3621',
    };

    await pourHandler(payload);

    expect(mockPhysicsClient.computeSpread).toHaveBeenCalled();
    expect(mockIo.to).toHaveBeenCalledWith('room-1');
  });

  it('should handle disconnect', async () => {
    const connectionHandler = await setupService();
    await connectionHandler(mockSocket);

    const disconnectHandler = socketListeners['disconnect'];
    await disconnectHandler();
    expect(mockRedisClient.sRem).toHaveBeenCalled();
  });
});
