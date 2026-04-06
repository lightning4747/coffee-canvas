import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { initializeCanvasService } from '../index';
import {
  DatabaseManager,
  calculateChunkKey,
  StrokeEvent,
} from '@coffee-canvas/shared';
import { physicsClient } from '../physics-client';

// Mock Dependencies
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    hSet: jest.fn().mockResolvedValue(1),
    hGetAll: jest.fn().mockResolvedValue({
      userId: 'user-1',
      roomId: 'room-1',
      tool: 'pen',
      color: '#000000',
      width: '2',
      startTime: Date.now().toString(),
    }),
    sRem: jest.fn().mockResolvedValue(1),
    sMembers: jest.fn().mockResolvedValue([]),
    exists: jest.fn().mockResolvedValue(1),
    lRange: jest
      .fn()
      .mockResolvedValue([
        JSON.stringify({ x: 10, y: 10 }),
        JSON.stringify({ x: 20, y: 20 }),
      ]),
    expire: jest.fn().mockResolvedValue(true),
    rPush: jest.fn().mockResolvedValue(1),
    lPush: jest.fn().mockResolvedValue(1),
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
      };
      ioMock.use = jest.fn();
      ioMock.to = jest.fn().mockReturnValue({ emit: jest.fn() });
      ioMock.close = jest.fn().mockImplementation(cb => {
        if (cb) cb();
        return Promise.resolve();
      });
      return ioMock;
    }),
  };
});

jest.mock('@coffee-canvas/shared', () => {
  const original = jest.requireActual('@coffee-canvas/shared');
  return {
    ...original,
    DatabaseManager: jest.fn().mockImplementation(() => ({
      batchInsertStrokeEvents: jest.fn().mockResolvedValue(undefined),
      insertStrokeEvent: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

jest.mock('../auth', () => ({
  validateJWT: jest.fn().mockResolvedValue({
    userId: 'user-1',
    roomId: 'room-1',
    displayName: 'Test User',
    color: '#ff0000',
  }),
}));

jest.mock('../physics-client', () => ({
  physicsClient: {
    computeSpread: jest.fn(),
  },
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

describe('Persistence Integration Verification', () => {
  let io: Server;
  let dbManager: {
    batchInsertStrokeEvents: jest.Mock;
    insertStrokeEvent: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mockHttpServer = new EventEmitter();
    const result = await initializeCanvasService(
      mockHttpServer as unknown as Parameters<
        typeof initializeCanvasService
      >[0],
      { redisUrl: 'mock' }
    );
    io = result.io as unknown as Server;

    // Get the mocked DatabaseManager instance (it's the latest one created)
    const instances = (DatabaseManager as jest.Mock).mock.results;
    dbManager = instances[instances.length - 1].value;
  });

  afterAll(async () => {
    if (io) {
      await new Promise<void>(resolve => io.close(() => resolve()));
    }
  });

  test('should persist stroke asynchronously on stroke_end', async () => {
    const socket = new EventEmitter() as MockSocket;
    socket.id = 'socket-1';
    socket.handshake = { auth: { token: 'valid-token' }, headers: {} };
    socket.data = {
      user: { userId: 'user-1', roomId: 'room-1', displayName: 'Test User' },
    };
    socket.join = jest.fn();
    socket.to = jest.fn().mockReturnValue({ emit: jest.fn() });

    // Trigger connection
    io.emit('connection', socket);

    // Simulate stroke_end
    socket.emit('stroke_end', {
      roomId: 'room-1',
      userId: 'user-1',
      strokeId: 'stroke-1',
      timestamp: Date.now(),
    });

    // 3. Wait for async persistence
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(dbManager.batchInsertStrokeEvents).toHaveBeenCalled();
    const events = dbManager.batchInsertStrokeEvents.mock
      .calls[0][0] as StrokeEvent[];

    expect(events).toHaveLength(3); // begin, segment, end
    expect(events[0].eventType).toBe('begin');
    expect(events[1].eventType).toBe('segment');
    expect(events[2].eventType).toBe('end');

    // Verify spatial chunk key (10, 10) -> (0, 0) -> "0:0"
    const expectedChunkKey = calculateChunkKey({ x: 10, y: 10 });
    expect(events[0].chunkKey).toBe(expectedChunkKey);
  });

  test('should persist stain asynchronously on coffee_pour', async () => {
    const socket = new EventEmitter() as MockSocket;
    socket.id = 'socket-1';
    socket.handshake = { auth: { token: 'valid-token' }, headers: {} };
    socket.data = {
      user: { userId: 'user-1', roomId: 'room-1', displayName: 'Test User' },
    };
    socket.join = jest.fn();
    socket.to = jest.fn().mockReturnValue({ emit: jest.fn() });

    // Mock physics client response
    (physicsClient.computeSpread as jest.Mock).mockResolvedValue({
      pourId: 'pour-1',
      stainPolygons: [
        {
          id: 'stain-1',
          path: [{ x: 5, y: 5 }],
          opacity: 0.5,
          color: '#6F4E37',
        },
      ],
      strokeMutations: [],
      computationMs: 10,
    });

    // Trigger connection
    io.emit('connection', socket);

    // Simulate coffee_pour
    socket.emit('coffee_pour', {
      roomId: 'room-1',
      userId: 'user-1',
      pourId: 'pour-1',
      origin: { x: 50, y: 50 },
      intensity: 1.0,
      timestamp: Date.now(),
    });

    // 3. Wait for async physics compute + async persistence
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(dbManager.insertStrokeEvent).toHaveBeenCalled();
    const event = dbManager.insertStrokeEvent.mock.calls[0][0] as StrokeEvent;

    expect(event.eventType).toBe('stain');
    expect(event.strokeId).toBe('pour-1');

    // Verify spatial chunk key (50, 50) -> "0:0"
    const expectedChunkKey = calculateChunkKey({ x: 50, y: 50 });
    expect(event.chunkKey).toBe(expectedChunkKey);
  });
});
