# Design Document: Coffee & Canvas Collaborative Drawing

## Overview

Coffee & Canvas is a real-time collaborative drawing application that enables multiple users to sketch together on an infinite WebGL-powered canvas. The system's unique feature is the "Coffee Pour" physics simulation - users can trigger realistic fluid dynamics that spread across existing artwork, creating staining effects that warp, discolor, and blend with strokes. The architecture employs a microservices approach with specialized services for canvas operations, room management, and physics calculations, all orchestrated to maintain sub-50ms latency for collaborative interactions.

The system handles real-time synchronization of drawing strokes across multiple clients while providing persistent storage through spatial chunking for infinite canvas scalability. Physics events are computed server-side using Go-based fluid simulation and distributed to all participants via WebSocket broadcasting.

## Architecture

The system follows a microservices architecture with clear separation of concerns between real-time operations, persistent storage, and compute-intensive physics simulations.

```mermaid
graph TB
    subgraph "Client Layer"
        A[Next.js + PixiJS Canvas]
    end
    
    subgraph "Gateway Layer"
        B[Nginx Reverse Proxy]
    end
    
    subgraph "Application Services"
        C[Canvas Service<br/>Socket.IO + Redis]
        D[Room Service<br/>GraphQL + JWT]
        E[Physics Service<br/>Go gRPC Server]
    end
    
    subgraph "Data Layer"
        F[(Redis<br/>Pub/Sub + Cache)]
        G[(PostgreSQL<br/>Persistent Storage)]
    end
    
    A -->|WebSocket + HTTP| B
    B -->|Socket.IO Proxy| C
    B -->|GraphQL Proxy| D
    C <-->|Pub/Sub| F
    C -->|gRPC| E
    D <-->|SQL| G
    C -->|Batch Insert| G
```

## Sequence Diagrams

### Real-time Drawing Flow

```mermaid
sequenceDiagram
    participant Client1
    participant Client2
    participant CanvasSvc
    participant Redis
    participant DB
    
    Client1->>CanvasSvc: stroke_begin {strokeId, tool, color}
    CanvasSvc->>Redis: HSET stroke:active:{roomId}:{strokeId}
    
    loop Drawing segments
        Client1->>CanvasSvc: stroke_segment {strokeId, points[]}
        CanvasSvc->>Redis: HSET append points
        CanvasSvc->>Client2: broadcast stroke_segment
        Client2->>Client2: render optimistically
    end
    
    Client1->>CanvasSvc: stroke_end {strokeId}
    CanvasSvc->>DB: INSERT stroke_events (batch)
    CanvasSvc->>Redis: DEL stroke:active:{roomId}:{strokeId}
    CanvasSvc->>Client2: broadcast stroke_end
```

### Coffee Pour Physics Flow

```mermaid
sequenceDiagram
    participant Client
    participant CanvasSvc
    participant PhysicsSvc
    participant Redis
    participant AllClients
    
    Client->>CanvasSvc: coffee_pour {origin, intensity}
    CanvasSvc->>CanvasSvc: gather nearby strokes
    CanvasSvc->>PhysicsSvc: gRPC ComputeSpread(PourRequest)
    PhysicsSvc->>PhysicsSvc: run fluid simulation
    PhysicsSvc-->>CanvasSvc: StainResult {polygons, mutations}
    CanvasSvc->>Redis: PUBLISH stain_event
    Redis-->>CanvasSvc: fan-out to all instances
    CanvasSvc->>AllClients: broadcast stain_applied
    AllClients->>AllClients: render stain + apply mutations
```

## Components and Interfaces

### Component 1: Canvas Service (Node.js)

**Purpose**: Manages real-time drawing operations, WebSocket connections, and coordinates physics events

