# Coffee & Canvas — System Architecture Plan

> Real-time collaborative infinite sketchpad with interactive physics events.

---

## 1. Project Overview & Core Features

### What It Is

A browser-based multiplayer drawing application where multiple users share an infinite canvas in real time. Users sketch freely, and any participant can trigger a "Coffee Pour" physics event — a fluid simulation that realistically spreads across and stains existing strokes, warping, discoloring, and blending with the artwork.

### Core Features

**Collaborative Drawing**

- Infinite pan/zoom canvas rendered via WebGL (PixiJS or raw WebGL)
- Multi-user cursor presence with user identity labels
- Stroke broadcasting at <50ms perceived latency via Socket.IO
- Optimistic local rendering with server reconciliation

**Coffee Pour Physics**

- User clicks a canvas point to initiate a "pour"
- Physics Service computes fluid spread using particle-based or grid-based simulation
- Spread interacts with stroke density and color — darker strokes absorb more, empty areas spread freely
- Result is a set of stain overlay vectors pushed back to all clients

**Room & Session Management**

- Create/join rooms via short codes
- Persistent canvas history — reconnecting users receive full vector replay
- Room capacity limits, cursor count, and metadata managed by Room Service

**Persistence & Replay**

- All strokes stored as compressed vector paths (not raster)
- Full canvas state reconstructible from event log
- Chunked spatial indexing for efficient infinite canvas queries

---

## 2. System Architecture Diagram

```mermaid
graph LR
    subgraph ClientLayer ["Client (Browser)"]
        A["Next.js App<br/>(React + WebGL Canvas)"]
    end

    subgraph GatewayLayer ["Gateway / Proxy"]
        B["Nginx / Traefik"]
    end

    subgraph CanvasLayer ["Canvas Service (Node.js)"]
        C["Socket.IO Server<br/>(socket.io)"]
        D["Redis Pub/Sub<br/>Stroke Fan-out"]
    end

    subgraph RoomLayer ["Room Service (Node.js)"]
        E["GraphQL Server<br/>(Apollo / Yoga)"]
        F["Session Store"]
    end

    subgraph PhysicsLayer ["Physics Service (Go)"]
        G["gRPC Server<br/>Fluid Simulation"]
    end

    subgraph DataLayer ["Databases"]
        H[("Redis<br/>Active Strokes<br/>+ Pub/Sub")]
        I[("PostgreSQL<br/>Rooms + Vector<br/>History")]
    end

    A -- "Socket.IO draw events" --> B
    A -- "GraphQL HTTP/2" --> B
    B -- "Socket.IO proxy" --> C
    B -- "HTTP proxy" --> E
    C <--> D
    D <--> H
    C -- "gRPC CoffeePhysics RPC" --> G
    G -- "returns StainResult" --> C
    E <--> F
    E <--> I
    C -- "persist strokes batch write" --> I
```

**Data Flow — Coffee Pour Event**

```mermaid
sequenceDiagram
  participant Client
  participant CanvasSvc
  participant PhysicsSvc
  participant Redis
  participant DB as PostgreSQL

  Client->>CanvasSvc: socket.emit: coffee_pour { x, y, intensity, roomId }
  CanvasSvc->>PhysicsSvc: gRPC: ComputeSpread(PourRequest)
  PhysicsSvc-->>CanvasSvc: gRPC: StainResult { polygons[], affected_stroke_ids[] }
  CanvasSvc->>Redis: PUBLISH room:{id} stain_event payload
  Redis-->>CanvasSvc: fan-out to all subscribers
  CanvasSvc-->>Client: socket.to(room).emit: stain_applied { polygons[], mutations[] }
  CanvasSvc->>DB: INSERT stain event into stroke_events
```

---

## 3. Microservices Breakdown

### 3.1 Frontend — `client`

| Concern         | Detail                                                         |
| --------------- | -------------------------------------------------------------- |
| Framework       | Next.js 14 (App Router), TypeScript                            |
| Rendering       | PixiJS (WebGL) for canvas; React for UI chrome                 |
| WS Client       | `socket.io-client` with auto-reconnect and exponential backoff |
| GQL Client      | Apollo Client with normalized cache                            |
| State           | Zustand for canvas state; Apollo cache for room data           |
| Infinite Canvas | Viewport transform matrix; spatial chunking for render culling |

