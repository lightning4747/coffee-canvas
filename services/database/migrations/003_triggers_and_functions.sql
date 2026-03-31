-- Migration 003: Triggers and Utility Functions
-- Created: 2024-01-01
-- Description: Creates triggers for maintaining data consistency and room statistics

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
-- UTILITY FUNCTIONS FOR SPATIAL QUERIES
-- ============================================================================

-- Function to get all chunk keys within a bounding box
CREATE OR REPLACE FUNCTION get_chunks_in_bounds(
    min_x NUMERIC, 
    min_y NUMERIC, 
    max_x NUMERIC, 
    max_y NUMERIC, 
    chunk_size INTEGER DEFAULT 1000
)
RETURNS TABLE(chunk_key TEXT) AS $$
DECLARE
    start_chunk_x INTEGER;
    start_chunk_y INTEGER;
    end_chunk_x INTEGER;
    end_chunk_y INTEGER;
    x INTEGER;
    y INTEGER;
BEGIN
    start_chunk_x := FLOOR(min_x / chunk_size);
    start_chunk_y := FLOOR(min_y / chunk_size);
    end_chunk_x := FLOOR(max_x / chunk_size);
    end_chunk_y := FLOOR(max_y / chunk_size);
    
    FOR x IN start_chunk_x..end_chunk_x LOOP
        FOR y IN start_chunk_y..end_chunk_y LOOP
            chunk_key := x::TEXT || ':' || y::TEXT;
            RETURN NEXT;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get stroke events within viewport bounds
CREATE OR REPLACE FUNCTION get_strokes_in_viewport(
    p_room_id UUID,
    min_x NUMERIC,
    min_y NUMERIC,
    max_x NUMERIC,
    max_y NUMERIC,
    chunk_size INTEGER DEFAULT 1000
)
RETURNS TABLE(
    id UUID,
    stroke_id VARCHAR,
    user_id UUID,
    event_type VARCHAR,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT se.id, se.stroke_id, se.user_id, se.event_type, se.data, se.created_at
    FROM stroke_events se
    WHERE se.room_id = p_room_id
    AND se.chunk_key IN (
        SELECT chunk_key FROM get_chunks_in_bounds(min_x, min_y, max_x, max_y, chunk_size)
    )
    ORDER BY se.created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;