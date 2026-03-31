-- Migration 004: Seed Data for Development
-- Created: 2024-01-01
-- Description: Inserts sample data for development and testing

-- ============================================================================
-- DEVELOPMENT SEED DATA
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

-- Insert additional test rooms
INSERT INTO rooms (code, name, capacity) VALUES
    ('TEST01', 'Test Room Alpha', 5),
    ('TEST02', 'Test Room Beta', 15),
    ('DEMO01', 'Demo Room', 25)
ON CONFLICT (code) DO NOTHING;