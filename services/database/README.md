# Coffee & Canvas Database Setup

This directory contains the database schema, migrations, and configuration for the Coffee & Canvas collaborative drawing application.

## Overview

The database uses PostgreSQL with PostGIS extension for spatial operations and Redis for real-time caching and pub/sub messaging.

### Key Features

- **Spatial Chunking**: Infinite canvas support through spatial chunk indexing
- **Real-time Caching**: Redis-based active stroke caching with TTL policies
- **Event Sourcing**: Complete stroke history through event-based storage
- **Performance Optimization**: Spatial indexes and efficient chunk queries
- **Scalability**: Designed for horizontal scaling and high concurrency

## Database Schema

### Core Tables

1. **rooms** - Drawing room metadata and capacity management
2. **users** - User presence and authentication within rooms
3. **stroke_events** - Event-sourced stroke data with spatial chunking

### Spatial Features

- PostGIS geometry columns for efficient spatial queries
- Automatic chunk key calculation for infinite canvas
- Spatial indexes using GIST for fast viewport queries
- Utility functions for chunk-based operations

## Quick Start

### 1. Start Services

```bash
# Start PostgreSQL and Redis with Docker Compose
docker-compose up -d postgres redis

# Wait for services to be healthy
docker-compose ps
```

### 2. Run Migrations

```bash
# Run all migrations in order
./services/database/run-migrations.sh

# Or manually with psql
PGPASSWORD=postgres psql -h localhost -U postgres -d coffeecanvas -f services/database/init/01-init.sql
```

### 3. Test Schema

```bash
# Run schema tests
./services/database/test-database.sh

# Or manually
PGPASSWORD=postgres psql -h localhost -U postgres -d coffeecanvas -f services/database/test-schema.sql
```

## Migration System

Migrations are located in `migrations/` directory and run in alphabetical order:

- `001_initial_schema.sql` - Core tables (rooms, users, stroke_events)
- `002_spatial_indexes.sql` - Spatial indexes and functions
- `003_triggers_and_functions.sql` - Triggers and utility functions
- `004_seed_data.sql` - Development seed data

### Running Migrations

```bash
# Run migration script
./run-migrations.sh

# Check migration status
PGPASSWORD=postgres psql -h localhost -U postgres -d coffeecanvas -c "SELECT * FROM schema_migrations ORDER BY applied_at;"
```

## Redis Configuration

Redis is configured for optimal real-time performance:

### Data Structures

- **Active Strokes**: `stroke:active:{roomId}:{strokeId}` (Hash, 30s TTL)
- **Room Presence**: `room:presence:{roomId}` (Hash, 60s TTL)
- **Pour Events**: `pour:active:{roomId}:{pourId}` (Hash, 10s TTL)
- **Rate Limiting**: `rate:{userId}:{action}` (String, 1-3s TTL)

### Pub/Sub Channels

- **Room Events**: `room:{roomId}:events`

### Memory Management

- LRU eviction policy for automatic cleanup
- Keyspace notifications for TTL monitoring
- Connection pooling for performance

## Spatial Chunking

The system uses spatial chunking to enable infinite canvas scalability:

### Chunk System

- **Chunk Size**: 1000x1000 pixels (configurable)
- **Chunk Key Format**: `"x:y"` (e.g., "0:0", "1:-1")
- **Automatic Distribution**: Strokes automatically distributed across chunks

### Spatial Queries

```sql
-- Get strokes in viewport
SELECT * FROM get_strokes_in_viewport(room_id, min_x, min_y, max_x, max_y);

-- Calculate chunk key
SELECT calculate_chunk_key(x, y, chunk_size);

-- Get chunks in bounds
SELECT chunk_key FROM get_chunks_in_bounds(min_x, min_y, max_x, max_y);
```

## Performance Considerations

### Database Optimization

- **Connection Pooling**: 20 max connections per service
- **Spatial Indexes**: GIST indexes on geometry columns
- **Composite Indexes**: Optimized for common query patterns
- **Batch Operations**: Bulk insert for stroke events

### Redis Optimization

- **Memory Limit**: 512MB with LRU eviction
- **TTL Policies**: Automatic cleanup of stale data
- **Connection Pooling**: Separate clients for pub/sub
- **Pipeline Operations**: Batched Redis commands

## Monitoring and Maintenance

### Health Checks

```bash
# Database health
PGPASSWORD=postgres psql -h localhost -U postgres -d coffeecanvas -c "SELECT 1;"

# Redis health
redis-cli ping
```

### Statistics

```sql
-- Room statistics
SELECT 
    COUNT(*) as total_rooms,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as recent_rooms
FROM rooms;

-- Stroke statistics
SELECT 
    COUNT(*) as total_events,
    COUNT(DISTINCT stroke_id) as unique_strokes,
    COUNT(DISTINCT chunk_key) as unique_chunks
FROM stroke_events;

-- User activity
SELECT 
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE is_active = true) as active_users
FROM users;
```

### Cleanup Operations

```sql
-- Remove old inactive users (older than 7 days)
DELETE FROM users 
WHERE is_active = false 
AND left_at < NOW() - INTERVAL '7 days';

-- Archive old stroke events (older than 30 days)
-- (Implement based on retention policy)
```

## Development

### Local Setup

1. Ensure Docker and Docker Compose are installed
2. Copy `.env.example` to `.env` and configure
3. Start services: `docker-compose up -d postgres redis`
4. Run migrations: `./services/database/run-migrations.sh`
5. Test schema: `./services/database/test-database.sh`

### Adding Migrations

1. Create new migration file: `migrations/XXX_description.sql`
2. Use sequential numbering (001, 002, etc.)
3. Include rollback instructions in comments
4. Test migration on development database
5. Run migration script to apply

### Testing

```bash
# Run all tests
./test-database.sh

# Test specific functionality
PGPASSWORD=postgres psql -h localhost -U postgres -d coffeecanvas -c "
SELECT calculate_chunk_key(100, 200);
SELECT * FROM get_chunks_in_bounds(0, 0, 2000, 2000);
"
```

## Troubleshooting

### Common Issues

1. **PostGIS Extension Missing**
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

2. **Connection Refused**
   - Check if PostgreSQL is running
   - Verify connection parameters
   - Check firewall settings

3. **Redis Memory Issues**
   - Monitor memory usage: `redis-cli info memory`
   - Adjust maxmemory in redis.conf
   - Check TTL policies

4. **Slow Spatial Queries**
   - Verify GIST indexes exist
   - Check query plans: `EXPLAIN ANALYZE`
   - Consider chunk size optimization

### Logs

```bash
# PostgreSQL logs
docker-compose logs postgres

# Redis logs
docker-compose logs redis

# Application logs
docker-compose logs canvas-service room-service
```

## Security

### Production Considerations

- Enable Redis AUTH with strong password
- Use SSL/TLS for PostgreSQL connections
- Implement connection limits and rate limiting
- Regular security updates for database images
- Backup and disaster recovery procedures

### Access Control

- Separate database users for each service
- Minimal required permissions per service
- Network isolation between services
- Audit logging for sensitive operations