**Interface**:
```typescript
interface CanvasService {
  // Socket.IO event handlers
  handleStrokeBegin(payload: StrokeBeginPayload): Promise<void>
  handleStrokeSegment(payload: StrokeSegmentPayload): Promise<void>
  handleStrokeEnd(payload: StrokeEndPayload): Promise<void>
  handleCoffeePour(payload: CoffeePourPayload): Promise<void>
  
  // Internal methods
  authenticateSocket(socket: Socket): Promise<boolean>
  broadcastToRoom(roomId: string, event: string, data: any): void
  persistStroke(strokeData: StrokeData): Promise<void>
}

interface StrokeBeginPayload {
  roomId: string
  userId: string
  strokeId: string
  tool: string
  color: string
  width: number
  timestamp: number
}

interface StrokeSegmentPayload {
  roomId: string
  userId: string
  strokeId: string
  points: Point2D[]
  timestamp: number
}

interface CoffeePourPayload {
  roomId: string
  userId: string
  pourId: string
  origin: Point2D
  intensity: number
  timestamp: number
}
```

**Responsibilities**:
- Authenticate WebSocket connections using JWT tokens
- Manage Socket.IO room subscriptions and broadcasting
- Cache active strokes in Redis with TTL
- Coordinate with Physics Service for coffee pour events
- Batch persist completed strokes to PostgreSQL

### Component 2: Room Service (Node.js)

**Purpose**: Handles room lifecycle, user authentication, and canvas history queries

**Interface**:
```typescript
interface RoomService {
  // GraphQL resolvers
  createRoom(input: CreateRoomInput): Promise<AuthPayload>
  joinRoom(input: JoinRoomInput): Promise<AuthPayload>
  getCanvasHistory(input: CanvasHistoryInput): Promise<CanvasHistoryPage>
  
  // Internal methods
  generateJWT(user: User, room: Room): string
  validateJWT(token: string): Promise<JWTPayload>
  assignUserColor(roomId: string): string
}

interface CreateRoomInput {
  name?: string
  capacity?: number
}

interface JoinRoomInput {
  code: string
  displayName: string
}

interface CanvasHistoryInput {
  roomId: string
  chunks: string[]
  cursor?: string
  limit?: number
}
```

**Responsibilities**:
- Generate unique room codes and manage room metadata
- Issue and validate JWT tokens for room access
- Query stroke history with spatial chunk filtering
- Manage user presence and room capacity limits

### Component 3: Physics Service (Go)

**Purpose**: Computes fluid simulation for coffee pour events

**Interface**:
```go
type CoffeePhysicsServer interface {
    ComputeSpread(ctx context.Context, req *PourRequest) (*StainResult, error)
}

type PourRequest struct {
    RoomId          string
    PourId          string
    Origin          *Point2D
    Intensity       float32
    Viscosity       float32
    NearbyStrokes   []*StrokeSnapshot
    SimulationSteps int32
}

type StainResult struct {
    PourId           string
    StainPolygons    []*StainPolygon
    StrokeMutations  []*StrokeMutation
    ComputationMs    int32
}
```

**Responsibilities**:
- Execute grid-based fluid simulation algorithms
- Calculate stain polygon boundaries using marching squares
- Compute color mutations for affected strokes
- Maintain sub-100ms response times for physics calculations

### Component 4: Frontend Canvas (Next.js + PixiJS)

**Purpose**: Renders infinite canvas and manages user interactions

**Interface**:
```typescript
interface CanvasEngine {
  // Core rendering
  initializeCanvas(container: HTMLElement): void
  renderStroke(stroke: StrokeData): void
  renderStain(stain: StainData): void
  applyStrokeMutation(strokeId: string, mutation: StrokeMutation): void
  
  // Viewport management
  panTo(x: number, y: number): void
  zoomTo(scale: number): void
  getVisibleChunks(): string[]
  
  // User interactions
  startDrawing(point: Point2D): void
  continueDrawing(points: Point2D[]): void
  endDrawing(): void
  triggerCoffeePour(point: Point2D, intensity: number): void
}

interface StrokeData {
  strokeId: string
  userId: string
  tool: string
  color: string
  width: number
  points: Point2D[]
  opacity: number
}
```

