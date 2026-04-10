import * as fc from 'fast-check';
import { EventEmitter } from 'events';
import { calculateChunkKey } from '@coffee-canvas/shared';

// We require initializeCanvasService after mocks to ensure they are picked up
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initializeCanvasService } = require('../index');

// Mock dependencies
const mockRedisClient = {
  hSet: jest.fn().mockResolvedValue(1),
  hGetAll: jest.fn().mockResolvedValue({}),
  sAdd: jest.fn().mockResolvedValue(1),
  sRem: jest.fn().mockResolvedValue(1),
  sMembers: jest.fn().mockResolvedValue([]),
  rPush: jest.fn().mockResolvedValue(1),
  lPush: jest.fn().mockResolvedValue(1),
  lRange: jest.fn().mockResolvedValue([]),
  expire: jest.fn().mockResolvedValue(true),
  exists: jest.fn().mockResolvedValue(1),
  connect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

jest.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: jest.fn().mockImplementation(() => ({
    consume: jest.fn().mockResolvedValue({}),
  })),
}));

jest.mock('socket.io-redis', () => ({
  createAdapter: jest.fn(),
}));

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
  validateJWT: jest.fn().mockImplementation(token => {
    // Return a payload derived from the "token" string for testing
    const [userId, roomId, displayName, color] = token.split(':');
    return Promise.resolve({ userId, roomId, displayName, color });
  }),
}));

// Mock Shared Constants
export const mockDbManager = {
  batchInsertStrokeEvents: jest.fn().mockResolvedValue(undefined),
  insertStrokeEvent: jest.fn().mockResolvedValue(undefined),
};

export const mockPhysicsClient = {
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
    computationMs: 10,
  }),
};

// Mock modules
jest.mock('@coffee-canvas/shared', () => {
  const original = jest.requireActual('@coffee-canvas/shared');
  return {
    ...original,
    DatabaseManager: jest.fn().mockImplementation(() => mockDbManager),
  };
});

interface MockSocket extends EventEmitter {
  id: string;
  handshake: {
    auth: { token: string };
    headers: Record<string, string | string[] | undefined>;
  };
  data: {
    user: {
      userId: string;
      roomId: string;
      displayName: string;
      color: string;
    };
  };
  join: jest.Mock;
  to: jest.Mock;
}

// Helper to create a mock socket
function createMockSocket(
  id: string,
  userId: string,
  roomId: string,
  displayName: string,
  color: string
): { socket: MockSocket; broadcastEmit: jest.Mock } {
  const socket = new EventEmitter() as unknown as MockSocket;
  socket.id = id;
  socket.handshake = {
    auth: { token: `${userId}:${roomId}:${displayName}:${color}` },
    headers: {},
  };
  socket.data = { user: { userId, roomId, displayName, color } };
  socket.join = jest.fn();

  // Mock broadcasting
  const broadcastEmit = jest.fn();
  socket.to = jest.fn().mockReturnValue({
    emit: broadcastEmit,
  });

  return { socket, broadcastEmit };
}

