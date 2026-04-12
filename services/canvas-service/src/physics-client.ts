/**
 * gRPC Client for the Coffee Physics Service.
 * This client translates drawing events into physics simulation requests
 * and receives stain polygons and stroke mutations in response.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import CircuitBreaker from 'opossum';
import {
  createLogger,
  Point2D,
  StainResult,
  StrokeData,
} from '@coffee-canvas/shared';

const logger = createLogger('physics-client');

const PROTO_PATH = path.resolve(
  __dirname,
  '../../../shared/proto/physics.proto'
);
const PHYSICS_SERVICE_URL =
  process.env.PHYSICS_SERVICE_URL || 'localhost:50051';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const physicsProto = grpc.loadPackageDefinition(
  packageDefinition
) as unknown as {
  physics: {
    CoffeePhysics: typeof grpc.Client;
  };
};

/**
 * Service client for interacting with the Physics Service via gRPC.
 * Encapsulates the complexity of protobuf serialization and gRPC deadlines.
 */
export class PhysicsClient {
  private client: any;

  /**
   * Initializes the gRPC connection to the Physics Service.
   */
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.client = new (physicsProto.physics.CoffeePhysics as any)(
      PHYSICS_SERVICE_URL,
      grpc.credentials.createInsecure()
    );

    // Initialize Circuit Breaker (Task 11.1)
    this.breaker = new CircuitBreaker(this._invokeComputeSpread.bind(this), {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 10000,
    });

    this.breaker.on('open', () =>
      logger.warn('[CircuitBreaker] Physics Service breaker OPEN')
    );
    this.breaker.on('halfOpen', () =>
      logger.info('[CircuitBreaker] Physics Service breaker HALF-OPEN')
    );
    this.breaker.on('close', () =>
      logger.info('[CircuitBreaker] Physics Service breaker CLOSED')
    );
  }

  private breaker: CircuitBreaker<[any], StainResult>;

  /**
   * Computes the spread of a coffee pour simulation based on nearby canvas geometry.
   *
   * @param roomId - Target room ID for the simulation context.
   * @param pourId - Unique identifier for this specific pour event.
   * @param origin - Starting point of the pour on the canvas.
   * @param intensity - Radius and strength of the initial fluid impact.
   * @param strokes - Array of nearby strokes to consider for absorption and blurring.
   * @returns Promise resolving to the generated stain results and stroke mutations.
   * @throws {grpc.ServiceError} If the gRPC call fails or times out.
   */
  async computeSpread(
    roomId: string,
    pourId: string,
    origin: Point2D,
    intensity: number,
    strokes: StrokeData[]
  ): Promise<StainResult> {
    const request = {
      room_id: roomId,
      pour_id: pourId,
      origin,
      intensity,
      viscosity: 0.5,
      simulation_steps: 15,
      nearby_strokes: strokes.map(s => ({
        stroke_id: s.strokeId,
        color: s.color,
        width: s.width,
        points: s.points,
        opacity: s.opacity || 1.0,
      })),
    };

    try {
      return await this.breaker.fire(request);
    } catch (err) {
      logger.error('Physics simulation failed (Breaker):', err);
      throw err;
    }
  }

  /**
   * Internal method for gRPC invocation, wrapped by the circuit breaker.
   */
  private async _invokeComputeSpread(request: any): Promise<StainResult> {
    return new Promise((resolve, reject) => {
      // 5 second timeout for physics simulation (Requirement 5.2 target is 100ms)
      const deadline = new Date();
      deadline.setMilliseconds(deadline.getMilliseconds() + 5000);

      try {
        this.client.computeSpread(
          request,
          { deadline },
          (error: grpc.ServiceError | null, response: StainResult) => {
            if (error) {
              const errorMsg =
                error.code === grpc.status.DEADLINE_EXCEEDED
                  ? 'Physics simulation timed out'
                  : `Physics service error: ${error.message}`;

              logger.error(
                `[PhysicsClient] ComputeSpread Error (Code: ${error.code}): ${errorMsg}`
              );

              // Resolve with empty result to prevent crashing the drawing session
              // but allow the caller to know it failed
              return reject(new Error(errorMsg));
            }

            if (!response || !response.stainPolygons) {
              logger.warn(
                '[PhysicsClient] Received empty response from Physics Service'
              );
              return reject(new Error('Empty physics response'));
            }

            resolve(response);
          }
        );
      } catch (fatalErr) {
        logger.error('[PhysicsClient] Fatal crash in gRPC call:', fatalErr);
        reject(fatalErr);
      }
    });
  }
}

/**
 * Singleton instance of the PhysicsClient for use throughout the application.
 */
export const physicsClient = new PhysicsClient();
