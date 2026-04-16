# Coffee & Canvas - Collaborative Drawing Application

A real-time collaborative drawing application with physics-based coffee pour effects, built with a high-performance microservices architecture. Multiple users can share an infinite canvas, sketch freely, and trigger realistic fluid simulations that interact with existing artwork.

---

## Features

- **Real-time Collaborative Drawing**: Multi-user cursor presence and stroke broadcasting with <50ms latency.
- **Coffee Pour Physics**: Realistic fluid simulation (Go-powered) that spreads, stains, and blends with vector strokes.
- **Infinite Canvas**: WebGL-powered drawing surface with spatial chunking for efficient infinite panning and zooming.
- **Advanced Persistence**: Vector-based stroke history with server reconciliation and spatial indexing.

---

## Quick Start

1. **Prerequisites**

   ```bash
   # Ensure you have Docker and Docker Compose installed
   docker --version
   docker-compose --version
   ```

2. **Environment Setup**

   ```bash
   # Copy environment template
   cp .env.example .env

   # Edit .env with your configuration (optional for development)
   ```

3. **Start Development Environment**

   ```bash
   # Start all services
   npm run dev

   # View logs
   npm run dev:logs

   # Stop services
   npm run dev:down
   ```

4. **Access the Application**
   - **Frontend**: [http://localhost:3000](http://localhost:3000)
   - **Canvas Service**: [http://localhost:3001](http://localhost:3001)
   - **Room Service**: [http://localhost:3002](http://localhost:3002)
   - **Physics Service**: gRPC on `localhost:50051`

---

## System Architecture

Coffee & Canvas follows a decoupled microservices architecture designed for low-latency synchronization and intensive physics computations.

### Architectural Overview

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

### Microservices Breakdown

| Service             | Technology Stack             | Responsibility                                                               |
| :------------------ | :--------------------------- | :--------------------------------------------------------------------------- |
| **Frontend**        | Next.js, PixiJS, Apollo      | WebGL rendering, local optimistic updates, and UI management.                |
| **Canvas Service**  | Node.js, Socket.IO, Redis    | Real-time event broadcasting, active stroke caching, and gRPC orchestration. |
| **Room Service**    | Node.js, GraphQL, PostgreSQL | Room management, authentication (JWT), and persistent stroke history.        |
| **Physics Service** | Go, gRPC                     | Particle-based fluid simulation for coffee pour effects.                     |

### Data Flow: Coffee Pour Event

When a user initiates a "Coffee Pour", the system executes a high-frequency synchronized flow to ensure all clients see the physics simulation simultaneously.

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

## Development

### Project Structure

```
├── services/
│   ├── canvas-service/     # Real-time drawing operations
│   ├── room-service/       # Room management & auth
│   ├── physics-service/    # Coffee pour physics (Go)
│   └── database/           # Database initialization
├── frontend/               # Next.js + PixiJS frontend
├── shared/                 # Shared types, protos, and utils
└── docker-compose.yml     # Container orchestration
```

### Building Individual Services

```bash
# Build all services
npm run build

# Build specific service (example)
cd services/canvas-service && npm run build
```

### Running Tests

```bash
# Run all tests
npm run test

# Run tests for specific service
cd services/canvas-service && npm run test
```

---

## Performance Targets

- **Drawing Latency**: <50ms for stroke broadcast between clients.
- **Physics Simulation**: <100ms for fluid spread calculations in the Go service.
- **Rendering**: Consistent 60 FPS using WebGL (PixiJS) even on large canvases.
- **Scalability**: Optimized for 50+ concurrent users per room with spatial partitioning.

## License

MIT License - see [LICENSE](LICENSE) file for details.