**Responsibilities**:
- Manage infinite canvas viewport with pan/zoom
- Render strokes optimistically before server confirmation
- Handle WebSocket events for remote stroke updates
- Replay canvas history on room join
- Manage spatial chunking for efficient rendering

## Data Models

### Model 1: StrokeEvent

```typescript
interface StrokeEvent {
  id: string
  roomId: string
  strokeId: string
  userId: string
  eventType: 'begin' | 'segment' | 'end' | 'stain'
  chunkKey: string
  data: StrokeEventData
  createdAt: Date
}

interface StrokeEventData {
  // For begin events
  tool?: string
  color?: string
  width?: number
  
  // For segment events
  points?: Point2D[]
  
  // For stain events
  stainPolygons?: StainPolygon[]
  strokeMutations?: StrokeMutation[]
}
```

**Validation Rules**:
- strokeId must be unique within room scope
- chunkKey must follow format "{x}:{y}" where x,y are integers
- eventType must be valid enum value
- data must contain appropriate fields for eventType

### Model 2: Room

```typescript
interface Room {
  id: string
  code: string
  name?: string
  capacity: number
  createdAt: Date
  participants: User[]
  strokeCount: number
}

interface User {
  id: string
  displayName: string
  color: string
  joinedAt: Date
  leftAt?: Date
}
```

**Validation Rules**:
- code must be 6-12 characters, alphanumeric
- capacity must be between 1 and 50
- displayName must be 1-50 characters
- color must be valid hex color

### Model 3: Point2D

```typescript
interface Point2D {
  x: number
  y: number
}
```

**Validation Rules**:
- x and y must be finite numbers
- coordinates should be within reasonable canvas bounds (-1e6 to 1e6)

## Algorithmic Pseudocode

### Main Drawing Synchronization Algorithm

```pascal
ALGORITHM synchronizeDrawing(socketEvent)
INPUT: socketEvent of type SocketEvent
OUTPUT: broadcastResult of type BroadcastResult

BEGIN
  ASSERT socketEvent.type IN ['stroke_begin', 'stroke_segment', 'stroke_end']
  ASSERT validateJWT(socketEvent.token) = true
  
  // Step 1: Authenticate and extract user context
  userContext ← extractUserFromJWT(socketEvent.token)
  roomId ← userContext.roomId
  
  // Step 2: Process event based on type
  MATCH socketEvent.type WITH
    CASE 'stroke_begin':
      strokeData ← initializeStroke(socketEvent.data)
      REDIS.HSET("stroke:active:" + roomId + ":" + strokeData.strokeId, strokeData)
      REDIS.EXPIRE("stroke:active:" + roomId + ":" + strokeData.strokeId, 30)
      
    CASE 'stroke_segment':
      existingStroke ← REDIS.HGET("stroke:active:" + roomId + ":" + socketEvent.data.strokeId)
      IF existingStroke = NULL THEN
        RETURN BroadcastResult.Error("Stroke not found")
      END IF
      
      updatedStroke ← appendPoints(existingStroke, socketEvent.data.points)
      REDIS.HSET("stroke:active:" + roomId + ":" + socketEvent.data.strokeId, updatedStroke)
      REDIS.EXPIRE("stroke:active:" + roomId + ":" + socketEvent.data.strokeId, 30)
      
    CASE 'stroke_end':
      finalStroke ← REDIS.HGET("stroke:active:" + roomId + ":" + socketEvent.data.strokeId)
      IF finalStroke = NULL THEN
        RETURN BroadcastResult.Error("Stroke not found")
      END IF
      
      // Persist to database asynchronously
      chunkKeys ← calculateChunkKeys(finalStroke.points)
      FOR each chunkKey IN chunkKeys DO
        DB.INSERT("stroke_events", {
          roomId: roomId,
          strokeId: finalStroke.strokeId,
          eventType: 'end',
          chunkKey: chunkKey,
          data: finalStroke
        })
      END FOR
      
      REDIS.DEL("stroke:active:" + roomId + ":" + socketEvent.data.strokeId)
  END MATCH
  
  // Step 3: Broadcast to room (excluding sender)
  broadcastPayload ← createBroadcastPayload(socketEvent, userContext)
  SOCKET.to(roomId).emit(socketEvent.type, broadcastPayload)
  
  RETURN BroadcastResult.Success()
END
```

