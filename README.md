# Coffee & Canvas - Collaborative Drawing Application

A real-time collaborative drawing application with physics-based coffee pour effects, built with microservices architecture.

## Features

- **Real-time Collaborative Drawing**: Multiple users can draw together with sub-50ms latency
- **Coffee Pour Physics**: Realistic fluid simulation that interacts with existing artwork
- **Infinite Canvas**: Scalable drawing surface with spatial chunking
- **Microservices Architecture**: Separate services for canvas operations, room management, and physics

## Architecture

- **Canvas Service** (Node.js + Socket.IO): Real-time drawing operations
- **Room Service** (Node.js + GraphQL): Room management and authentication  
- **Physics Service** (Go + gRPC): Fluid simulation for coffee pour effects
- **Frontend** (Next.js + PixiJS): WebGL-powered infinite canvas
- **Infrastructure**: Redis, PostgreSQL, Nginx

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
   - Frontend: http://localhost:3000
   - Canvas Service: http://localhost:3001
   - Room Service: http://localhost:3002
   - Physics Service: gRPC on localhost:50051

## Development

### Project Structure

```
├── services/
│   ├── canvas-service/     # Real-time drawing operations
│   ├── room-service/       # Room management & auth
│   ├── physics-service/    # Coffee pour physics (Go)
│   └── database/           # Database initialization
├── frontend/               # Next.js + PixiJS frontend
├── shared/                 # Shared types and utilities
│   ├── src/types/         # TypeScript interfaces
│   ├── proto/             # Protocol Buffer definitions
│   └── src/utils/         # Shared utilities
└── docker-compose.yml     # Development environment
```

### Building Individual Services

```bash
# Build all services
npm run build

# Build specific service
cd services/canvas-service && npm run build
cd services/room-service && npm run build
cd services/physics-service && go build

# Build frontend
cd frontend && npm run build
```

### Running Tests

```bash
# Run all tests
npm run test

# Run tests for specific service
cd services/canvas-service && npm run test
```

## Implementation Status

This project is currently in development. See `.kiro/specs/coffee-canvas-collaborative-drawing/tasks.md` for detailed implementation progress.

### Completed
- ✅ Project structure and Docker containerization
- ✅ Shared TypeScript types and Protocol Buffer definitions

### In Progress
- 🚧 Database schema and spatial indexing
- 🚧 Service implementations

### Planned
- ⏳ Frontend canvas engine
- ⏳ Real-time communication
- ⏳ Security and rate limiting
- ⏳ Performance optimization

## Performance Targets

- **Drawing Latency**: <50ms for stroke broadcast
- **Physics Simulation**: <100ms for coffee pour calculations  
- **Rendering**: 60 FPS WebGL performance
- **Scalability**: 50 concurrent users per room

## Contributing

This project follows a microservices architecture with clear separation of concerns. Each service has its own package.json and can be developed independently.

## License

MIT License - see LICENSE file for details.