**Responsibilities:**

- Maintain local stroke buffer; render optimistically before server ACK
- Subscribe to room Socket.IO namespace; apply remote stroke/stain deltas
- On join: fetch full stroke history via GraphQL, replay into canvas
- Serialize pointer events → stroke segments → `socket.emit()` calls

---

### 3.2 Canvas Service — `canvas-service`

| Concern     | Detail                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------- |
| Runtime     | Node.js 24, TypeScript                                                                   |
| WS Library  | `socket.io` with Redis Adapter (`@socket.io/redis-adapter`) for multi-instance fan-out   |
| Redis       | `ioredis` for stroke cache; `@socket.io/redis-adapter` for cross-instance room broadcast |
| gRPC Client | `@grpc/grpc-js` calling Physics Service                                                  |
| DB          | Batch-insert stroke events to PostgreSQL via `pg`                                        |

**Responsibilities:**

- Authenticate Socket.IO connections via JWT in handshake auth (`socket.handshake.auth.token`)
- Accept `stroke_segment`, `stroke_end`, `coffee_pour` events
- Cache active (in-progress) strokes in Redis with TTL
- On `stroke_end`: persist finalized stroke to PostgreSQL async
- On `coffee_pour`: call Physics Service via gRPC **synchronously**, broadcast result
- Handle room fan-out via `@socket.io/redis-adapter` so multiple Canvas Service replicas share Socket.IO rooms natively

---

### 3.3 Room Service — `room-service`

| Concern | Detail                                            |
| ------- | ------------------------------------------------- |
| Runtime | Node.js 24, TypeScript                            |
| API     | GraphQL via Pothos schema builder + Apollo Server |
| Auth    | JWT issuance + validation                         |
| DB      | PostgreSQL via Prisma ORM                         |

**Responsibilities:**

- `createRoom` / `joinRoom` mutations — return JWT scoped to room
- Query full stroke history for a room (paginated, spatial-filtered)
- Manage user presence metadata (display name, color, cursor position)
- Enforce room capacity
- Expose `roomUpdated` subscription for metadata changes (participant list, room settings)

---

### 3.4 Physics Service — `physics-service`

| Concern   | Detail                                                                  |
| --------- | ----------------------------------------------------------------------- |
| Runtime   | Go 1.22                                                                 |
| Protocol  | gRPC server (generated from `.proto`)                                   |
| Algorithm | Grid-based fluid simulation (cellular automaton) or SPH particle spread |

**Responsibilities:**

- Receive `PourRequest`: pour origin, intensity, existing stroke geometry snapshot
- Run fluid spread simulation (configurable steps, viscosity, absorption coefficients)
- Return `StainResult`: list of stain polygons + list of stroke IDs with mutation vectors (color shift, blur factor)
- Stateless — every RPC call is independent; no in-memory session state
- Optimized for <100ms p99 response time for typical room density

---

### 3.5 Infrastructure Containers

| Container   | Role                                                                        |
| ----------- | --------------------------------------------------------------------------- |
| `nginx`     | Reverse proxy; routes `/api/graphql` → room-service, `/ws` → canvas-service |
| `redis`     | Pub/sub bus + active stroke cache                                           |
| `postgres`  | Persistent store for rooms, users, stroke history                           |
| `proto-gen` | One-shot init container that runs `protoc` to generate gRPC stubs           |

---

## 4. API & Communication Contracts

### 4.1 Socket.IO Events (Canvas Service)

All events carry a typed payload. The Socket.IO event name replaces the `type` field in the old WS envelope. Room scoping is handled by Socket.IO rooms — the client joins a room on connect, so `roomId` is implicit server-side but included in payloads for client-side routing convenience.

```ts
interface SocketPayload<T> {
  roomId: string;
  userId: string;
  ts: number; // Unix ms
  data: T;
}
```

**Client → Server**