**Preconditions**:
- socketEvent contains valid JWT token
- socketEvent.type is one of the supported drawing events
- Redis connection is available and healthy
- Database connection is available for persistence operations

**Postconditions**:
- Event is processed and stored appropriately (Redis for active, DB for completed)
- Event is broadcast to all other room participants
- Error is returned if validation fails
- No data corruption occurs during concurrent operations

**Loop Invariants**:
- For chunk key iteration: All previously processed chunks have been successfully inserted
- Redis TTL is consistently applied to prevent memory leaks
- Broadcast payload maintains data consistency across all recipients

### Coffee Pour Physics Algorithm

```pascal
ALGORITHM computeCoffeeSpread(pourRequest)
INPUT: pourRequest of type PourRequest
OUTPUT: stainResult of type StainResult

BEGIN
  ASSERT pourRequest.origin IS valid Point2D
  ASSERT pourRequest.intensity BETWEEN 0.0 AND 1.0
  ASSERT pourRequest.nearbyStrokes IS valid array
  
  // Step 1: Initialize simulation grid
  gridSize ← calculateGridSize(pourRequest.intensity)
  grid ← createGrid(gridSize, pourRequest.origin)
  
  // Step 2: Mark stroke-occupied cells
  FOR each stroke IN pourRequest.nearbyStrokes DO
    strokeCells ← rasterizeStroke(stroke, grid)
    FOR each cell IN strokeCells DO
      grid[cell.x][cell.y].occupied ← true
      grid[cell.x][cell.y].absorptionRate ← calculateAbsorption(stroke.color, stroke.width)
    END FOR
  END FOR
  
  // Step 3: Run fluid simulation with loop invariant
  fluidCells ← initializeFluidAtOrigin(pourRequest.origin, pourRequest.intensity)
  
  FOR step FROM 1 TO pourRequest.simulationSteps DO
    ASSERT totalFluidVolume(fluidCells) <= initialVolume
    
    newFluidCells ← []
    
    FOR each fluidCell IN fluidCells DO
      // Spread to adjacent cells based on viscosity
      adjacentCells ← getAdjacentCells(fluidCell, grid)
      
      FOR each adjCell IN adjacentCells DO
        IF NOT grid[adjCell.x][adjCell.y].occupied THEN
          spreadAmount ← calculateSpread(fluidCell.volume, pourRequest.viscosity)
          newFluidCells.add({
            x: adjCell.x,
            y: adjCell.y,
            volume: spreadAmount,
            color: interpolateColor(fluidCell.color, COFFEE_COLOR)
          })
        ELSE
          // Absorption by existing stroke
          absorptionAmount ← grid[adjCell.x][adjCell.y].absorptionRate * fluidCell.volume
          fluidCell.volume ← fluidCell.volume - absorptionAmount
          markStrokeForMutation(adjCell, absorptionAmount)
        END IF
      END FOR
    END FOR
    
    fluidCells ← mergeFluidCells(fluidCells, newFluidCells)
  END FOR
  
  // Step 4: Generate stain polygons using marching squares
  stainPolygons ← []
  contours ← marchingSquares(grid, FLUID_THRESHOLD)
  
  FOR each contour IN contours DO
    polygon ← simplifyPolygon(contour)
    stainPolygons.add({
      id: generateStainId(),
      path: polygon.vertices,
      opacity: calculateOpacity(polygon.area),
      color: COFFEE_STAIN_COLOR
    })
  END FOR
  
  // Step 5: Calculate stroke mutations
  strokeMutations ← []
  FOR each mutatedStroke IN getMutatedStrokes() DO
    colorShift ← interpolateTowardsCoffee(mutatedStroke.originalColor, mutatedStroke.absorptionAmount)
    blurFactor ← calculateBlur(mutatedStroke.absorptionAmount)
    
    strokeMutations.add({
      strokeId: mutatedStroke.id,
      colorShift: colorShift,
      blurFactor: blurFactor,
      opacityDelta: -0.1 * mutatedStroke.absorptionAmount
    })
  END FOR
  
  RETURN StainResult {
    pourId: pourRequest.pourId,
    stainPolygons: stainPolygons,
    strokeMutations: strokeMutations,
    computationMs: getElapsedTime()
  }
END
```

