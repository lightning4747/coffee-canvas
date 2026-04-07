/**
 * GraphQL Resolvers for the Room Service.
 * This module handles room creation, user joining, and canvas history retrieval.
 * It integrates with the DatabaseManager and CanvasHistoryManager to provide
 * a unified API for the frontend and other services.
 */

import {
  AuthPayload,
  JWTPayload,
  Room,
  StrokeEvent,
  User,
} from '../../../shared/src/types/index.js';
import { DatabaseManager } from '../../../shared/src/utils/database.js';
import { generateRoomCode } from '../../../shared/src/utils/index.js';
import { extractJWTFromRequest, generateJWT, validateJWT } from './auth.js';
import { CanvasHistoryManager } from './canvas-history.js';
import { assignUserColor } from './color-assignment.js';

/**
 * Context object passed to every resolver.
 */
interface Context {
  /** Manager for PostgreSQL interactions. */
  db: DatabaseManager;
  /** Manager for reconstructing canvas history. */
  canvasHistoryManager: CanvasHistoryManager;
  /** The incoming Express request object. */
  req: {
    headers: Record<string, string | string[] | undefined>;
  };
}

/**
 * Input arguments for the createRoom mutation.
 */
interface CreateRoomInput {
  /** Optional human-readable name for the room. */
  name?: string;
  /** Maximum number of allowed participants. */
  capacity?: number;
}

/**
 * Input arguments for the joinRoom mutation.
 */
interface JoinRoomInput {
  /** The 6-character room access code. */
  code: string;
  /** The user's chosen display name. */
  displayName: string;
}

/**
 * Input arguments for the getCanvasHistory query.
 */
interface CanvasHistoryInput {
  /** Target room UUID. */
  roomId: string;
  /** Spatial chunks to retrieve (e.g. ["0:0"]). */
  chunks: string[];
  /** Optional pagination cursor. */
  cursor?: string;
  /** Maximum number of events to return. */
  limit?: number;
}

/**
 * A paginated page of stroke events.
 */
interface CanvasHistoryPage {
  /** The list of events in this page. */
  events: StrokeEvent[];
  /** Cursor for the next page. */
  cursor?: string;
  /** True if more results are available. */
  hasMore: boolean;
}

/**
 * The core GraphQL resolver map.
 */
