# Canvas History Replay Implementation

## Overview

This document describes the implementation of Task 3.3: Canvas History Replay functionality for the Coffee & Canvas collaborative drawing application.

## Features Implemented

### 1. Efficient Chunk-Based History Queries with Pagination

- **CanvasHistoryManager**: New class that handles canvas history operations
- **Chunk-based querying**: Queries only the spatial chunks relevant to the current viewport
- **Cursor-based pagination**: Efficient pagination using timestamps to avoid offset-based performance issues
- **Configurable limits**: Request limits clamped between 1-500 events for performance

### 2. Stroke Event Reconstruction from Database

- **Event grouping**: Groups stroke events by strokeId to reconstruct complete strokes
- **Chronological ordering**: Maintains proper event sequence for accurate reconstruction
- **Incomplete stroke handling**: Gracefully handles missing begin events with warnings
- **Point aggregation**: Combines segment points into complete stroke paths

### 3. Canvas State Serialization and Compression

- **Point compression**: Rounds coordinates to 2 decimal places to reduce payload size
- **Data filtering**: Removes unnecessary fields based on event type
- **Stain compression**: Compresses polygon paths and mutation data
- **Network optimization**: Reduces bandwidth usage for large canvas states

## Architecture

### Core Components

1. **CanvasHistoryManager** (`canvas-history.ts`)
   - Main service class for canvas history operations
   - Handles database interactions and data processing
   - Provides compression and serialization utilities

2. **Enhanced GraphQL Resolver** (`resolvers.ts`)
   - Updated `getCanvasHistory` resolver to use CanvasHistoryManager
   - Maintains authentication and authorization
   - Returns compressed and paginated results

3. **Database Enhancements** (`shared/src/utils/database.ts`)
   - New `getStrokeEventsInChunksWithPagination` method
   - Optimized queries with proper parameterization
   - Built-in pagination support

### Data Flow

```
Client Request → GraphQL Resolver → CanvasHistoryManager → Database
                                        ↓
Client Response ← Compressed Events ← Reconstructed Canvas State
```

## API Usage

### GraphQL Query

```graphql
query GetCanvasHistory($input: CanvasHistoryInput!) {
  getCanvasHistory(input: $input) {
    events {
      id
      strokeId
      eventType
      data {
        tool
        color
        width
        points {
          x
          y
        }
        stainPolygons {
          id
          path {
            x
            y
          }
          opacity
          color
        }
        strokeMutations {
          strokeId
          colorShift
          blurFactor
          opacityDelta
        }
      }
      createdAt
    }
    cursor
    hasMore
  }
}
```

### Input Parameters

```typescript
interface CanvasHistoryInput {
  roomId: string; // Room identifier
  chunks: string[]; // Array of chunk keys (e.g., ["0:0", "1:0"])
  cursor?: string; // Optional pagination cursor (ISO timestamp)
  limit?: number; // Optional limit (1-500, default 100)
}
```

## Performance Optimizations

### 1. Spatial Chunking

- Only queries chunks visible in the current viewport
- Reduces database load for large canvases
- Enables infinite canvas scalability

### 2. Cursor-Based Pagination

- Uses timestamps instead of OFFSET for better performance
- Consistent results even with concurrent modifications
- Efficient for large datasets

### 3. Data Compression

- Reduces coordinate precision to 2 decimal places
- Filters event data based on type
- Compresses stain polygon data

### 4. Database Query Optimization

- Parameterized queries prevent SQL injection
- Proper indexing on (room_id, chunk_key, created_at)
- Limit + 1 pattern for efficient hasMore detection

## Error Handling

### Input Validation

- Chunk key format validation (`/^-?\d+:-?\d+$/`)
- Limit clamping (1-500 range)
- Room access authorization

### Graceful Degradation

- Handles incomplete stroke sequences
- Logs warnings for missing begin events
- Returns an empty result only for empty `chunkKeys` lists. Invalid chunk keys are rejected during `CanvasHistoryManager.getCanvasHistory` validation and produce errors, ensuring clients don't treat validation failures as successful empty pages.

### Database Error Recovery

- Catches and logs database errors
- Returns user-friendly error messages
- Maintains service availability

## Testing

### Unit Tests (`canvas-history.test.ts`)

- ✅ Chunk key validation
- ✅ Empty input handling
- ✅ Limit clamping
- ✅ Stroke reconstruction
- ✅ Compression algorithms
- ✅ Serialization

### Coverage Areas

- Input validation and sanitization
- Stroke event reconstruction logic
- Data compression and serialization
- Error handling and edge cases

## Integration Points

### Requirements Satisfied

- **Requirement 1.5**: Canvas history replay for joining users
- **Requirement 3.3**: Chunk-based viewport queries
- **Requirement 6.3**: State restoration after disconnection

### Microservices Integration

- **Room Service**: Provides GraphQL API for canvas history
- **Canvas Service**: Will consume history for user synchronization
- **Database**: Spatial chunk storage and retrieval

## Future Enhancements

### Potential Optimizations

1. **Caching Layer**: Redis cache for frequently accessed chunks
2. **Compression Algorithms**: More advanced compression (gzip, brotli)
3. **Incremental Updates**: Delta-based synchronization
4. **Background Processing**: Async stroke reconstruction

### Monitoring and Metrics

1. **Query Performance**: Track chunk query response times
2. **Compression Ratios**: Monitor data size reduction
3. **Cache Hit Rates**: Measure caching effectiveness
4. **Error Rates**: Track validation and database errors

## Configuration

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `CHUNK_SIZE`: Spatial chunk size (default: 1000 pixels)

### Performance Tuning

- Adjust pagination limits based on client capabilities
- Configure database connection pooling
- Optimize spatial indexing strategies

## Security Considerations

### Authentication & Authorization

- JWT token validation for all requests
- Room-scoped access control
- Input sanitization and validation

### Data Protection

- Parameterized queries prevent SQL injection
- Rate limiting on GraphQL endpoints
- Audit logging for security events

---

This implementation provides a robust, scalable foundation for canvas history replay that meets all specified requirements while maintaining high performance and reliability.
