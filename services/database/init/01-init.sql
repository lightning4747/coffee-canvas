-- Coffee & Canvas Database Initialization
-- Enable PostGIS extension for spatial operations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create database if it doesn't exist
-- (This is handled by Docker environment variables)

-- Set timezone
SET timezone = 'UTC';