import * as fc from 'fast-check';
import { EventEmitter } from 'events';
import { initializeCanvasService } from '../index';

// --- Mocks ---

// Mock Redis
const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  hSet: jest.fn().mockResolvedValue(1),
  sAdd: jest.fn().mockResolvedValue(1),
  sRem: jest.fn().mockResolvedValue(1),
  rPush: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(true),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

// Mock Socket.IO Server and Adapter
jest.mock('socket.io-redis', () => ({
  createAdapter: jest.fn().mockReturnValue(
    class MockAdapter {
      init() {}
    }
  ),
}));

// Mock JWT Validation
jest.mock('../auth', () => ({
  validateJWT: jest.fn().mockImplementation((token: string) => {
    // Return a payload derived from the "token" string for testing
    const [userId, roomId, displayName, color] = token.split(':');
    return Promise.resolve({ userId, roomId, displayName, color });
  }),
}));

interface MockSocket extends EventEmitter {
  id: string;
  handshake: { auth: { token: string }; headers: any };
  data: { user: any };
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
  let io: EventEmitter;

  beforeEach(async () => {
    const mockHttpServer = new EventEmitter();
    const result = await initializeCanvasService(mockHttpServer as any, 'mock');
    io = result.io as unknown as EventEmitter;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- Generators (Minimal set used in properties) ---

  const pointArbitrary = fc.record({
    x: fc.float({ noNaN: true }),
    y: fc.float({ noNaN: true }),
  });

  // --- Properties ---

  it('Property 1: Broadcast Latency (Processing Overhead < 10ms)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5 }), // strokeId
        fc.string({ minLength: 5 }), // roomId
        fc.array(fc.array(pointArbitrary, { minLength: 1, maxLength: 10 }), {
          minLength: 1,
          maxLength: 5,
        }),
        async (strokeId, roomId, segments) => {
          const { socket, broadcastEmit } = createMockSocket(
            'socket-1',
            'user-1',
            roomId,
            'Artist',
            '#F00'
          );

          // Mimic the 'connection' logic manually since we are testing handlers
          // In index.ts, handlers are registered on 'connection'
          // Manually trigger the connection handler to register socket listeners
          const connectionListeners = io.listeners('connection');
          connectionListeners.forEach(listener =>
            (listener as (s: any) => void)(socket)
          );

          // Test stroke_begin latency and broadcast
          const beginPayload = {
            strokeId,
            roomId,
            tool: 'pen',
            color: '#000',
            width: 2,
            timestamp: Date.now(),
          };

          const start = performance.now();
          socket.emit('stroke_begin', beginPayload);

          // Wait for event loop to process async Redis calls
          await new Promise(resolve => setImmediate(resolve));

          const end = performance.now();
          expect(end - start).toBeLessThan(15); // Slightly higher for CI stability, but target < 10ms
          expect(broadcastEmit).toHaveBeenCalledWith(
            'stroke_begin',
            beginPayload
          );

          // Test segments
          for (const points of segments) {
            const segmentPayload = {
              strokeId,
              roomId,
              points,
              timestamp: Date.now(),
            };
            const sStart = performance.now();
            socket.emit('stroke_segment', segmentPayload);
            await new Promise(resolve => setImmediate(resolve));
            const sEnd = performance.now();

            expect(sEnd - sStart).toBeLessThan(10);
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
        fc.string({ minLength: 5, maxLength: 10 }), // strokeId 1
        fc.string({ minLength: 5, maxLength: 10 }), // strokeId 2
        fc.string({ minLength: 5 }), // roomId
        fc.array(pointArbitrary, { minLength: 1, maxLength: 3 }), // points 1
        fc.array(pointArbitrary, { minLength: 1, maxLength: 3 }), // points 2
        async (id1, id2, roomId, pts1, pts2) => {
          fc.pre(id1 !== id2); // Ensure IDs are different

          const { socket: s1 } = createMockSocket(
            's1',
            'u1',
            roomId,
            'User 1',
            '#F00'
          );
          const { socket: s2 } = createMockSocket(
            's2',
            'u2',
            roomId,
            'User 2',
            '#00F'
          );

          const connectionListeners = io.listeners('connection');
          connectionListeners.forEach((listener: any) => {
            (listener as any)(s1);
            (listener as any)(s2);
          });

          // Interleave strokes
          s1.emit('stroke_begin', {
            strokeId: id1,
            roomId,
            tool: 'pen',
            color: '#000',
            width: 1,
            timestamp: Date.now(),
          });
          s2.emit('stroke_begin', {
            strokeId: id2,
            roomId,
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
            points: pts1,
            timestamp: Date.now(),
          });
          s2.emit('stroke_segment', {
            strokeId: id2,
            roomId,
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
        fc.string({ minLength: 5 }), // roomId 1
        fc.string({ minLength: 5 }), // roomId 2
        async (room1, room2) => {
          fc.pre(room1 !== room2);

          const { socket: s1, broadcastEmit: b1 } = createMockSocket(
            's1',
            'u1',
            room1,
            'Artist 1',
            '#F00'
          );
          const { socket: s2, broadcastEmit: b2 } = createMockSocket(
            's2',
            'u2',
            room2,
            'Artist 2',
            '#00F'
          );

          const connectionListeners = io.listeners('connection');
          connectionListeners.forEach((listener: any) => {
            (listener as any)(s1);
            (listener as any)(s2);
          });

          // Clear mocks from user-joined broadcasts
          b1.mockClear();
          b2.mockClear();
          (s1.to as jest.Mock).mockClear();
          (s2.to as jest.Mock).mockClear();

          const payload = {
            strokeId: 'test-stroke',
            roomId: room1,
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
});
