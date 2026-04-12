import { io, Socket } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { AddressInfo } from 'net';
import { physicsClient } from '../physics-client';

// Mock the physics client to simulate failures
jest.mock('../physics-client', () => ({
  physicsClient: {
    computeSpread: jest.fn(),
  },
}));

describe('Resilience Integration Tests', () => {
  let ioServer: Server;
  let socket: Socket;
  let port: number;

  beforeAll(done => {
    const httpServer = createServer();
    ioServer = new Server(httpServer);

    // Minimal mock of the coffee_pour logic for testing resilience
    ioServer.on('connection', s => {
      s.on('coffee_pour', async payload => {
        try {
          const result = await (physicsClient.computeSpread as jest.Mock)(
            payload.roomId,
            payload.pourId,
            payload.origin,
            payload.intensity,
            []
          );
          s.emit('stain_result', result);
        } catch (error) {
          // Simplified fallback logic for test
          s.emit('stain_result', {
            pourId: payload.pourId,
            fallback: true,
          });
          s.emit('error', { message: 'Simulation failed' });
        }
      });
    });

    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterAll(() => {
    ioServer.close();
  });

  beforeEach(done => {
    socket = io(`http://localhost:${port}`);
    socket.on('connect', done);
  });

  afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  it('should return a fallback result when physics service fails', done => {
    (physicsClient.computeSpread as jest.Mock).mockRejectedValueOnce(
      new Error('Circuit Breaker Open')
    );

    socket.emit('coffee_pour', {
      roomId: 'test-room',
      pourId: 'pour-123',
      origin: { x: 100, y: 100 },
      intensity: 10,
    });

    socket.on('stain_result', result => {
      expect(result.pourId).toBe('pour-123');
      expect(result.fallback).toBe(true);
      done();
    });
  });

  it('should return normal result when physics service is healthy', done => {
    const mockResult = {
      pourId: 'pour-456',
      stainPolygons: [],
      mutatedStrokes: [],
      computationMs: 10,
    };
    (physicsClient.computeSpread as jest.Mock).mockResolvedValueOnce(
      mockResult
    );

    socket.emit('coffee_pour', {
      roomId: 'test-room',
      pourId: 'pour-456',
      origin: { x: 200, y: 200 },
      intensity: 20,
    });

    socket.on('stain_result', result => {
      expect(result.pourId).toBe('pour-456');
      expect(result.computationMs).toBe(10);
      done();
    });
  });
});
