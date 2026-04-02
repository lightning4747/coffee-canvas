# Redis Data Structures and TTL Policies

## Overview

Coffee & Canvas uses Redis for real-time caching and pub/sub messaging with carefully designed data structures and TTL policies to ensure optimal performance and memory management.

## Data Structure Design

### 1. Active Stroke Caching

**Key Pattern**: `stroke:active:{roomId}:{strokeId}`
**Data Type**: Hash
**TTL**: 30 seconds
**Purpose**: Cache in-progress strokes for real-time collaboration

```redis
HSET stroke:active:room123:stroke456
  "strokeId" "stroke456"
  "userId" "user789"
  "tool" "brush"
  "color" "#FF5733"
  "width" "5"
  "points" "[{\"x\":100,\"y\":200},{\"x\":101,\"y\":201}]"
  "timestamp" "1640995200000"

EXPIRE stroke:active:room123:stroke456 30
```

### 2. Room Presence Tracking

**Key Pattern**: `room:presence:{roomId}`
**Data Type**: Hash
**TTL**: 60 seconds (refreshed on activity)
**Purpose**: Track active users in each room

```redis
HSET room:presence:room123
  "user789" "{\"displayName\":\"Alice\",\"color\":\"#FF5733\",\"lastSeen\":1640995200000}"
  "user456" "{\"displayName\":\"Bob\",\"color\":\"#33FF57\",\"lastSeen\":1640995180000}"

EXPIRE room:presence:room123 60
```

### 3. Real-time Event Broadcasting

**Channel Pattern**: `room:{roomId}:events`
**Data Type**: Pub/Sub Channel
**Purpose**: Broadcast drawing events to all room participants

```redis
PUBLISH room:room123:events "{\"type\":\"stroke_segment\",\"strokeId\":\"stroke456\",\"points\":[{\"x\":102,\"y\":202}]}"
```

### 4. Coffee Pour Event Coordination

**Key Pattern**: `pour:active:{roomId}:{pourId}`
**Data Type**: Hash
**TTL**: 10 seconds
**Purpose**: Coordinate physics simulation results

```redis
HSET pour:active:room123:pour789
  "pourId" "pour789"
  "userId" "user456"
  "origin" "{\"x\":300,\"y\":250}"
  "intensity" "0.75"
  "status" "computing"

EXPIRE pour:active:room123:pour789 10
```

### 5. Rate Limiting

**Key Pattern**: `rate:{userId}:{action}`
**Data Type**: String (counter)
**TTL**: 1 second for strokes, 3 seconds for coffee pours
**Purpose**: Prevent abuse and maintain performance

```redis
# Stroke rate limiting (120 per second)
INCR rate:user789:stroke
EXPIRE rate:user789:stroke 1

# Coffee pour rate limiting (1 per 3 seconds)
SET rate:user456:pour 1 EX 3
```

## TTL Policy Implementation

### Automatic Cleanup Strategy

1. **Active Strokes**: 30-second TTL ensures memory cleanup for abandoned strokes
2. **User Presence**: 60-second TTL with heartbeat refresh prevents stale presence data
3. **Pour Events**: 10-second TTL for quick cleanup of physics coordination data
4. **Rate Limiting**: Short TTLs (1-3 seconds) for sliding window rate limiting

### Memory Management

- **LRU Eviction**: Configured to evict least recently used keys when memory limit reached
- **Keyspace Notifications**: Monitor TTL expiration events for cleanup logging
- **Memory Monitoring**: Track memory usage patterns for optimization

## Redis Commands Reference

### Common Operations

```bash
# Check active strokes in a room
KEYS stroke:active:room123:*

# Get room presence
HGETALL room:presence:room123

# Monitor real-time events
SUBSCRIBE room:room123:events

# Check rate limiting status
GET rate:user789:stroke
TTL rate:user789:stroke

# Memory usage monitoring
INFO memory
MEMORY USAGE stroke:active:room123:stroke456
```

### Cleanup Operations

```bash
# Manual cleanup of expired strokes
EVAL "return redis.call('del', unpack(redis.call('keys', 'stroke:active:*')))" 0

# Check TTL status
TTL stroke:active:room123:stroke456

# Force expire for testing
EXPIRE stroke:active:room123:stroke456 1
```

## Performance Considerations

- **Connection Pooling**: Use Redis connection pools in application services
- **Pipeline Operations**: Batch Redis commands for better performance
- **Pub/Sub Scaling**: Use Redis Cluster or Sentinel for high availability
- **Memory Optimization**: Monitor key sizes and optimize data serialization

## Monitoring and Alerting

- **Memory Usage**: Alert when memory usage exceeds 80%
- **Connection Count**: Monitor active connections and connection pool health
- **TTL Effectiveness**: Track key expiration patterns and cleanup efficiency
- **Pub/Sub Performance**: Monitor message delivery latency and subscriber count