**Preconditions**:
- pourRequest contains valid origin coordinates within simulation bounds
- intensity is normalized between 0.0 and 1.0
- nearbyStrokes array contains valid stroke geometry
- simulationSteps is positive integer (typically 60-120)

**Postconditions**:
- Returns valid StainResult with non-empty stainPolygons if fluid spreads
- All strokeMutations reference existing stroke IDs from nearbyStrokes
- Computation completes within target time limit (100ms)
- Fluid volume conservation is maintained throughout simulation

**Loop Invariants**:
- Simulation step loop: Total fluid volume never exceeds initial pour volume
- Fluid cell iteration: All cells maintain valid coordinates within grid bounds
- Contour processing: All generated polygons are valid and non-self-intersecting

### Canvas History Replay Algorithm

```pascal
ALGORITHM replayCanvasHistory(roomId, visibleChunks)
INPUT: roomId of type string, visibleChunks of type string[]
OUTPUT: canvasState of type CanvasState

BEGIN
  ASSERT roomId IS non-empty string
  ASSERT visibleChunks IS valid array of chunk keys
  
  // Step 1: Query stroke events for visible chunks
  strokeEvents ← []
  FOR each chunkKey IN visibleChunks DO
    chunkEvents ← DB.SELECT("stroke_events") 
                    WHERE roomId = roomId 
                    AND chunkKey = chunkKey 
                    ORDER BY createdAt ASC
    strokeEvents.addAll(chunkEvents)
  END FOR
  
  // Step 2: Group events by stroke ID and replay in order
  strokeMap ← new Map<string, StrokeBuilder>()
  stainEvents ← []
  
  FOR each event IN strokeEvents DO
    ASSERT event.eventType IN ['begin', 'segment', 'end', 'stain']
    
    MATCH event.eventType WITH
      CASE 'begin':
        strokeBuilder ← new StrokeBuilder(event.data)
        strokeMap.put(event.strokeId, strokeBuilder)
        
      CASE 'segment':
        IF strokeMap.contains(event.strokeId) THEN
          strokeMap.get(event.strokeId).addSegment(event.data.points)
        END IF
        
      CASE 'end':
        IF strokeMap.contains(event.strokeId) THEN
          finalStroke ← strokeMap.get(event.strokeId).finalize()
          canvasState.addStroke(finalStroke)
          strokeMap.remove(event.strokeId)
        END IF
        
      CASE 'stain':
        stainEvents.add(event)
    END MATCH
  END FOR
  
  // Step 3: Apply stain events in chronological order
  FOR each stainEvent IN stainEvents DO
    FOR each polygon IN stainEvent.data.stainPolygons DO
      canvasState.addStainPolygon(polygon)
    END FOR
    
    FOR each mutation IN stainEvent.data.strokeMutations DO
      existingStroke ← canvasState.getStroke(mutation.strokeId)
      IF existingStroke ≠ NULL THEN
        mutatedStroke ← applyMutation(existingStroke, mutation)
        canvasState.updateStroke(mutation.strokeId, mutatedStroke)
      END IF
    END FOR
  END FOR
  
  RETURN canvasState
END
```

