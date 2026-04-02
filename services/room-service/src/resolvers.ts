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
import { assignUserColor } from './color-assignment.js';

interface Context {
  db: DatabaseManager;
  req: any;
}

interface CreateRoomInput {
  name?: string;
  capacity?: number;
}

interface JoinRoomInput {
  code: string;
  displayName: string;
}

interface CanvasHistoryInput {
  roomId: string;
  chunks: string[];
  cursor?: string;
  limit?: number;
}

interface CanvasHistoryPage {
  events: StrokeEvent[];
  cursor?: string;
  hasMore: boolean;
}

export const resolvers = {
  Query: {
    async getCanvasHistory(
      _: any,
      { input }: { input: CanvasHistoryInput },
      { db, req }: Context
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
        // Get stroke events for the specified chunks
        const events = await db.getStrokeEventsInChunks(
          input.roomId,
          input.chunks
        );

        // Apply cursor-based pagination if provided
        let filteredEvents = events;
        if (input.cursor) {
          const cursorDate = new Date(input.cursor);
          filteredEvents = events.filter(
            (event: StrokeEvent) => event.createdAt > cursorDate
          );
        }

        // Apply limit and determine if there are more results
        const hasMore = filteredEvents.length > limit;
        const resultEvents = filteredEvents.slice(0, limit);

        // Generate next cursor if there are more results
        const cursor =
          hasMore && resultEvents.length > 0
            ? resultEvents[resultEvents.length - 1].createdAt.toISOString()
            : undefined;

        return {
          events: resultEvents,
          cursor,
          hasMore,
        };
      } catch (error) {
        console.error('Error fetching canvas history:', error);
        throw new Error('Failed to fetch canvas history');
      }
    },

    async getRoomInfo(
      _: any,
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
        // For now, we'll need to query by room ID - we may need to add this method to DatabaseManager
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

    async healthCheck(_: any, __: any, { db }: Context): Promise<boolean> {
      try {
        return await db.healthCheck();
      } catch (error) {
        console.error('Health check failed:', error);
        return false;
      }
    },
  },

  Mutation: {
    async createRoom(
      _: any,
      { input }: { input: CreateRoomInput },
      { db }: Context
    ): Promise<AuthPayload> {
      // Validate input
      const capacity = input.capacity || 10;
      if (capacity < 1 || capacity > 50) {
        throw new Error('Room capacity must be between 1 and 50');
      }

      if (input.name && input.name.length > 255) {
        throw new Error('Room name must be 255 characters or less');
      }

      try {
        // Generate unique room code
        let roomCode: string;
        let attempts = 0;
        const maxAttempts = 10;

        do {
          roomCode = generateRoomCode();
          const existingRoom = await db.findRoomByCode(roomCode);
          if (!existingRoom) break;

          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error('Failed to generate unique room code');
          }
        } while (attempts < maxAttempts);

        // Create room
        const room = await db.createRoom(roomCode, input.name, capacity);

        // Create initial user (room creator)
        const userColor = assignUserColor(room.id);
        const user = await db.addUserToRoom(room.id, 'Room Creator', userColor);

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

    async joinRoom(
      _: any,
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
        // Find room by code
        const room = await db.findRoomByCode(input.code.toUpperCase());
        if (!room) {
          throw new Error('Room not found');
        }

        // Check room capacity
        if (room.participantCount >= room.capacity) {
          throw new Error('Room is at capacity');
        }

        // Get existing users to determine available colors
        const existingUsers = await db.getActiveUsersInRoom(room.id);
        const existingColors = existingUsers.map((u: User) => u.color);

        // Assign color to new user
        const userColor = assignUserColor(room.id, existingColors);

        // Add user to room
        const user = await db.addUserToRoom(
          room.id,
          input.displayName,
          userColor
        );

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

  // Type resolvers for proper date formatting
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