```ts
// Begin a new stroke
socket.emit('stroke_begin', {
  roomId: 'abc123',
  userId: 'u_01',
  ts: 1710000000000,
  data: { strokeId: 's_99', tool: 'pen', color: '#2c1a0e', width: 3 },
});

// Stream segments (high frequency, ~60fps)
socket.emit('stroke_segment', {
  roomId: 'abc123',
  userId: 'u_01',
  ts: 1710000000016,
  data: {
    strokeId: 's_99',
    points: [
      [120.5, 88.2],
      [122.1, 89.0],
      [124.3, 90.5],
    ],
  },
});

// Finalize stroke
socket.emit('stroke_end', {
  roomId: 'abc123',
  userId: 'u_01',
  ts: 1710000000500,
  data: { strokeId: 's_99' },
});

// Trigger coffee pour
socket.emit('coffee_pour', {
  roomId: 'abc123',
  userId: 'u_01',
  ts: 1710000001000,
  data: { pourId: 'p_07', origin: [300.0, 250.0], intensity: 0.75 },
});
```

**Server → Client**

```ts
// Broadcast remote stroke segment to room (excluding sender)
socket.to(roomId).emit('stroke_segment', {
  roomId: 'abc123',
  userId: 'u_02',
  ts: 1710000000020,
  data: {
    strokeId: 's_44',
    points: [
      [200.0, 150.0],
      [201.5, 151.2],
    ],
  },
});

// Broadcast stain result to entire room (including sender)
io.to(roomId).emit('stain_applied', {
  roomId: 'abc123',
  userId: 'u_01',
  ts: 1710000001080,
  data: {
    pourId: 'p_07',
    stainPolygons: [
      {
        id: 'sp_1',
        path: [
          [295, 245],
          [310, 248],
          [315, 260],
          [300, 265],
          [290, 258],
        ],
        opacity: 0.6,
        color: '#3b1f0a',
      },
    ],
    strokeMutations: [
      { strokeId: 's_10', colorShift: '#4a2c12', blurFactor: 0.3 },
      { strokeId: 's_14', colorShift: '#3d2010', blurFactor: 0.15 },
    ],
  },
});

// Error emitted to sender only
socket.emit('error', {
  data: { code: 'ROOM_FULL', message: 'Room has reached maximum capacity.' },
});
```

---

### 4.2 GraphQL Schema (Room Service)

```graphql
scalar DateTime
scalar JSON

type User {
  id: ID!
  displayName: String!
  color: String! # Hex color assigned to this user's cursors/strokes
  joinedAt: DateTime!
}

type Room {
  id: ID!
  code: String! # Short join code e.g. "BREW-42"
  name: String
  createdAt: DateTime!
  capacity: Int!
  participants: [User!]!
  strokeCount: Int!
}

type StrokeEvent {
  id: ID!
  strokeId: String!
  userId: String!
  type: StrokeEventType! # BEGIN | SEGMENT | END | STAIN
  data: JSON! # Raw serialized path / stain data
  chunk: String! # Spatial chunk key e.g. "0:0", "-1:2"
  createdAt: DateTime!
}

enum StrokeEventType {
  BEGIN
  SEGMENT
  END
  STAIN
}

type AuthPayload {
  token: String!
  user: User!
  room: Room!
}

type Query {
  room(code: String!): Room
  canvasHistory(
    roomId: ID!
    chunks: [String!] # Fetch only visible spatial chunks
    cursor: String # Pagination cursor
    limit: Int
  ): CanvasHistoryPage!
}

type CanvasHistoryPage {
  events: [StrokeEvent!]!
  nextCursor: String
  hasMore: Boolean!
}

type Mutation {
  createRoom(name: String, capacity: Int): AuthPayload!
  joinRoom(code: String!, displayName: String!): AuthPayload!
  leaveRoom(roomId: ID!): Boolean!
}

type Subscription {
  roomUpdated(roomId: ID!): Room!
  participantChanged(roomId: ID!): User!
}
```

---

### 4.3 gRPC Proto Definition (Physics Service)