**Preconditions**:
- roomId exists in database and user has access
- visibleChunks contains valid chunk key format "{x}:{y}"
- Database connection is available and responsive
- Canvas state object is properly initialized

**Postconditions**:
- Returns complete canvas state for visible chunks
- All strokes are properly reconstructed from event sequence
- Stain effects are applied in correct chronological order
- No incomplete or corrupted strokes in final state

**Loop Invariants**:
- Chunk processing: All previously processed chunks maintain valid stroke data
- Event replay: Stroke map consistency maintained throughout event processing
- Stain application: Canvas state remains valid after each mutation application

## Key Functions with Formal Specifications

### Function 1: authenticateSocket()

```typescript
function authenticateSocket(socket: Socket): Promise<boolean>
```

**Preconditions:**
- `socket` is a valid Socket.IO socket instance
- `socket.handshake.auth.token` contains JWT string
- JWT secret key is available in environment

**Postconditions:**
- Returns `true` if and only if JWT is valid and not expired
- Socket is assigned `userId` and `roomId` properties if authentication succeeds
- No side effects on socket state if authentication fails
- Logs authentication attempt for security monitoring

**Loop Invariants:** N/A (no loops in function)

### Function 2: calculateChunkKeys()

```typescript
function calculateChunkKeys(points: Point2D[]): string[]
```

**Preconditions:**
- `points` is non-empty array of valid Point2D objects
- All point coordinates are finite numbers
- CHUNK_SIZE constant is defined and positive

**Postconditions:**
- Returns array of unique chunk keys in format "{x}:{y}"
- All chunks that intersect with the stroke path are included
- No duplicate chunk keys in returned array
- Empty array returned only if input points array is empty

**Loop Invariants:**
- For point iteration: All previously processed points contribute valid chunk keys
- Chunk key set maintains uniqueness throughout processing

### Function 3: broadcastToRoom()

```typescript
function broadcastToRoom(roomId: string, event: string, data: any): void
```

**Preconditions:**
- `roomId` is non-empty string representing valid room
- `event` is valid Socket.IO event name
- Socket.IO server is initialized and connected to Redis adapter
- Room exists and has at least one connected client

**Postconditions:**
- Event is broadcast to all clients in specified room
- Broadcast excludes the original sender (if applicable)
- Redis pub/sub handles cross-instance delivery
- No data corruption during serialization/deserialization

**Loop Invariants:** N/A (atomic broadcast operation)

## Example Usage

