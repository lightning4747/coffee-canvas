-- Migration 001: Initial Coffee & Canvas Schema
-- Created: 2024-01-01
-- Description: Creates core tables for rooms, users, and stroke_events with spatial indexing

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
    geometry GEOMETRY(MULTIPOINT, 4326),
    
    -- Composite constraint to prevent duplicate stroke events
    UNIQUE(room_id, stroke_id, event_type, chunk_key)
);