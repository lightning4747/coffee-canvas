import { PhysicsClient } from '../physics-client';
import { StainResult, Point2D, StrokeData } from '@coffee-canvas/shared';

// Mock the grpc-js and proto-loader to prevent actual gRPC calls
jest.mock('@grpc/grpc-js', () => ({
  loadPackageDefinition: jest.fn().mockReturnValue({
    physics: {
      CoffeePhysics: jest.fn().mockImplementation(() => ({
        computeSpread: jest.fn(),
      })),
    },
  }),
  credentials: {
    createInsecure: jest.fn(),
  },
}));

jest.mock('@grpc/proto-loader', () => ({
  loadSync: jest.fn().mockReturnValue({}),
}));

describe('PhysicsClient Unit Tests', () => {
  let physicsClient: PhysicsClient;
  let mockGrpcClient: any;

  beforeEach(() => {
    physicsClient = new PhysicsClient();
    // Access the private client for mocking
    mockGrpcClient = (physicsClient as any).client;
  });

  const validOrigin: Point2D = { x: 100, y: 100 };
  const validStrokes: StrokeData[] = [
    {
      strokeId: 'stroke-1',
      roomId: 'room-1',
      userId: 'user-1',
      tool: 'brush',
      color: '#ff0000',
      width: 5,
      points: [
        { x: 50, y: 50 },
        { x: 150, y: 150 },
      ],
      opacity: 1,
      timestamp: Date.now(),
    },
  ];

  it('should call computeSpread with correct arguments and return result', async () => {
    const mockResponse: StainResult = {
      pourId: 'pour-1',
      stainPolygons: [
        {
          id: 'stain-1',
          path: [
            { x: 80, y: 80 },
            { x: 120, y: 120 },
          ],
          opacity: 0.5,
          color: '#ff0000',
        },
      ],
      strokeMutations: [],
      computationMs: 10,
    };

    mockGrpcClient.computeSpread.mockImplementation(
      (req: any, options: any, callback: any) => {
        callback(null, mockResponse);
      }
    );

    const result = await physicsClient.computeSpread(
      'room-1',
      'pour-1',
      validOrigin,
      50,
      validStrokes
    );

    expect(result).toEqual(mockResponse);
    expect(mockGrpcClient.computeSpread).toHaveBeenCalledWith(
      expect.objectContaining({
        room_id: 'room-1',
        pour_id: 'pour-1',
        origin: validOrigin,
        intensity: 50,
      }),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should reject if gRPC call fails', async () => {
    const mockError = new Error('gRPC internal error');

    mockGrpcClient.computeSpread.mockImplementation(
      (req: any, options: any, callback: any) => {
        callback(mockError, null);
      }
    );

    await expect(
      physicsClient.computeSpread(
        'room-1',
        'pour-1',
        validOrigin,
        50,
        validStrokes
      )
    ).rejects.toThrow('gRPC internal error');
  });

  it('should include nearby strokes in the request', async () => {
    mockGrpcClient.computeSpread.mockImplementation(
      (req: any, options: any, callback: any) => {
        callback(null, {});
      }
    );

    await physicsClient.computeSpread(
      'room-1',
      'pour-1',
      validOrigin,
      50,
      validStrokes
    );

    const callArgs = mockGrpcClient.computeSpread.mock.calls[0][0];
    expect(callArgs.nearby_strokes).toHaveLength(1);
    expect(callArgs.nearby_strokes[0].stroke_id).toBe('stroke-1');
  });
});