export const resolvers = {
  Query: {
    /**
     * Retrieves the drawing history for a specific room and set of spatial chunks.
     * Requires a valid JWT for the target room.
     */
    async getCanvasHistory(
      _: unknown,
      { input }: { input: CanvasHistoryInput },
      { canvasHistoryManager, req }: Context
    ): Promise<CanvasHistoryPage> {
      // Authenticate request
      const token = extractJWTFromRequest(req);
      if (!token) {
        throw new Error('Authentication required');
      }

      let jwtPayload: JWTPayload;
      try {
        jwtPayload = await validateJWT(token);
      } catch (error) {
        throw new Error('Invalid authentication token');
      }

      // Verify user has access to this room
      if (jwtPayload.roomId !== input.roomId) {
        throw new Error('Access denied to this room');
      }

      // Validate input
      if (!input.chunks || input.chunks.length === 0) {
        return { events: [], hasMore: false };
      }

      const limit = Math.min(input.limit || 100, 500); // Cap at 500 events

      try {
        // Use the canvas history manager for efficient retrieval and reconstruction
        const result = await canvasHistoryManager.getCanvasHistory(
          input.roomId,
          input.chunks,
          input.cursor,
          limit
        );

        // Compress events for efficient network transfer
        const compressedEvents = canvasHistoryManager.compressCanvasState(
          result.events
        );

        return {
          events: compressedEvents,
          cursor: result.cursor,
          hasMore: result.hasMore,
        };
      } catch (error) {
        console.error('Error fetching canvas history:', error);
        throw new Error('Failed to fetch canvas history');
      }
    },

    /**
     * Retrieves metadata for a specific room.
     * Used for initial room state loading in the UI.
     */
    async getRoomInfo(
      _: unknown,
      { roomId }: { roomId: string },
      { db, req }: Context
    ): Promise<Room | null> {
      // Authenticate request
      const token = extractJWTFromRequest(req);
      if (!token) {
        throw new Error('Authentication required');
      }

      let jwtPayload: JWTPayload;
      try {
        jwtPayload = await validateJWT(token);
      } catch (error) {
        throw new Error('Invalid authentication token');
      }

      // Verify user has access to this room
      if (jwtPayload.roomId !== roomId) {
        throw new Error('Access denied to this room');
      }

      try {
        const result = await db.query<{
          id: string;
          code: string;
          name: string | null;
          capacity: number;
          created_at: Date;
          participant_count: string;
        }>(
          `SELECT r.id, r.code, r.name, r.capacity, r.created_at,
                  COUNT(u.id) FILTER (WHERE u.is_active = true) as participant_count
           FROM rooms r
           LEFT JOIN users u ON r.id = u.room_id AND u.is_active = true
           WHERE r.id = $1
           GROUP BY r.id`,
          [roomId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
          id: row.id,
          code: row.code,
          name: row.name ?? undefined,
          capacity: row.capacity,
          createdAt: row.created_at,
          participantCount: parseInt(row.participant_count),
        };
      } catch (error) {
        console.error('Error fetching room info:', error);
        throw new Error('Failed to fetch room information');
      }
    },

    /**
     * Simple health check to verify database connectivity.
     */
    async healthCheck(
      _: unknown,
      __: unknown,
      { db }: Context
    ): Promise<boolean> {
      try {
        return await db.healthCheck();
      } catch (error) {
        console.error('Health check failed:', error);
        return false;
      }
    },
  },

  Mutation: {
    /**
     * Creates a new collaborative drawing room and returns an auth token for the creator.
     * Automatically assigns a unique room code and a starting color for the creator.
     */
    async createRoom(
      _: unknown,
      { input }: { input: CreateRoomInput },
      { db }: Context
    ): Promise<AuthPayload> {
      // Validate input
      const capacity = input.capacity ?? 10;
      if (capacity < 1 || capacity > 50) {
        throw new Error('Room capacity must be between 1 and 50');
      }

      if (input.name && input.name.length > 255) {
        throw new Error('Room name must be 255 characters or less');
      }

      try {
        const maxAttempts = 10;
        let room: Room | undefined;
        let user: User | undefined;

        for (let attempts = 0; attempts < maxAttempts; attempts++) {
          try {
            const roomCode = generateRoomCode();

            // Execute in a single transaction
            const result = await db.transaction(async client => {
              const r = await db.createRoom(
                roomCode,
                input.name,
                capacity,
                client
              );
              const userColor = assignUserColor(r.id);
              const u = await db.addUserToRoom(
                r.id,
                'Room Creator',
                userColor,
                client
              );
              return { r, u };
            });

            room = result.r;
            user = result.u;
            break; // Success
          } catch (err: unknown) {
            const error = err as Error & { code?: string };
            // Check for Postgres unique violation (23505)
            if (error.code === '23505') {
              if (attempts === maxAttempts - 1) {
                throw new Error('Failed to generate unique room code');
              }
              continue; // Retry
            }
            throw error; // Other error, rethrow
          }
        }

        if (!room || !user) {
          throw new Error('Failed to generate unique room code');
        }

        // Generate JWT token
        const token = generateJWT(user, room);

        return {
          token,
          user,
          room: {
            ...room,
            participantCount: 1, // Room creator is the first participant
          },
        };
      } catch (error) {
        console.error('Error creating room:', error);
        throw new Error('Failed to create room');
      }
    },

    /**
     * Authenticates a user into an existing room using an access code.
     * Assigns a unique color and returns a JWT for subsequent service calls.
     */
    async joinRoom(
      _: unknown,
      { input }: { input: JoinRoomInput },
      { db }: Context
    ): Promise<AuthPayload> {
      // Validate input
      if (!input.code || input.code.length < 4 || input.code.length > 12) {
        throw new Error('Invalid room code');
      }

      if (
        !input.displayName ||
        input.displayName.length < 1 ||
        input.displayName.length > 50
      ) {
        throw new Error('Display name must be between 1 and 50 characters');
      }

      try {
        const { room, user } = await db.transaction(async client => {
          // Find room by code with row lock
          const r = await db.getRoomForUpdateByCode(
            input.code.toUpperCase(),
            client
          );
          if (!r) {
            throw new Error('Room not found');
          }

          // Check room capacity
          if (r.participantCount >= r.capacity) {
            throw new Error('Room is at capacity');
          }

          // Get existing users to determine available colors
          const existingUsers = await db.getActiveUsersInRoom(r.id, client);
          const existingColors = existingUsers.map((u: User) => u.color);

          // Assign color to new user
          const userColor = assignUserColor(r.id, existingColors);

          // Add user to room
          const u = await db.addUserToRoom(
            r.id,
            input.displayName,
            userColor,
            client
          );

          return { room: r, user: u };
        });

        // Generate JWT token
        const token = generateJWT(user, room);

        return {
          token,
          user,
          room: {
            ...room,
            participantCount: room.participantCount + 1,
          },
        };
      } catch (error) {
        console.error('Error joining room:', error);
        if (error instanceof Error) {
          throw error; // Re-throw known errors
        }
        throw new Error('Failed to join room');
      }
    },
  },

  // Type resolvers for proper date and structural formatting
  User: {
    joinedAt: (user: User) => user.joinedAt.toISOString(),
    leftAt: (user: User) => user.leftAt?.toISOString(),
  },

  Room: {
    createdAt: (room: Room) => room.createdAt.toISOString(),
  },

  StrokeEvent: {
    createdAt: (event: StrokeEvent) => event.createdAt.toISOString(),
  },
};