```protobuf
syntax = "proto3";

package coffeecanvas.physics.v1;

option go_package = "github.com/coffeecanvas/physics-service/gen/physics/v1";

// ─── Shared Types ────────────────────────────────────────────────────────────

message Point2D {
  float x = 1;
  float y = 2;
}

message StrokeSnapshot {
  string stroke_id      = 1;
  repeated Point2D path = 2;  // Sampled points of the stroke
  string color          = 3;  // Hex color
  float  width          = 4;
  float  opacity        = 5;
}

// ─── CoffeePhysics Service ───────────────────────────────────────────────────

service CoffeePhysics {
  // Synchronous RPC: Canvas Service calls this on every coffee_pour event.
  rpc ComputeSpread(PourRequest) returns (StainResult);
}

message PourRequest {
  string  room_id          = 1;
  string  pour_id          = 2;
  Point2D origin           = 3;
  float   intensity        = 4;  // 0.0 – 1.0; controls volume and spread radius
  float   viscosity        = 5;  // 0.0 – 1.0; lower = faster spread
  repeated StrokeSnapshot nearby_strokes = 6;  // Strokes within bounding radius
  int32   simulation_steps = 7;  // Number of physics ticks to run (default: 60)
}

message StainPolygon {
  string         id      = 1;
  repeated Point2D path  = 2;  // Convex or concave polygon vertices
  float          opacity = 3;
  string         color   = 4;  // Derived coffee stain color
}

message StrokeMutation {
  string stroke_id    = 1;
  string color_shift  = 2;  // New hex color after stain absorption
  float  blur_factor  = 3;  // 0.0 = no blur, 1.0 = fully smeared
  float  opacity_delta = 4; // Change in stroke opacity (usually negative)
}

message StainResult {
  string  pour_id                        = 1;
  repeated StainPolygon stain_polygons   = 2;
  repeated StrokeMutation stroke_mutations = 3;
  int32   computation_ms                 = 4;  // Server-side perf metric
}
```

---

## 5. Database Schema Strategy

### 5.1 PostgreSQL — Persistent Store

**Infinite Canvas Vector Storage Strategy**

The canvas is infinite, so a naïve single table of strokes becomes unqueryable at scale. Solution: **spatial chunking**.

- The canvas is divided into a grid of fixed-size logical chunks (e.g., 1024×1024 canvas units per chunk).
- Every stroke event is tagged with the chunk key(s) it intersects.
- On reconnect/scroll, the client requests only the chunks in its viewport.

```sql
-- Rooms
CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(12) UNIQUE NOT NULL,
  name        VARCHAR(100),
  capacity    INT NOT NULL DEFAULT 20,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (ephemeral per session, not persistent accounts)
CREATE TABLE room_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  display_name VARCHAR(50) NOT NULL,
  color        VARCHAR(7) NOT NULL,  -- Hex
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at      TIMESTAMPTZ
);

-- Core stroke event log (append-only)
CREATE TABLE stroke_events (
  id         BIGSERIAL PRIMARY KEY,
  room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  stroke_id  VARCHAR(40) NOT NULL,
  user_id    UUID NOT NULL,
  event_type VARCHAR(10) NOT NULL,  -- begin | segment | end | stain
  chunk_key  VARCHAR(20) NOT NULL,  -- e.g. "0:0", "-1:2", "3:-1"
  data       JSONB NOT NULL,        -- stroke path, color, width, stain polygons
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for viewport chunk queries
CREATE INDEX idx_stroke_events_room_chunk ON stroke_events(room_id, chunk_key);
-- Index for per-stroke replay
CREATE INDEX idx_stroke_events_stroke_id ON stroke_events(room_id, stroke_id);
-- Partial index for active (non-ended) strokes
CREATE INDEX idx_active_strokes ON stroke_events(room_id)
  WHERE event_type IN ('begin', 'segment');
```

**Chunk Key Calculation:**

```ts
const CHUNK_SIZE = 1024;
function chunkKey(x: number, y: number): string {
  return `${Math.floor(x / CHUNK_SIZE)}:${Math.floor(y / CHUNK_SIZE)}`;
}
```

Strokes that span multiple chunks are written once per intersecting chunk (duplicated reference, not data — `data` column holds only the segment subset within that chunk, or a reference to the primary stroke_id).

**Archival / Compression:**

- Rows older than 30 days in completed rooms: `data` JSONB is compressed via `pg_lz` (automatic for TOAST).
- Optional: batch-export cold rooms to S3 as Flatbuffers binary + store only a manifest row in PostgreSQL.