describe('Canvas Service Property Tests', () => {
  let io: EventEmitter & { to: jest.Mock };
  let flushTasks: () => Promise<void>;

  beforeEach(async () => {
    const mockHttpServer = new EventEmitter();
    const rateLimiterMock = { consume: jest.fn().mockResolvedValue({}) };
    const result = await (initializeCanvasService as any)(
      mockHttpServer as any,
      {
        redisUrl: 'mock',
        redisClient: mockRedisClient,
        dbManager: mockDbManager as any,
        physicsClient: mockPhysicsClient,
        drawingRateLimiter: rateLimiterMock,
        pourRateLimiter: rateLimiterMock,
      }
    );
    io = result.io as unknown as EventEmitter & { to: jest.Mock };
    flushTasks = result.flushPendingTasks;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- Generators (Minimal set used in properties) ---

  const pointArbitrary = fc.record({
    x: fc.float({ noNaN: true, min: -1000000, max: 1000000 }).map(Math.fround),
    y: fc.float({ noNaN: true, min: -1000000, max: 1000000 }).map(Math.fround),
  });

  // --- Properties ---

  it('Property 1: Event Broadcast (Functional Verification)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // strokeId
        fc.uuid(), // roomId
        fc.array(fc.array(pointArbitrary, { minLength: 1, maxLength: 10 }), {
          minLength: 1,
          maxLength: 5,
        }),
        async (strokeId, roomId, segments) => {
          const { socket, broadcastEmit } = createMockSocket(
            'socket-1',
            '550e8400-e29b-41d4-a716-446655440001',
            roomId,
            'Artist',
            '#F00'
          );

          // Mimic the 'connection' logic manually since we are testing handlers
          // In index.ts, handlers are registered on 'connection'
          // Manually trigger the connection handler to register socket listeners
          const connectionListeners = io.listeners('connection') as Array<
            (s: EventEmitter) => Promise<void>
          >;
          await Promise.all(connectionListeners.map(l => l(socket)));

          // Test stroke_begin broadcast
          const beginPayload = {
            strokeId,
            roomId,
            userId: '550e8400-e29b-41d4-a716-446655440001',
            tool: 'pen',
            color: '#000',
            width: 2,
            timestamp: Date.now(),
          };

          socket.emit('stroke_begin', beginPayload);

          // Wait for event loop to process async Redis calls
          await new Promise(resolve => setImmediate(resolve));

          expect(broadcastEmit).toHaveBeenCalledWith(
            'stroke_begin',
            beginPayload
          );

          // Test segments
          for (const points of segments) {
            const segmentPayload = {
              strokeId,
              roomId,
              userId: '550e8400-e29b-41d4-a716-446655440001',
              points,
              timestamp: Date.now(),
            };
            socket.emit('stroke_segment', segmentPayload);

            // Wait for event loop to process async logic
            await new Promise(resolve => setImmediate(resolve));

            expect(broadcastEmit).toHaveBeenCalledWith(
              'stroke_segment',
              segmentPayload
            );
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 2: Stroke Independence (No cross-talk between concurrent strokes)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // strokeId 1
        fc.uuid(), // strokeId 2
        fc.uuid(), // roomId
        fc.array(pointArbitrary, { minLength: 1, maxLength: 3 }), // points 1
        fc.array(pointArbitrary, { minLength: 1, maxLength: 3 }), // points 2
        async (id1, id2, roomId, pts1, pts2) => {
          fc.pre(id1 !== id2); // Ensure IDs are different

          const { socket: s1 } = createMockSocket(
            's1',
            '550e8400-e29b-41d4-a716-446655440001',
            roomId,
            'User 1',
            '#F00'
          );
          const { socket: s2 } = createMockSocket(
            's2',
            '550e8400-e29b-41d4-a716-446655440011',
            roomId,
            'User 2',
            '#00F'
          );

          const connectionListeners = io.listeners('connection') as Array<
            (socket: EventEmitter) => Promise<void>
          >;
          // Properly await the async connection handlers
          await Promise.all(connectionListeners.map(l => l(s1)));
          await Promise.all(connectionListeners.map(l => l(s2)));

          // Interleave strokes
          s1.emit('stroke_begin', {
            strokeId: id1,
            roomId,
            userId: '550e8400-e29b-41d4-a716-446655440001',
            tool: 'pen',
            color: '#000',
            width: 1,
            timestamp: Date.now(),
          });
          s2.emit('stroke_begin', {
            strokeId: id2,
            roomId,
            userId: '550e8400-e29b-41d4-a716-446655440011',
            tool: 'brush',
            color: '#FFF',
            width: 5,
            timestamp: Date.now(),
          });

          await new Promise(resolve => setImmediate(resolve));

          // Verify Redis isolation for begin
          expect(mockRedisClient.hSet).toHaveBeenCalledWith(
            `canvas:stroke:${id1}`,
            expect.objectContaining({ tool: 'pen' })
          );
          expect(mockRedisClient.hSet).toHaveBeenCalledWith(
            `canvas:stroke:${id2}`,
            expect.objectContaining({ tool: 'brush' })
          );

          // Interleave segments
          s1.emit('stroke_segment', {
            strokeId: id1,
            roomId,
            userId: '550e8400-e29b-41d4-a716-446655440001',
            points: pts1,
            timestamp: Date.now(),
          });
          s2.emit('stroke_segment', {
            strokeId: id2,
            roomId,
            userId: '550e8400-e29b-41d4-a716-446655440011',
            points: pts2,
            timestamp: Date.now(),
          });

          await new Promise(resolve => setImmediate(resolve));

          // Verify Redis isolation for points lists
          expect(mockRedisClient.rPush).toHaveBeenCalledWith(
            `canvas:stroke:${id1}:points`,
            pts1.map(p => JSON.stringify(p))
          );
          expect(mockRedisClient.rPush).toHaveBeenCalledWith(
            `canvas:stroke:${id2}:points`,
            pts2.map(p => JSON.stringify(p))
          );
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Property 3: Room Isolation (Broadcasts stay within the room)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId 1
        fc.uuid(), // roomId 2
        async (room1, room2) => {
          fc.pre(room1 !== room2);

          const { socket: s1, broadcastEmit: b1 } = createMockSocket(
            's1',
            '550e8400-e29b-41d4-a716-446655440001',
            room1,
            'Artist 1',
            '#F00'
          );
          const { socket: s2, broadcastEmit: b2 } = createMockSocket(
            's2',
            '550e8400-e29b-41d4-a716-446655440011',
            room2,
            'Artist 2',
            '#00F'
          );

          const connectionListeners = io.listeners('connection') as Array<
            (socket: EventEmitter) => Promise<void>
          >;
          // Properly await the async connection handlers
          await Promise.all(connectionListeners.map(l => l(s1)));
          await Promise.all(connectionListeners.map(l => l(s2)));

          // Clear mocks from user-joined broadcasts
          b1.mockClear();
          b2.mockClear();
          (s1.to as jest.Mock).mockClear();
          (s2.to as jest.Mock).mockClear();

          const payload = {
            strokeId: '550e8400-e29b-41d4-a716-446655440002',
            roomId: room1,
            userId: '550e8400-e29b-41d4-a716-446655440001',
            tool: 'pen',
            color: '#000',
            width: 1,
            timestamp: Date.now(),
          };

          // Emit in room 1
          s1.emit('stroke_begin', payload);
          await new Promise(resolve => setImmediate(resolve));

          // Verifications
          // 1. Room 1 broadcast was targeted correctly
          expect(s1.to).toHaveBeenCalledWith(room1);
          expect(b1).toHaveBeenCalledWith('stroke_begin', payload);

          // 2. Room 2 should NOT have received this broadcast
          expect(s2.to).not.toHaveBeenCalledWith(room1);
          expect(b2).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Property 9: Stroke Persistence Consistency (Draft events eventually reach DB)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // strokeId
        fc.uuid(), // roomId
        fc.array(pointArbitrary, { minLength: 3, maxLength: 10 }), // points
        async (strokeId, roomId, points) => {
          const { socket } = createMockSocket(
            'socket-p',
            '550e8400-e29b-41d4-a716-446655440001',
            roomId,
            'Artist',
            '#F00'
          );

          // Register handlers
          const connectionListeners = io.listeners('connection') as Array<
            (s: EventEmitter) => Promise<void>
          >;
          await Promise.all(connectionListeners.map(l => l(socket)));

          // 0. Setup and clear mocks
          mockRedisClient.exists.mockResolvedValue(1);
          mockRedisClient.lRange.mockResolvedValue(
            points.map(p => JSON.stringify(p))
          );
          mockRedisClient.hGetAll.mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440001',
            roomId,
            tool: 'pen',
            color: '#000',
            width: '2',
            startTime: Date.now().toString(),
          });
          // NOTE: We don't mockClear here to avoid race conditions between parallel async runs.
          // Instead we verify unique strokeId below.

          // 1. Emit events
          socket.emit('stroke_begin', {
            strokeId,
            roomId,
            userId: '550e8400-e29b-41d4-a716-446655440001',
            tool: 'pen',
            color: '#000',
            width: 2,
            timestamp: Date.now(),
          });
          socket.emit('stroke_segment', {
            strokeId,
            roomId,
            userId: '550e8400-e29b-41d4-a716-446655440001',
            points: points.slice(1, -1),
            timestamp: Date.now(),
          });
          socket.emit('stroke_end', {
            strokeId,
            roomId,
            userId: '550e8400-e29b-41d4-a716-446655440001',
            timestamp: Date.now(),
          });

          // 2. Wait for async setImmediate persistence + async work
          await new Promise(resolve => setTimeout(resolve, 100));
          await flushTasks();

          // 3. Verifications
          // Use haveBeenCalledWith to avoid race conditions with other runs
          expect(mockDbManager.batchInsertStrokeEvents).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ strokeId })])
          );

          const lastCall =
            mockDbManager.batchInsertStrokeEvents.mock.calls.find(call =>
              call[0].some((e: any) => e.strokeId === strokeId)
            );
          const persistedEvents = lastCall[0];
          expect(persistedEvents.length).toBeGreaterThanOrEqual(3);

          const expectedChunkKey = calculateChunkKey(points[0]);
          expect(persistedEvents[0].chunkKey).toBe(expectedChunkKey);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Property 10: Stain Persistence Consistency (Coffee pour eventually reaches DB)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // pourId
        fc.uuid(), // roomId
        pointArbitrary, // origin
        fc.double({ min: 1.0, max: 10.0 }), // intensity
        async (pourId, roomId, origin, intensity) => {
          const { socket } = createMockSocket(
            'socket-s',
            '550e8400-e29b-41d4-a716-446655440001',
            roomId,
            'Server',
            '#640'
          );

          // Register handlers
          const connectionListeners = io.listeners('connection') as Array<
            (s: EventEmitter) => Promise<void>
          >;
          await Promise.all(connectionListeners.map(l => l(socket)));

          // 0. Setup (No mockClear to avoid race conditions)

          // 1. Emit coffee_pour
          socket.emit('coffee_pour', {
            pourId,
            roomId,
            userId: '550e8400-e29b-41d4-a716-446655440001',
            origin,
            intensity,
            timestamp: Date.now(),
          });

          // 2. Wait for async physics + async persistence
          await new Promise(resolve => setTimeout(resolve, 50));
          await flushTasks();

          // 3. Verifications
          expect(mockPhysicsClient.computeSpread).toHaveBeenCalledWith(
            roomId,
            pourId,
            origin,
            intensity,
            expect.anything()
          );
          expect(mockDbManager.insertStrokeEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              strokeId: pourId,
              eventType: 'stain',
              roomId,
            })
          );
        }
      ),
      { numRuns: 20 }
    );
  });
});
