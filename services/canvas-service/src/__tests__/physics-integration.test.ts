import { EventEmitter } from 'events';
import { initializeCanvasService } from '../index';
import { physicsClient } from '../physics-client';

// --- Mocks ---

// Mock Redis
const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  hSet: jest.fn().mockResolvedValue(1),
  hGetAll: jest.fn().mockResolvedValue({
    userId: 'user-1',
    roomId: 'room-1',
    tool: 'pen',
    color: '#000',
    width: '2',
    startTime: Date.now().toString(),
  }),
  sAdd: jest.fn().mockResolvedValue(1),
  sMembers: jest.fn().mockResolvedValue(['stroke-1']),
  sRem: jest.fn().mockResolvedValue(1),
  rPush: jest.fn().mockResolvedValue(1),
  lPush: jest.fn().mockResolvedValue(1),
  lRange: jest.fn().mockResolvedValue([JSON.stringify({ x: 10, y: 10 })]),
  expire: jest.fn().mockResolvedValue(true),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
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

// Mock Physics Client
jest.mock('../physics-client', () => ({
  physicsClient: {
    computeSpread: jest.fn().mockResolvedValue({
      pourId: 'pour-123',
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
  },
}));

// Mock JWT Validation
jest.mock('../auth', () => ({
  validateJWT: jest.fn().mockResolvedValue({
    userId: 'user-1',
    roomId: 'room-1',
    displayName: 'Test User',
    color: '#F00',
  }),
}));

describe('Physics Integration Verification', () => {
  let io: EventEmitter & { to: jest.Mock };

  beforeEach(async () => {
    const mockHttpServer = new EventEmitter();
    const result = await initializeCanvasService(
      mockHttpServer as unknown as Parameters<
        typeof initializeCanvasService
      >[0],
      'mock'
    );
    io = result.io as unknown as EventEmitter & { to: jest.Mock };

    // Mock io.to(roomId).emit
    io.to = jest.fn().mockReturnValue({ emit: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Should handle coffee_pour, call physics service, and broadcast stain_result', async () => {
    const roomId = 'room-1';
    const userId = 'user-1';

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

    // Payload for coffee_pour
    const pourPayload = {
      roomId,
      userId,
      pourId: 'pour-123',
      origin: { x: 100, y: 100 },
      intensity: 10,
      timestamp: Date.now(),
    };

    // Trigger coffee_pour
    socket.emit('coffee_pour', pourPayload);

    // Wait for the async handler to finish
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assertions
    // 1. Should have fetched active strokes from Redis
    expect(mockRedisClient.sMembers).toHaveBeenCalledWith(
      `canvas:room:${roomId}:active_strokes`
    );

    // 2. Should have called physics client with correct data
    expect(physicsClient.computeSpread).toHaveBeenCalledWith(
      roomId,
      'pour-123',
      pourPayload.origin,
      pourPayload.intensity,
      expect.arrayContaining([
        expect.objectContaining({
          strokeId: 'stroke-1',
          points: [{ x: 10, y: 10 }],
        }),
      ])
    );

    // 3. Should have cached the result in Redis
    expect(mockRedisClient.lPush).toHaveBeenCalledWith(
      `canvas:room:${roomId}:stains`,
      expect.stringContaining('"pourId":"pour-123"')
    );
    expect(mockRedisClient.expire).toHaveBeenCalledWith(
      `canvas:room:${roomId}:stains`,
      3600
    );

    // 4. Should have broadcast stain_result to the room
    expect(io.to).toHaveBeenCalledWith(roomId);
  });
});