---

### 5.2 Redis — Active Stroke Cache & Pub/Sub

```
# Active stroke buffer (TTL 30s, refreshed on each segment)
Key:   stroke:active:{roomId}:{strokeId}
Type:  Hash
Fields: userId, color, width, points (JSON array, appended each segment)
TTL:   30s

# Room membership set
Key:   room:users:{roomId}
Type:  Set
Value: {userId}
TTL:   None (managed explicitly on join/leave)

# Pub/Sub channels (managed by @socket.io/redis-adapter — do not write to manually)
Channel: socket.io#/{namespace}/#{roomId}#
Message: Socket.IO binary-encoded event frame
```

Canvas Service instances are connected via `@socket.io/redis-adapter`. When a server calls `io.to(roomId).emit(...)`, the adapter publishes the event to Redis and all other Canvas Service instances re-emit it to their locally connected sockets in that room — enabling horizontal scaling without sticky sessions and without any manual `PUBLISH`/`SUBSCRIBE` logic.

---

## 6. Step-by-Step Implementation Roadmap

### Phase 0 — Scaffold & Infrastructure (Week 1)

- [ ] Initialize monorepo (`pnpm` workspaces): `apps/client`, `services/canvas`, `services/room`, `services/physics`
- [ ] Write `docker-compose.yml` with all 6 containers: `client`, `canvas-service`, `room-service`, `physics-service`, `redis`, `postgres`
- [ ] Configure Nginx as reverse proxy with upstream blocks for Socket.IO (HTTP upgrade) and HTTP
- [ ] Write `proto-gen` init container; commit generated stubs to `gen/` in Canvas and Physics service dirs
- [ ] Verify gRPC round-trip with a stub Physics Service returning mock data
- [ ] Configure shared `.env.example` and per-service environment variable injection

```yaml
# docker-compose.yml excerpt
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: coffeecanvas
      POSTGRES_USER: cc_user
      POSTGRES_PASSWORD: cc_pass
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    command: redis-server --save "" --appendonly no

  physics-service:
    build: ./services/physics
    ports: ['50051:50051']

  canvas-service:
    build: ./services/canvas
    environment:
      REDIS_URL: redis://redis:6379
      PHYSICS_GRPC_ADDR: physics-service:50051
      DATABASE_URL: postgres://cc_user:cc_pass@postgres:5432/coffeecanvas
    depends_on: [redis, postgres, physics-service]
```

---

### Phase 1 — Room Service + Auth (Week 2)

- [ ] Prisma schema for `rooms`, `room_users`, `stroke_events`; run initial migration
- [ ] Apollo Server with Pothos: implement `createRoom`, `joinRoom` mutations
- [ ] JWT issuance on join (payload: `{ userId, roomId, color }`)
- [ ] `canvasHistory` query with chunk-based pagination
- [ ] Integration test: create room → join → fetch empty history

---

### Phase 2 — Canvas Service Core (Week 3)

- [ ] Socket.IO server with JWT middleware in `io.use()` for connection auth (`socket.handshake.auth.token`)
- [ ] Room channel management: client calls `socket.emit("join_room", { roomId })` → server calls `socket.join(roomId)`
- [ ] Configure `@socket.io/redis-adapter` with two `ioredis` clients (pub + sub) on startup
- [ ] `stroke_begin` handler: write initial hash to Redis
- [ ] `stroke_segment` handler: `HSET` append to Redis; `socket.to(roomId).emit("stroke_segment", ...)` (adapter handles cross-instance delivery)
- [ ] `stroke_end` handler: flush Redis hash → batch INSERT to PostgreSQL; `DEL` Redis key
- [ ] Verify fan-out works across 2 Canvas Service replicas with `replicas: 2` in Compose

---

### Phase 3 — Physics Service (Week 4)

- [ ] Go module init; install `google.golang.org/grpc`, `google.golang.org/protobuf`
- [ ] Implement `CoffeePhysics.ComputeSpread`:
  - Build 2D grid from nearby stroke snapshots (mark cells as occupied/density)
  - Run N-step cellular automaton: fluid spreads to adjacent empty cells weighted by viscosity
  - Cells adjacent to strokes apply absorption: reduce spread speed, increase color influence
  - Trace stain boundary → output as polygon via marching squares or convex hull
  - Compute `StrokeMutation` per affected stroke (color interpolation toward coffee brown)
