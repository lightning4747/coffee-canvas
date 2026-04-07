/**
 * Database connection and query utilities for the Coffee & Canvas ecosystem.
 * This manager handles connections to PostgreSQL using a connection pool
 * and provides high-level methods for room, user, and event persistence.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Room, StrokeEvent, StrokeEventData, User } from '../types/index.js';

/**
 * Internal interface representing a row in the stroke_events table.
 */
interface StrokeEventRow extends QueryResultRow {
  id: string;
  room_id: string;
  stroke_id: string;
  user_id: string;
  event_type: StrokeEvent['eventType'];
  chunk_key: string;
  data: StrokeEventData;
  created_at: Date;
}

/**
 * Manages all PostgreSQL database interactions.
 */
export class DatabaseManager {
  private pool: Pool;

  /**
   * Initializes the database connection pool.
   * @param connectionString - PostgreSQL connection URI.
   */
  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err: Error) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Executes a single SQL query.
   * @param text - The SQL query string.
   * @param params - Optional parameters for the query.
   * @param client - Optional specific client to use (for transactions).
   * @returns A promise resolving to the query result.
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
    client?: PoolClient
  ): Promise<QueryResult<T>> {
    if (client) {
      return await client.query<T>(text, params);
    }
    const connectClient = await this.pool.connect();
    try {
      return await connectClient.query<T>(text, params);
    } finally {
      connectClient.release();
    }
  }

  /**
   * Wraps a set of operations in a database transaction.
   * @param callback - Function containing the operations to perform within the transaction.
   * @returns The result of the callback function.
   * @throws Will rollback the transaction if the callback fails.
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Gracefully shuts down the connection pool.
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  // ============================================================================
  // ROOM OPERATIONS
  // ============================================================================

  /**
   * Creates a new collaborative drawing room.
   * @param code - Unique short identifier for the room.
   * @param name - Optional descriptive name for the room.
   * @param capacity - Maximum number of participants (default: 10).
   * @param client - Optional transaction client.
   * @returns The created Room object.
   */
  async createRoom(
    code: string,
    name?: string,
    capacity: number = 10,
    client?: PoolClient
  ): Promise<Room> {
    const result = await this.query<{
      id: string;
      code: string;
      name: string | null;
      capacity: number;
      created_at: Date;
    }>(
      `INSERT INTO rooms (code, name, capacity) 
       VALUES ($1, $2, $3) 
       RETURNING id, code, name, capacity, created_at`,
      [code, name, capacity],
      client
    );

    const row = result.rows[0];
    return {
      id: row.id,
      code: row.code,
      name: row.name ?? undefined,
      capacity: row.capacity,
      createdAt: row.created_at,
      participantCount: 0,
    };
  }

  /**
   * Finds a room by its short access code.
   * @param code - The room code to search for.
   * @returns The Room object or null if not found.
   */
  async findRoomByCode(code: string): Promise<Room | null> {
    const result = await this.query<{
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
       WHERE r.code = $1
       GROUP BY r.id`,
      [code]
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
  }

  /**
   * Locks a room for update within a transaction.
   * @param code - The room code.
   * @param client - The transaction client.
   * @returns The Room object or null.
   */
  async getRoomForUpdateByCode(
    code: string,
    client: PoolClient
  ): Promise<Room | null> {
    const result = await client.query<{
      id: string;
      code: string;
      name: string | null;
      capacity: number;
      created_at: Date;
    }>(
      `SELECT id, code, name, capacity, created_at
       FROM rooms 
       WHERE code = $1
       FOR UPDATE`,
      [code]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(id) as count FROM users WHERE room_id = $1 AND is_active = true`,
      [row.id]
    );

    return {
      id: row.id,
      code: row.code,
      name: row.name ?? undefined,
      capacity: row.capacity,
      createdAt: row.created_at,
      participantCount: parseInt(countResult.rows[0].count),
    };
  }

  // ============================================================================
  // USER OPERATIONS
  // ============================================================================

  /**
   * Adds a user to a specific room.
   * @param roomId - The target room UUID.
   * @param displayName - User's chosen name.
   * @param color - User's assigned color.
   * @param client - Optional transaction client.
   * @returns The created User object.
   */
  async addUserToRoom(
    roomId: string,
    displayName: string,
    color: string,
    client?: PoolClient
  ): Promise<User> {
    const result = await this.query<{
      id: string;
      room_id: string;
      display_name: string;
      color: string;
      joined_at: Date | null;
      left_at: Date | null;
    }>(
      `INSERT INTO users (room_id, display_name, color) 
       VALUES ($1, $2, $3) 
       RETURNING id, room_id, display_name, color, joined_at, left_at`,
      [roomId, displayName, color],
      client
    );

    const row = result.rows[0];
    return {
      id: row.id,
      displayName: row.display_name,
      color: row.color,
      joinedAt: row.joined_at ?? new Date(),
      leftAt: row.left_at ?? undefined,
    };
  }

  /**
   * Retrieves all users currently active in a room.
   * @param roomId - Target room UUID.
   * @returns Array of active User objects.
   */
  async getActiveUsersInRoom(
    roomId: string,
    client?: PoolClient
  ): Promise<User[]> {
    const result = await this.query<{
      id: string;
      display_name: string;
      color: string;
      joined_at: Date | null;
      left_at: Date | null;
    }>(
      `SELECT id, display_name, color, joined_at, left_at
       FROM users 
       WHERE room_id = $1 AND is_active = true
       ORDER BY joined_at ASC`,
      [roomId],
      client
    );

    return result.rows.map(
      (row: {
        id: string;
        display_name: string;
        color: string;
        joined_at: Date | null;
        left_at: Date | null;
      }) => ({
        id: row.id,
        displayName: row.display_name,
        color: row.color,
        joinedAt: row.joined_at ?? new Date(),
        leftAt: row.left_at ?? undefined,
      })
    );
  }

  /**
   * Persists a single stroke-related event.
   * @param event - The event data to insert.
   * @returns The saved StrokeEvent with ID and timestamp.
   */
  async insertStrokeEvent(
    event: Omit<StrokeEvent, 'id' | 'createdAt'>
  ): Promise<StrokeEvent> {
    const result = await this.query<{
      id: string;
      room_id: string;
      stroke_id: string;
      user_id: string;
      event_type: StrokeEvent['eventType'];
      chunk_key: string;
      data: StrokeEventData;
      created_at: Date;
    }>(
      `INSERT INTO stroke_events (room_id, stroke_id, user_id, event_type, chunk_key, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, room_id, stroke_id, user_id, event_type, chunk_key, data, created_at`,
      [
        event.roomId,
        event.strokeId,
        event.userId,
        event.eventType,
        event.chunkKey,
        event.data,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      roomId: row.room_id,
      strokeId: row.stroke_id,
      userId: row.user_id,
      eventType: row.event_type,
      chunkKey: row.chunk_key,
      data: row.data,
      createdAt: row.created_at,
    };
  }

  /**
   * Batch insert multiple stroke events in a single operation for high efficiency.
   * @param events - Array of event data.
   * @param client - Optional transaction client.
   */
  async batchInsertStrokeEvents(
    events: Omit<StrokeEvent, 'id' | 'createdAt'>[],
    client?: PoolClient
  ): Promise<void> {
    if (events.length === 0) return;

    // Use a single INSERT statement with multiple value sets
    const valueSets: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const event of events) {
      valueSets.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`
      );
      params.push(
        event.roomId,
        event.strokeId,
        event.userId,
        event.eventType,
        event.chunkKey,
        event.data
      );
      paramIndex += 6;
    }

    const queryText = `
      INSERT INTO stroke_events (room_id, stroke_id, user_id, event_type, chunk_key, data)
      VALUES ${valueSets.join(', ')}
    `;

    await this.query(queryText, params, client);
  }

  /**
   * Maps a database row to a StrokeEvent object.
   */
  private mapStrokeRow(row: StrokeEventRow): StrokeEvent {
    return {
      id: row.id,
      roomId: row.room_id,
      strokeId: row.stroke_id,
      userId: row.user_id,
      eventType: row.event_type,
      chunkKey: row.chunk_key,
      data: row.data as StrokeEventData,
      createdAt: row.created_at,
    };
  }

  /**
   * Retrieves stroke events for specific spatial chunks.
   * @param roomId - Target room UUID.
   * @param chunkKeys - Array of chunk identifiers (e.g. ["0:0"]).
   * @returns Array of stroke events found in those chunks.
   */
  async getStrokeEventsInChunks(
    roomId: string,
    chunkKeys: string[]
  ): Promise<StrokeEvent[]> {
    if (chunkKeys.length === 0) return [];
    const placeholders = chunkKeys.map((_, i) => `$${i + 2}`).join(', ');

    const result = await this.query<StrokeEventRow>(
      `SELECT id, room_id, stroke_id, user_id, event_type, chunk_key, data, created_at
       FROM stroke_events
       WHERE room_id = $1 AND chunk_key IN (${placeholders})
       ORDER BY created_at ASC`,
      [roomId, ...chunkKeys]
    );

    return result.rows.map(this.mapStrokeRow);
  }

  /**
   * Retrieves stroke events with pagination support using a cursor.
   * @param roomId - Target room UUID.
   * @param chunkKeys - Target spatial chunks.
   * @param cursor - Last seen timestamp for continuation.
   * @param limit - Maximum number of results.
   */
  async getStrokeEventsInChunksWithPagination(
    roomId: string,
    chunkKeys: string[],
    cursor?: Date,
    limit: number = 100
  ): Promise<{ events: StrokeEvent[]; hasMore: boolean }> {
    if (chunkKeys.length === 0) return { events: [], hasMore: false };

    const chunkPlaceholders = chunkKeys.map((_, i) => `$${i + 2}`).join(', ');
    let query = `
      SELECT id, room_id, stroke_id, user_id, event_type, chunk_key, data, created_at
      FROM stroke_events
      WHERE room_id = $1 AND chunk_key IN (${chunkPlaceholders})
    `;

    const params: unknown[] = [roomId, ...chunkKeys];

    if (cursor) {
      query += ` AND created_at > $${params.length + 1}`;
      params.push(cursor);
    }

    // Query for limit + 1 to check if there are more results
    query += ` ORDER BY created_at ASC LIMIT $${params.length + 1}`;
    params.push(limit + 1);

    const result = await this.query<StrokeEventRow>(query, params);

    const hasMore = result.rows.length > limit;
    const events = result.rows.slice(0, limit).map(this.mapStrokeRow);

    return { events, hasMore };
  }

  /**
   * Retrieves all strokes currently visible in a specific viewport.
   * Leverages the `get_strokes_in_viewport` database function.
   * @param roomId - Target room.
   * @param minX - Left boundary.
   * @param minY - Top boundary.
   * @param maxX - Right boundary.
   * @param maxY - Bottom boundary.
   */
  async getStrokeEventsInViewport(
    roomId: string,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): Promise<StrokeEvent[]> {
    const result = await this.query<StrokeEventRow>(
      `SELECT id, stroke_id, user_id, event_type, data, created_at, room_id, chunk_key 
       FROM get_strokes_in_viewport($1, $2, $3, $4, $5)`,
      [roomId, minX, minY, maxX, maxY]
    );

    return result.rows.map(this.mapStrokeRow);
  }

  /**
   * Checks if the database connection is alive.
   * @returns true if healthy, false otherwise.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves high-level application usage statistics.
   */
  async getStats(): Promise<{
    totalRooms: number;
    activeUsers: number;
    totalStrokes: number;
  }> {
    const result = await this.query<{
      total_rooms: string;
      active_users: string;
      total_strokes: string;
    }>(`
      SELECT 
        (SELECT COUNT(*) FROM rooms) as total_rooms,
        (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
        (SELECT COUNT(*) FROM stroke_events WHERE event_type = 'end') as total_strokes
    `);

    const row = result.rows[0];
    return {
      totalRooms: parseInt(row.total_rooms),
      activeUsers: parseInt(row.active_users),
      totalStrokes: parseInt(row.total_strokes),
    };
  }
}
