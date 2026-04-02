-- Migration 002: Spatial Indexes and Functions
-- Created: 2024-01-01
-- Description: Creates spatial indexes and helper functions for efficient chunk queries

-- ============================================================================
-- BASIC INDEXES
-- ============================================================================

-- Index for room code lookups
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);

-- Indexes for user queries
CREATE INDEX IF NOT EXISTS idx_users_room_id ON users(room_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(room_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- SPATIAL INDEXING FOR EFFICIENT CHUNK QUERIES
-- ============================================================================

-- Primary spatial index using PostGIS GIST
CREATE INDEX IF NOT EXISTS idx_stroke_events_geometry 
ON stroke_events USING GIST(geometry);

-- Chunk-based index for efficient spatial queries
CREATE INDEX IF NOT EXISTS idx_stroke_events_chunk_key 
ON stroke_events(room_id, chunk_key, created_at);

-- Room and stroke-based indexes
CREATE INDEX IF NOT EXISTS idx_stroke_events_room_stroke 
ON stroke_events(room_id, stroke_id, created_at);

-- Event type index for filtering
CREATE INDEX IF NOT EXISTS idx_stroke_events_type 
ON stroke_events(room_id, event_type, created_at);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_stroke_events_room_chunk_type 
ON stroke_events(room_id, chunk_key, event_type, created_at);

-- ============================================================================
-- FUNCTIONS FOR SPATIAL CHUNK CALCULATION
-- ============================================================================

-- Function to calculate chunk key from coordinates
CREATE OR REPLACE FUNCTION calculate_chunk_key(x NUMERIC, y NUMERIC, chunk_size INTEGER DEFAULT 1000)
RETURNS TEXT AS $$
BEGIN
    RETURN FLOOR(x / chunk_size)::TEXT || ':' || FLOOR(y / chunk_size)::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update geometry from JSONB points data
CREATE OR REPLACE FUNCTION update_stroke_geometry()
RETURNS TRIGGER AS $$
DECLARE
    points_array JSONB;
    point_geom GEOMETRY[];
    i INTEGER;
BEGIN
    -- Extract points from data field
    points_array := NEW.data->'points';
    
    IF points_array IS NOT NULL AND jsonb_array_length(points_array) > 0 THEN
        -- Convert JSONB points to PostGIS geometry array
        FOR i IN 0..jsonb_array_length(points_array) - 1 LOOP
            point_geom := array_append(
                point_geom,
                ST_SetSRID(
                    ST_MakePoint(
                        (points_array->i->>'x')::NUMERIC,
                        (points_array->i->>'y')::NUMERIC
                    ),
                    4326
                )
            );
        END LOOP;
        
        -- Create MULTIPOINT geometry from points array
        NEW.geometry := ST_Collect(point_geom);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update geometry when stroke events are inserted/updated
CREATE TRIGGER trigger_update_stroke_geometry
    BEFORE INSERT OR UPDATE ON stroke_events
    FOR EACH ROW
    EXECUTE FUNCTION update_stroke_geometry();