```typescript
// Example 1: Initialize Canvas Service
const canvasService = new CanvasService({
  redisUrl: 'redis://localhost:6379',
  physicsGrpcAddr: 'localhost:50051',
  databaseUrl: 'postgresql://user:pass@localhost:5432/coffeecanvas'
})

await canvasService.initialize()

// Example 2: Handle drawing event
const strokePayload: StrokeSegmentPayload = {
  roomId: 'room_abc123',
  userId: 'user_xyz789',
  strokeId: 'stroke_001',
  points: [[100.5, 200.3], [101.2, 201.1], [102.0, 202.5]],
  timestamp: Date.now()
}

await canvasService.handleStrokeSegment(strokePayload)

// Example 3: Trigger coffee pour
const pourPayload: CoffeePourPayload = {
  roomId: 'room_abc123',
  userId: 'user_xyz789',
  pourId: 'pour_001',
  origin: { x: 300.0, y: 250.0 },
  intensity: 0.75,
  timestamp: Date.now()
}

await canvasService.handleCoffeePour(pourPayload)

// Example 4: Frontend canvas initialization
const canvasEngine = new CanvasEngine()
canvasEngine.initializeCanvas(document.getElementById('canvas-container'))

// Connect to Socket.IO
const socket = io('/canvas', {
  auth: { token: jwtToken }
})

socket.on('stroke_segment', (data) => {
  canvasEngine.renderStroke(data)
})

socket.on('stain_applied', (data) => {
  data.stainPolygons.forEach(polygon => {
    canvasEngine.renderStain(polygon)
  })
  
  data.strokeMutations.forEach(mutation => {
    canvasEngine.applyStrokeMutation(mutation.strokeId, mutation)
  })
})
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Real-time Broadcast Latency

*For any* drawing stroke initiation or coffee pour event, the system should broadcast the event to all room participants within the specified latency bounds (50ms for strokes, 100ms for physics).

**Validates: Requirements 1.1, 2.1, 5.1, 5.2**

### Property 2: Stroke Independence Under Concurrency

*For any* set of simultaneous drawing strokes from different users, each stroke should maintain its independence without interference from concurrent operations.

**Validates: Requirements 1.4**

### Property 3: Canvas State Round-trip Consistency

*For any* room with existing canvas content, a user joining the room should receive a complete reconstruction of the current canvas state that matches the actual state.

**Validates: Requirements 1.5, 3.5, 6.3**

### Property 4: Physics Volume Conservation

*For any* coffee pour request with initial volume V, the resulting stain polygons and absorbed volume should not exceed the initial pour volume.

**Validates: Requirements 2.2, 2.5**

### Property 5: Stain Data Preservation

*For any* coffee pour effect applied to existing strokes, the original stroke data should be preserved while displaying the mutated appearance.

**Validates: Requirements 2.4, 6.2**

### Property 6: Spatial Chunk Distribution

*For any* drawing stroke that crosses spatial chunk boundaries, the stroke data should be automatically distributed across all appropriate chunks.

**Validates: Requirements 3.2, 3.3**

### Property 7: Authentication Enforcement

*For any* WebSocket connection or drawing operation, the system should require and validate JWT authentication before allowing access.

**Validates: Requirements 4.5, 9.1**

### Property 8: Room Capacity Enforcement

*For any* room at its capacity limit, additional join attempts should be rejected with appropriate error messages.

**Validates: Requirements 4.3**

### Property 9: Stroke Persistence Consistency

*For any* completed drawing stroke, the stroke data should be persisted to permanent storage and confirmed to all participants.

**Validates: Requirements 1.3, 6.1**

### Property 10: Rate Limiting Protection

*For any* user exceeding the defined rate limits for strokes or coffee pours, the system should prevent abuse by rejecting excess requests.

**Validates: Requirements 9.2**

### Property 11: Input Validation and Sanitization

*For any* coordinate data or user-generated content received by the system, input validation and sanitization should be applied to prevent injection attacks.

**Validates: Requirements 9.3, 10.4**

### Property 12: Reconnection and Recovery

*For any* network disconnection or service failure, the system should implement appropriate recovery mechanisms including buffering, retry logic, and graceful degradation.

**Validates: Requirements 5.5, 10.1, 10.3**

## Error Handling

### Error Scenario 1: WebSocket Connection Loss

**Condition**: Client loses network connectivity or server becomes unavailable
**Response**: Client implements exponential backoff reconnection with local stroke buffering
**Recovery**: On reconnection, client replays buffered strokes and requests canvas state sync

### Error Scenario 2: Physics Service Timeout

**Condition**: gRPC call to Physics Service exceeds 100ms timeout
**Response**: Canvas Service returns error to client, logs incident for monitoring
**Recovery**: Client can retry coffee pour after brief delay, system remains functional for drawing

### Error Scenario 3: Database Connection Failure

**Condition**: PostgreSQL becomes unavailable during stroke persistence
**Response**: Strokes remain in Redis cache, error logged, clients continue drawing
**Recovery**: Background process retries persistence when database recovers

### Error Scenario 4: Redis Memory Exhaustion

**Condition**: Redis reaches memory limit with active strokes
**Response**: LRU eviction policy removes oldest inactive strokes, new strokes continue
**Recovery**: Evicted strokes are reconstructed from PostgreSQL on client request

### Error Scenario 5: Invalid JWT Token

**Condition**: Client presents expired or malformed authentication token
**Response**: Socket connection is rejected with authentication error
**Recovery**: Client redirects to room join flow to obtain new valid token

## Testing Strategy

### Unit Testing Approach

Each microservice maintains comprehensive unit test coverage focusing on core business logic isolation. Canvas Service tests mock Redis and gRPC dependencies to verify event handling logic. Room Service tests use in-memory database for GraphQL resolver validation. Physics Service tests use deterministic simulation seeds for reproducible fluid dynamics verification.

**Key Test Categories**:
- Socket.IO event handler validation with mock payloads
- JWT authentication and authorization edge cases
- Spatial chunking algorithm correctness with boundary conditions
- Physics simulation determinism and performance benchmarks

**Coverage Goals**: Minimum 85% line coverage, 95% branch coverage for critical paths

### Property-Based Testing Approach

Property-based testing validates system invariants under randomly generated inputs, particularly effective for spatial algorithms and concurrent operations.

**Property Test Library**: fast-check for TypeScript services, QuickCheck for Go physics service

**Key Properties Tested**:
- Stroke event ordering preservation under concurrent operations
- Spatial chunk key calculation correctness for arbitrary point sequences  
- Physics simulation volume conservation across parameter ranges
- Canvas state reconstruction idempotency from event logs

### Integration Testing Approach

End-to-end integration tests validate complete user workflows across service boundaries using Docker Compose test environment. Tests simulate multiple concurrent users drawing and triggering physics events while verifying real-time synchronization and data persistence.

**Test Scenarios**:
- Multi-user drawing session with stroke conflict resolution
- Coffee pour physics propagation across service boundaries
- Room capacity limits and user presence management
- Canvas history replay accuracy after service restarts

## Performance Considerations

The system targets sub-50ms latency for drawing operations and sub-100ms for physics calculations. Canvas Service uses Redis pub/sub with Socket.IO adapter for horizontal scaling without sticky sessions. Spatial chunking enables infinite canvas scalability by loading only visible regions.

**Optimization Strategies**:
- WebGL rendering with PixiJS for 60fps canvas performance
- Stroke batching and compression for network efficiency
- gRPC connection pooling for Physics Service calls
- PostgreSQL spatial indexing for chunk-based queries
- Redis TTL management for active stroke memory control

**Scaling Targets**:
- 50 concurrent users per room
- 1000 concurrent rooms per Canvas Service instance
- 10ms p95 latency for stroke broadcast
- 80ms p95 latency for physics computation

## Security Considerations

Authentication uses JWT tokens with room-scoped permissions and 24-hour expiration. All WebSocket connections require valid tokens in handshake authentication. Rate limiting prevents abuse of drawing and physics events.

**Security Measures**:
- JWT tokens signed with RS256 algorithm
- Rate limiting: 120 stroke segments/second, 1 coffee pour/3 seconds per user
- Input validation for all coordinate data and user-generated content
- CORS configuration restricting origins to known domains
- Redis AUTH and PostgreSQL connection encryption in production

**Threat Mitigation**:
- DoS protection through connection limits and rate limiting
- Data validation prevents injection attacks in stroke data
- Room isolation ensures users cannot access unauthorized content
- Audit logging for security monitoring and incident response

## Dependencies

**Runtime Dependencies**:
- Node.js 24 LTS for Canvas and Room services
- Go 1.22 for Physics Service
- Redis 7 for pub/sub and caching
- PostgreSQL 16 for persistent storage
- Nginx for reverse proxy and load balancing

**Key Libraries**:
- Socket.IO with Redis adapter for real-time communication
- PixiJS for WebGL canvas rendering
- Apollo Server/Client for GraphQL operations
- gRPC libraries for inter-service communication
- Prisma ORM for database operations
- JWT libraries for authentication

**Development Dependencies**:
- Docker and Docker Compose for local development
- TypeScript for type safety
- Jest/Vitest for testing frameworks
- Protocol Buffers compiler for gRPC code generation
- ESLint and Prettier for code quality