- [ ] Unit tests for deterministic spread with fixed seed
- [ ] Benchmark: target <80ms for 200-stroke room, 0.75 intensity pour

---

### Phase 4 — Frontend Canvas (Week 5)

- [ ] Next.js 14 app; PixiJS `Application` mounted in a `useEffect`
- [ ] Infinite canvas: `viewport` transform matrix via `@pixi/viewport` or manual; pan on middle-click/touch, zoom on wheel
- [ ] Local drawing: `pointer_down` → `socket.emit("stroke_segment", ...)` → render to local `Graphics` object optimistically
- [ ] Remote strokes: `socket.on("stroke_segment", ...)` → render to room graphics layer
- [ ] On room join: fetch `canvasHistory` chunks in viewport → replay all `StrokeEvent` records into canvas
- [ ] `coffee_pour` trigger: right-click or dedicated tool → `socket.emit("coffee_pour", ...)` → `socket.on("stain_applied", ...)` → render stain polygons as semi-transparent filled paths + apply mutations to affected stroke objects

---

### Phase 5 — Polish, Scale & Hardening (Week 6+)

- [ ] **Cursor presence**: broadcast cursor position at 10fps via `socket.emit("cursor_move", { x, y })`; `socket.to(roomId).emit(...)` fan-out; render remote cursors as floating labels
- [ ] **Conflict resolution**: assign each stroke a monotonic sequence number per room; Canvas Service rejects out-of-order `stroke_end` events
- [ ] **Horizontal scaling**: Canvas Service is stateless beyond Redis — `@socket.io/redis-adapter` already handles cross-instance room delivery; add `replicas: 3` in Compose and verify
- [ ] **Rate limiting**: Redis sliding window counter per userId for both stroke segments (max 120/s) and coffee pours (max 1 per 3s); enforce in `io.use()` middleware
- [ ] **Canvas export**: GraphQL query that returns all stroke events for a room; client reconstructs and calls `canvas.toDataURL()` for PNG export
- [ ] **Observability**: OpenTelemetry traces spanning Socket.IO → gRPC → Physics → DB; export to Jaeger container in Compose
- [ ] **Prod hardening**: Nginx TLS termination + `proxy_set_header Upgrade`/`Connection` headers for Socket.IO long-polling fallback; Postgres connection pooling via PgBouncer; Redis `maxmemory-policy allkeys-lru`

---

## Appendix: Monorepo Structure

```
coffee-canvas/
├── apps/
│   └── client/                    # Next.js 14 + PixiJS
│       ├── src/
│       │   ├── app/               # App router pages
│       │   ├── canvas/            # PixiJS engine, viewport, stroke renderer
│       │   ├── hooks/             # useSocket, useCanvasHistory
│       │   └── gql/               # Apollo Client, generated types
│       └── Dockerfile
├── services/
│   ├── canvas-service/            # Node.js 24 + Socket.IO + Redis Adapter + gRPC client
│   │   ├── src/
│   │   │   ├── socket/            # io setup, middleware, event handlers
│   │   │   ├── redis/             # ioredis stroke cache; adapter init
│   │   │   ├── grpc/              # Physics client
│   │   │   └── db/                # pg batch writer
│   │   └── Dockerfile
│   ├── room-service/              # Node.js GraphQL + Prisma
│   │   ├── src/
│   │   │   ├── schema/            # Pothos type definitions
│   │   │   ├── resolvers/
│   │   │   └── auth/              # JWT
│   │   ├── prisma/schema.prisma
│   │   └── Dockerfile
│   └── physics-service/           # Go gRPC server
│       ├── cmd/server/main.go
│       ├── internal/
│       │   ├── simulation/        # Fluid grid, marching squares
│       │   └── geometry/          # Polygon utilities
│       └── Dockerfile
├── proto/
│   └── physics/v1/physics.proto   # Single source of truth
├── docker-compose.yml
├── nginx/nginx.conf
└── .env.example
```
