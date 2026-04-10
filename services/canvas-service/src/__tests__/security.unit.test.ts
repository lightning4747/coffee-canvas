import { Server } from 'socket.io';
import { initializeCanvasService, CanvasServiceOptions } from '../index';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { validateJWT } from '../auth';

// Mock Socket.IO and dependencies
jest.mock('socket.io');
jest.mock('rate-limiter-flexible');
jest.mock('../auth');
jest.mock('@coffee-canvas/shared', () => ({
  ...jest.requireActual('@coffee-canvas/shared'),
  DatabaseManager: jest.fn().mockImplementation(() => ({
    healthCheck: jest.fn().mockResolvedValue(true),
  })),
}));

describe('Canvas Service Rate Limiting Unit Tests', () => {
  let mockIo: any;
  let mockSocket: any;
  let mockRedisClient: any;
  let socketListeners: Record<string, any> = {};

  const testUser = {
    userId: '550e8400-e29b-41d4-a716-446655440001',
    roomId: '550e8400-e29b-41d4-a716-446655440000',
    displayName: 'Painter',
    color: '#FF6B6B',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    socketListeners = {};

    mockSocket = {
      id: 'socket-1',
      handshake: { auth: { token: 'valid-token' }, headers: {} },
      data: { user: testUser },
      join: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
      on: jest.fn().mockImplementation((event, cb) => {
        socketListeners[event] = cb;
      }),
      disconnect: jest.fn(),
    };

    mockIo = {
      use: jest.fn(),
      on: jest.fn(),
      adapter: jest.fn(),
      close: jest.fn().mockResolvedValue({}),
    };

    (Server as unknown as jest.Mock).mockReturnValue(mockIo);
    (validateJWT as jest.Mock).mockResolvedValue(testUser);

    mockRedisClient = {
      connect: jest.fn().mockResolvedValue({}),
      disconnect: jest.fn().mockResolvedValue({}),
      hSet: jest.fn().mockResolvedValue(1),
      sAdd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
    };
  });

  const setupService = async () => {
    const options: CanvasServiceOptions = {
      redisClient: mockRedisClient,
      redisUrl: 'mock',
    };
    // initializeCanvasService will call mockIo.on('connection', ...)
    await initializeCanvasService({} as any, options);

    // Get the MOST RECENT connection handler
    const connectionCalls = mockIo.on.mock.calls.filter(
      (c: any) => c[0] === 'connection'
    );
    const connectionHandler = connectionCalls[connectionCalls.length - 1][1];

    await connectionHandler(mockSocket);
    return socketListeners;
  };

  it('should allow events when rate limit is not exceeded', async () => {
    // Setup limiter to succeed
    const consumeMock = RateLimiterRedis.prototype.consume as jest.Mock;
    consumeMock.mockResolvedValue({});

    const handlers = await setupService();
    const payload = {
      roomId: testUser.roomId,
      userId: testUser.userId,
      strokeId: '550e8400-e29b-41d4-a716-446655440002',
      tool: 'pen',
      color: '#000000',
      width: 5,
      timestamp: Date.now(),
    };

    await handlers['stroke_begin'](payload);

    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'error',
      expect.anything()
    );
    expect(mockSocket.to).toHaveBeenCalled();
  });

  it('should reject stroke_begin when rate limit is exceeded', async () => {
    // Setup limiter to fail
    const consumeMock = RateLimiterRedis.prototype.consume as jest.Mock;
    consumeMock.mockRejectedValue(new Error('Rate limit exceeded'));

    const handlers = await setupService();
    // Clear connection broadcasts
    (mockSocket.to as jest.Mock).mockClear();

    const payload = {
      roomId: testUser.roomId,
      userId: testUser.userId,
      strokeId: '550e8400-e29b-41d4-a716-446655440002',
      tool: 'pen',
      color: '#000000',
      width: 5,
      timestamp: Date.now(),
    };

    await handlers['stroke_begin'](payload);

    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      message: 'Rate limit exceeded for drawing',
    });
    // IMPORTANT: Clear the 'to' mock to be sure it wasn't called in THIS handler
    expect(mockSocket.to).not.toHaveBeenCalled();
  });

  it('should reject coffee_pour when intensity-specific rate limit is exceeded', async () => {
    const handlers = await setupService();

    // The second limiter instance is the pour one
    const instances = (RateLimiterRedis as jest.Mock).mock.instances;
    const pourLimiter = instances[instances.length - 1];
    jest.spyOn(pourLimiter, 'consume').mockRejectedValue(new Error('Cooldown'));

    const payload = {
      roomId: testUser.roomId,
      userId: testUser.userId,
      pourId: '550e8400-e29b-41d4-a716-446655440003',
      origin: { x: 0, y: 0 },
      intensity: 5.0,
      timestamp: Date.now(),
    };

    await handlers['coffee_pour'](payload);

    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      message: 'Coffee pour is on cooldown',
    });
  });

  it('should disconnect user on room ID spoofing in stroke_begin', async () => {
    (RateLimiterRedis.prototype.consume as jest.Mock).mockResolvedValue({});
    const handlers = await setupService();

    const payload = {
      roomId: '550e8400-e29b-41d4-a716-446655440999', // Valid UUID but spoofed
      userId: testUser.userId,
      strokeId: '550e8400-e29b-41d4-a716-446655440002',
      tool: 'pen',
      color: '#000000',
      width: 1,
      timestamp: Date.now(),
    };

    // Clear any disconnects from setup if any (should be none but for safety)
    (mockSocket.disconnect as jest.Mock).mockClear();

    await handlers['stroke_begin'](payload);

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
