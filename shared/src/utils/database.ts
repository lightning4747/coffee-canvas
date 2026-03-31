// Database connection and query utilities for Coffee & Canvas

import { Pool, PoolClient, QueryResult } from 'pg';
import { Room, StrokeEvent, User } from '../types/index.js';

export class DatabaseManager {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Execute a query with parameters
   */
  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
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
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  // ============================================================================
  // ROOM OPERATIONS
  // ============================================================================

  /**
   * Create a new room
   */
  async createRoom(code: string, name?: string, capacity: number = 10): Promise<Room> {
    const result = await this.query<Room>(
      `INSERT INTO rooms (code, name, capacity) 
       VALUES ($1, $2, $3) 
       RETURNING id, code, name, capacity, created_at, stroke_count`,
      [code, name, capacity]
    );
    
    return {
      ...result.rows[0],
      participantCount: 0, // New room has no participants
    };
  }

  /**
   * Find room by code
   */
  async findRoomByCode(code: string): Promise<Room | null> {
    const result = await this.query<Room & { participant_count: number }>(
      `SELECT r.*, 
              COUNT(u.id) FILTER (WHERE u.is_active = true) as participant_count
       FROM rooms r
       LEFT JOIN users u ON r.id = u.room_id AND u.is_active = true
       WHERE r.code = $1
       GROUP BY r.id`,
      [code]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      capacity: row.capacity,
      createdAt: row.created_at,
      participantCount: parseInt(row.participant_count.toString()),
    };
  }

  /**
   * Get room by ID with participant count
   */
  async getRoomById(roomId: string): Promise<Room | null> {
    const result = await this.query<Room & { participant_count: number }>(
      `SELECT r.*, 
              COUNT(u.id) FILTER (WHERE u.is_active = true) as participant_count
       FROM rooms r
       LEFT JOIN users u ON r.id = u.room_id AND u.is_active = true
       WHERE r.id = $1
       GROUP BY r.id`,
      [roomId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      capacity: row.capacity,
      createdAt: row.created_at,
      participantCount: parseInt(row.participant_count.toString()),
    };
  }

  // ============================================================================
  // USER OPERATIONS
  // ============================================================================

  /**
   * Add user to room
   */
  async addUserToRoom(roomId: string, displayName: string, color: string): Promise<User> {
    const result = await this.query<User>(
      `INSERT INTO users (room_id, display_name, color) 
       VALUES ($1, $2, $3) 
       RETURNING id, room_id, display_name, color, joined_at, left_at`,
      [roomId, displayName, color]
    );

    return result.rows[0];
  }

  /**
   * Mark user as inactive (left room)
   */
  async removeUserFromRoom(userId: string): Promise<void> {
    await this.query(
      `UPDATE users 
       SET is_active = false, left_at = NOW() 
       WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Get active users in room
   */
  async getActiveUsersInRoom(roomId: string): Promise<User[]> {
    const result = await this.query<User>(
      `SELECT id, room_id, display_name, color, joined_at, left_at
       FROM users 
       WHERE room_id = $1 AND is_active = true
       ORDER BY joined_at ASC`,
      [roomId]
    );

    return result.rows;
  }

  // ============================================================================
  // STROKE EVENT OPERATIONS
  // ============================================================================

  /**
   * Insert stroke event with automatic chunk key calculation
   */
  async insertStrokeEvent(event: Omit<StrokeEvent, 'id' | 'createdAt'>): Promise<StrokeEvent> {
    const result = await this.query<StrokeEvent>(
      `INSERT INTO stroke_events (room_id, stroke_id, user_id, event_type, chunk_key, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, room_id, stroke_id, user_id, event_type, chunk_key, data, created_at`,
      [event.roomId, event.strokeId, event.userId, event.eventType, event.chunkKey, event.data]
    );

    return result.rows[0];
  }

  /**
   * Batch insert multiple stroke events
   */
  async batchInsertStrokeEvents(events: Omit<StrokeEvent, 'id' | 'createdAt'>[]): Promise<void> {
    if (events.length === 0) return;

    const values = events.map((_, index) => {
      const base = index * 6;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    }).join(', ');

    const params = events.flatMap(event => [
      event.roomId,
      event.strokeId,
      event.userId,
      event.eventType,
      event.chunkKey,
      event.data
    ]);

    await this.query(
      `INSERT INTO stroke_events (room_id, stroke_id, user_id, event_type, chunk_key, data)
       VALUES ${values}`,
      params
    );
  }

  /**
   * Get stroke events for specific chunks (viewport query)
   */
  async getStrokeEventsInChunks(roomId: string, chunkKeys: string[]): Promise<StrokeEvent[]> {
    if (chunkKeys.length === 0) return [];

    const placeholders = chunkKeys.map((_, index) => `$${index + 2}`).join(', ');
    
    const result = await this.query<StrokeEvent>(
      `SELECT id, room_id, stroke_id, user_id, event_type, chunk_key, data, created_at
       FROM stroke_events
       WHERE room_id = $1 AND chunk_key IN (${placeholders})
       ORDER BY created_at ASC`,
      [roomId, ...chunkKeys]
    );

    return result.rows;
  }

  /**
   * Get stroke events within viewport bounds using PostGIS
   */
  async getStrokeEventsInViewport(
    roomId: string,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): Promise<StrokeEvent[]> {
    const result = await this.query<StrokeEvent>(
      `SELECT * FROM get_strokes_in_viewport($1, $2, $3, $4, $5)`,
      [roomId, minX, minY, maxX, maxY]
    );

    return result.rows;
  }

  /**
   * Get complete stroke history for a room (paginated)
   */
  async getStrokeHistory(
    roomId: string,
    limit: number = 1000,
    offset: number = 0
  ): Promise<StrokeEvent[]> {
    const result = await this.query<StrokeEvent>(
      `SELECT id, room_id, stroke_id, user_id, event_type, chunk_key, data, created_at
       FROM stroke_events
       WHERE room_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [roomId, limit, offset]
    );

    return result.rows;
  }

  // ============================================================================
  // UTILITY OPERATIONS
  // ============================================================================

  /**
   * Health check - verify database connection
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
   * Get database statistics
   */
  async getStats(): Promise<{
    totalRooms: number;
    activeRooms: number;
    totalUsers: number;
    activeUsers: number;
    totalStrokes: number;
  }> {
    const result = await this.query(`
      SELECT 
        (SELECT COUNT(*) FROM rooms) as total_rooms,
        (SELECT COUNT(*) FROM rooms WHERE created_at > NOW() - INTERVAL '24 hours') as active_rooms,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
        (SELECT COUNT(*) FROM stroke_events WHERE event_type = 'end') as total_strokes
    `);

    const row = result.rows[0];
    return {
      totalRooms: parseInt(row.total_rooms),
      activeRooms: parseInt(row.active_rooms),
      totalUsers: parseInt(row.total_users),
      activeUsers: parseInt(row.active_users),
      totalStrokes: parseInt(row.total_strokes),
    };
  }
}