-- Coffee & Canvas Database Initialization
-- Enable PostGIS extension for spatial operations
CREATE EXTENSION IF NOT EXISTS postgis;
-- Enable pgcrypto for gen_random_uuid() on PostgreSQL < 13
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create database if it doesn't exist
-- (This is handled by Docker environment variables)

-- Set timezone
SET timezone = 'UTC';

-- ============================================================================
-- ROOMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(12) UNIQUE NOT NULL,
    name VARCHAR(255),
    capacity INTEGER NOT NULL DEFAULT 10 CHECK (capacity BETWEEN 1 AND 50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    stroke_count INTEGER DEFAULT 0
);

-- Index for room code lookups
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    display_name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL, -- Hex color format #RRGGBB
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Indexes for user queries
CREATE INDEX IF NOT EXISTS idx_users_room_id ON users(room_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(room_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- STROKE_EVENTS TABLE WITH SPATIAL CHUNKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS stroke_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    stroke_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('begin', 'segment', 'end', 'stain')),
    chunk_key VARCHAR(50) NOT NULL, -- Format: "x:y" for spatial chunking
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Spatial geometry for PostGIS indexing (derived from data.points)
    geometry GEOMETRY(MULTIPOINT, 4326)
    -- Note: no uniqueness constraint on (room_id, stroke_id, event_type, chunk_key)
    -- because multiple segment events per stroke within the same chunk are expected.
);

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

-- ============================================================================
-- ROOM STATISTICS UPDATE FUNCTION
-- ============================================================================

-- Function to update room stroke count
CREATE OR REPLACE FUNCTION update_room_stroke_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.event_type = 'end' THEN
        UPDATE rooms 
        SET stroke_count = stroke_count + 1,
            updated_at = NOW()
        WHERE id = NEW.room_id;
    ELSIF TG_OP = 'DELETE' AND OLD.event_type = 'end' THEN
        UPDATE rooms 
        SET stroke_count = GREATEST(stroke_count - 1, 0),
            updated_at = NOW()
        WHERE id = OLD.room_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain room stroke count
CREATE TRIGGER trigger_update_room_stroke_count
    AFTER INSERT OR DELETE ON stroke_events
    FOR EACH ROW
    EXECUTE FUNCTION update_room_stroke_count();

-- ============================================================================
-- SEED DATA FOR DEVELOPMENT
-- ============================================================================

-- Insert sample room for development
INSERT INTO rooms (code, name, capacity) 
VALUES ('DEV001', 'Development Room', 10)
ON CONFLICT (code) DO NOTHING;

-- Insert sample user for development
INSERT INTO users (room_id, display_name, color)
SELECT r.id, 'Dev User', '#FF5733'
FROM rooms r 
WHERE r.code = 'DEV001'
ON CONFLICT DO NOTHING;