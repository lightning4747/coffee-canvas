// Database connection and query utilities for Coffee & Canvas

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Room, StrokeEvent, StrokeEventData, User } from '../types/index.js';

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

export class DatabaseManager {
  private pool: Pool;

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
   * Execute a query with parameters.
   * T is constrained to QueryResultRow to satisfy the pg library types.
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

  async close(): Promise<void> {
    await this.pool.end();
  }

  // ============================================================================
  // ROOM OPERATIONS
  // ============================================================================

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

  // ============================================================================
  // STROKE EVENT OPERATIONS
  // ============================================================================

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

    const params: any[] = [roomId, ...chunkKeys];

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

  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

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
