import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { StainResult, Point2D, StrokeData } from '@coffee-canvas/shared';

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

const physicsProto = grpc.loadPackageDefinition(packageDefinition)
  .physics as any;

/**
 * Service client for interacting with the Physics Service via gRPC
 */
export class PhysicsClient {
  private client: any;

  constructor() {
    this.client = new physicsProto.CoffeePhysics(
      PHYSICS_SERVICE_URL,
      grpc.credentials.createInsecure()
    );
  }

  /**
   * Computes the spread of a coffee pour simulation
   * @param roomId Target room ID
   * @param pourId Unique identifier for this pour event
   * @param origin Starting point of the pour
   * @param intensity Radius/strength of the pour
   * @param strokes Nearby strokes to consider for absorption
   * @returns Promise resolving to the simulation results
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
      viscosity: 0.5, // Default viscosity
      simulation_steps: 15, // Default simulation steps
      nearby_strokes: strokes.map(s => ({
        stroke_id: s.strokeId,
        color: s.color,
        width: s.width,
        points: s.points,
        opacity: s.opacity || 1.0,
      })),
    };

    return new Promise((resolve, reject) => {
      // 5 second timeout for physics simulation (Requirement 5.2 target is 100ms)
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);

      this.client.computeSpread(
        request,
        { deadline },
        (error: grpc.ServiceError | null, response: StainResult) => {
          if (error) {
            console.error(
              '[PhysicsClient] ComputeSpread Error:',
              error.message
            );
            return reject(error);
          }
          resolve(response);
        }
      );
    });
  }
}

// Singleton instance
export const physicsClient = new PhysicsClient();
