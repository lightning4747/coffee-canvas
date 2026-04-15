# Implementation Plan: Coffee & Canvas Collaborative Drawing

## Overview

This implementation plan creates a real-time collaborative drawing application with microservices architecture, featuring WebGL-based infinite canvas, physics-based coffee pour effects, and sub-50ms latency for drawing operations. The system uses TypeScript for Canvas and Room services, Go for Physics service, and includes comprehensive testing and deployment strategies.

## Tasks

- [x] 1. Infrastructure Setup and Project Structure
  - [x] 1.1 Initialize project structure and Docker containerization
    - Create monorepo structure with services/, frontend/, and shared/ directories
    - Set up Docker Compose for local development with Redis, PostgreSQL, and Nginx
    - Configure environment variables and secrets management
    - _Requirements: 8.1, 8.3_

  - [x] 1.2 Set up shared TypeScript types and Protocol Buffers
    - Define shared interfaces for Point2D, StrokeData, and event payloads
    - Create Protocol Buffer definitions for Physics Service gRPC interface
    - Generate TypeScript and Go code from protobuf definitions
    - _Requirements: 1.1, 2.1_

  - [x] 1.3 Configure development tooling and CI/CD pipeline
    - Set up ESLint, Prettier, and TypeScript configurations
    - Create GitHub Actions for testing and deployment
    - Configure Docker registry and deployment scripts
    - _Requirements: 8.1_

- [x] 2. Database Schema and Spatial Indexing
  - [x] 2.1 Design and implement PostgreSQL database schema
    - Create tables for rooms, users, stroke_events with spatial chunk indexing
    - Implement spatial indexing using PostGIS for efficient chunk queries
    - Set up database migrations and seed data
    - _Requirements: 3.3, 6.1, 8.3_

  - [x] 2.2 Write property test for spatial chunk distribution
    - **Property 6: Spatial Chunk Distribution**
    - **Validates: Requirements 3.2, 3.3**

  - [x] 2.3 Implement Redis data structures and TTL policies
    - Configure Redis for active stroke caching with 30-second TTL
    - Set up pub/sub channels for real-time event broadcasting
    - Implement LRU eviction policies for memory management
    - _Requirements: 1.2, 8.4_

- [x] 3. Room Service Implementation
  - [x] 3.1 Create Room Service with GraphQL API
    - Implement room creation, joining, and JWT token generation
    - Add user authentication and room capacity management
    - Create GraphQL resolvers for canvas history queries
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 3.2 Write property test for authentication enforcement
    - **Property 7: Authentication Enforcement**
    - **Validates: Requirements 4.5, 9.1**

  - [x] 3.3 Implement canvas history replay functionality
    - Create efficient chunk-based history queries with pagination
    - Implement stroke event reconstruction from database
    - Add canvas state serialization and compression
    - _Requirements: 1.5, 3.3, 6.3_
    - _Status: Completed. Verified with integration and unit tests._

  - [x] 3.4 Write property test for canvas state round-trip consistency
    - **Property 3: Canvas State Round-trip Consistency**
    - **Validates: Requirements 1.5, 3.5, 6.3**
    - _Status: Stabilized. Property tests now achieve 100% pass rate with robust event sequence generators._

  - [x] 3.5 Write unit tests for Room Service
    - Test JWT token generation and validation
    - Test room capacity limits and error handling
    - Test GraphQL resolver edge cases
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. Physics Service Implementation (Go)
  - [x] 4.1 Implement gRPC Physics Service with fluid simulation
    - Create Go service with gRPC server for coffee pour calculations
    - Implement grid-based fluid simulation with viscosity and absorption
    - Add marching squares algorithm for stain polygon generation
    - _Requirements: 2.1, 2.2, 5.2_

  - [x]\* 4.2 Write property test for physics volume conservation
    - **Property 4: Physics Volume Conservation**
    - **Validates: Requirements 2.2, 2.5**

  - [x] 4.3 Implement stroke mutation calculations
    - Calculate color shifts and blur effects for coffee-stained strokes
    - Implement absorption rate calculations based on stroke properties
    - Add opacity and visual effect mutations
    - _Requirements: 2.2, 2.4_

  - [x]\* 4.4 Write property test for stain data preservation
    - **Property 5: Stain Data Preservation**
    - **Validates: Requirements 2.4, 6.2**
    - _Status: Verified. Deterministic mutations and boundary edge cases fixed._

  - [x]\* 4.5 Write unit tests for Physics Service
    - Test fluid simulation determinism with fixed seeds
    - Test performance benchmarks for 100ms target
    - Test edge cases for boundary conditions
    - _Requirements: 2.1, 5.2_

- [ ] 5. Canvas Service Implementation
  - [x] 5.1 Create Canvas Service with Socket.IO server
    - Implement WebSocket connection handling with JWT authentication
    - Set up Redis adapter for horizontal scaling across instances
    - Create room management and user presence tracking
    - _Requirements: 1.1, 4.5, 8.1_

  - [x] 5.2 Implement real-time drawing event handlers (stroke_begin, stroke_segment, stroke_end) with Redis-based active stroke caching
    - Implement Redis caching for active strokes with TTL
    - Add event broadcasting to room participants
    - _Requirements: 1.1, 1.2, 1.3_

  - [x]\* 5.3 Write property test for real-time broadcast latency
    - **Property 1: Real-time Broadcast Latency**
    - **Validates: Requirements 1.1, 2.1, 5.1, 5.2**
    - _Status: Verified. Sub-15ms processing overhead confirmed with fast-check._

  - [x]\* 5.4 Write property test for stroke independence under concurrency
    - **Property 2: Stroke Independence Under Concurrency**
    - **Validates: Requirements 1.4**
    - _Status: Verified. Independent Redis keys and room isolation confirmed._

  - [x] 5.5 Implement coffee pour event coordination
    - Handle coffee_pour events and coordinate with Physics Service
    - Implement gRPC client with connection pooling and timeouts
    - Broadcast stain results and stroke mutations to room participants
    - _Requirements: 2.1, 2.3, 5.2_

  - [x] 5.6 Add stroke persistence and batch operations
    - Implement asynchronous stroke persistence to PostgreSQL
    - Add spatial chunk key calculation for stroke distribution
    - Create batch insert operations for performance optimization
    - _Requirements: 1.3, 3.2, 6.1_
    - _Status: Complete. Async persistence via `setImmediate` for both strokes and stains._

  - [x]\* 5.7 Write property test for stroke persistence consistency
    - **Property 9: Stroke Persistence Consistency** ✅
    - **Property 10: Stain Persistence Consistency** ✅
    - **Validates: Requirements 1.3, 1.5, 6.1, 6.2**
    - _Status: Complete. All 5 property tests pass (5/5)._

  - [x]\* 5.8 Write unit tests for Canvas Service
    - Test Socket.IO event handlers with mock payloads
    - Test Redis operations and error handling
    - Test gRPC client integration with Physics Service
    - _Requirements: 1.1, 1.2, 2.1_

- [x] 6. Checkpoint - Backend Services Integration
  - [x] Ensure all backend services start correctly with Docker Compose
  - [x] Verify gRPC communication between Canvas and Physics services
  - [x] Test Redis pub/sub and PostgreSQL connections

- [x] 7. Frontend Canvas Engine Implementation
  - [x] 7.1 Create Next.js application with PixiJS canvas
    - [x] Set up Next.js project with TypeScript and PixiJS integration
    - [x] Implement infinite canvas viewport with pan and zoom controls
    - [x] Create WebGL-based rendering engine for 60 FPS performance
    - _Requirements: 3.1, 5.3, 7.2_

  - [x] 7.2 Implement drawing tools and user interactions
    - [x] Create drawing tool selection interface with brush properties
    - [x] Implement mouse/touch event handling for stroke creation
    - [x] Add optimistic rendering for immediate visual feedback
    - _Requirements: 7.1, 7.3_

  - [x] 7.3 Add coffee pour interaction interface
    - [x] Create coffee pour trigger with intensity controls
    - [x] Implement visual feedback for pour area and effects
    - [x] Add animation for stain application and stroke mutations
    - _Requirements: 2.3, 7.4_

  - [x] 7.4 Write unit tests for canvas engine
    - [x] Test viewport management and coordinate transformations
    - [x] Test drawing tool interactions and event handling
    - [x] Test PixiJS rendering performance and memory usage
    - _Requirements: 3.1, 7.1, 7.2_

- [x] 8. Real-time Communication Integration
  - [x] 8.1 Implement Socket.IO client integration
    - Connect to Canvas Service with JWT authentication
    - Handle connection, disconnection, and reconnection events
    - Implement exponential backoff for connection retries
    - _Requirements: 4.2, 5.5, 10.1_

  - [x] 8.2 Add real-time event handling and synchronization
    - Handle incoming stroke events and render remote user strokes
    - Implement user presence indicators and cursor tracking
    - Add conflict resolution for simultaneous drawing operations
    - _Requirements: 1.2, 1.4, 7.5_

  - [x] 8.3 Implement local buffering and offline support
    - Buffer drawing operations during network disconnections
    - Replay buffered strokes upon reconnection
    - Handle canvas state synchronization after reconnection
    - _Requirements: 5.5, 6.3, 10.1_

  - [x]\* 8.4 Write property test for reconnection and recovery
    - **Property 12: Reconnection and Recovery**
    - **Validates: Requirements 5.5, 10.1, 10.3**

  - [x]\* 8.5 Write integration tests for real-time communication
    - Test multi-user drawing scenarios with simulated clients
    - Test network disconnection and reconnection flows
    - Test canvas state synchronization accuracy
    - _Requirements: 1.2, 1.4, 5.5_

- [x] 9. Security and Rate Limiting Implementation
  - [x] 9.1 Implement comprehensive input validation
    - Validate all coordinate data and user-generated content
    - Sanitize inputs to prevent injection attacks
    - Add bounds checking for canvas coordinates and stroke properties
    - _Requirements: 9.3, 10.4_

  - [x]\* 9.2 Write property test for input validation and sanitization
    - **Property 11: Input Validation and Sanitization**
    - **Validates: Requirements 9.3, 10.4**

  - [x] 9.3 Add rate limiting and abuse prevention
    - Implement rate limiting for stroke events (120/second per user)
    - Add coffee pour rate limiting (1 per 3 seconds per user)
    - Create monitoring and alerting for suspicious activity
    - _Requirements: 9.2, 5.1_

  - [x]\* 9.4 Write property test for rate limiting protection
    - **Property 10: Rate Limiting Protection**
    - **Validates: Requirements 9.2**

  - [x] 9.5 Implement room isolation and access control
    - Ensure users can only access authorized room content
    - Add audit logging for authentication and security events
    - Implement CORS configuration for production deployment
    - _Requirements: 9.1, 9.4_

  - [x]\* 9.6 Write unit tests for security measures
    - Test JWT token validation and expiration handling
    - Test rate limiting enforcement and error responses
    - Test input validation edge cases and malformed data
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 10. Performance Optimization and Monitoring
- [x] 10. Performance Optimization and Monitoring
  - [x] 10.1 Implement performance monitoring and metrics
    - Add application metrics for latency, throughput, and error rates
    - Implement health checks for all services
    - Create dashboards for system monitoring and alerting
    - _Requirements: 5.1, 5.2, 8.1_
    - _Status: Complete. Prometheus metrics integrated into canvas and room services._

  - [x] 10.2 Optimize rendering performance and memory usage
    - Implement object pooling for PixiJS graphics objects
    - Add viewport culling for off-screen stroke rendering
    - Optimize WebGL shader programs for drawing operations
    - _Requirements: 5.3, 7.2_
    - _Status: Complete. GraphicsPool and viewport culling implemented in frontend._

  - [x] 10.3 Add database query optimization
    - Implement connection pooling for PostgreSQL
    - Optimize spatial queries with proper indexing strategies
    - Add query result caching for frequently accessed data
    - _Requirements: 3.3, 8.3_

  - [x]\* 10.4 Write performance tests and benchmarks
    - Test concurrent user scenarios up to 50 users per room
    - Benchmark physics simulation performance under load
    - Test database query performance with large datasets
    - _Requirements: 5.4, 8.1_

- [x] 11. Error Handling and Resilience
  - [x] 11.1 Implement comprehensive error handling
    - Add graceful degradation for service failures
    - Implement circuit breakers for external service calls
    - Create user-friendly error messages and recovery guidance
    - _Requirements: 10.2, 10.5_

  - [x] 11.2 Add logging and observability
    - Implement structured logging across all services
    - Add distributed tracing for request flow monitoring
    - Create error aggregation and alerting systems
    - _Requirements: 10.2, 9.5_

  - [x]\* 11.3 Write integration tests for error scenarios
    - Test service failure and recovery scenarios
    - Test database connection failures and reconnection
    - Test network partition and split-brain scenarios
    - _Requirements: 10.1, 10.3_

- [x] 12. Checkpoint - System Integration Testing
  - Run end-to-end tests with multiple concurrent users
  - Verify all performance targets are met (50ms drawing, 100ms physics)
  - Test complete user workflows from room creation to collaborative drawing
  - Ask the user if questions arise about system integration

- [ ] 13. Canvas Core UX — Room Lobby
  - [ ] 13.1 Create GraphQL client helper for Room Service
    - Implement lightweight `createRoom` and `joinRoom` fetch wrappers in `frontend/src/lib/graphql.ts`
    - No Apollo client required — plain fetch POST to `http://localhost:3002/graphql`
    - _Requirements: 11.2, 11.3_

  - [ ] 13.2 Build the Lobby page (create / join)
    - Create `frontend/src/pages/lobby.tsx` with two panels: Create Room and Join Room
    - Create Room: optional name input → calls `createRoom` → redirects to `/canvas/[roomId]`
    - Join Room: 6-char code + display name → calls `joinRoom` → redirects to `/canvas/[roomId]`
    - Display clear validation errors for invalid codes or full rooms
    - Coffee-themed hero section with CSS animated steam
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ] 13.3 Create the canvas route `/canvas/[roomId]`
    - Create `frontend/src/pages/canvas/[roomId].tsx` that guards against missing token and renders `<Canvas />` and `<Toolbar />`
    - If no valid token in localStorage → redirect to `/lobby`
    - _Requirements: 11.5, 11.6_

  - [ ] 13.4 Wire auth into Zustand store and SocketContext
    - Extend `useStore.ts`: add `userName`, `userColor`, `token` fields; expand `setRoomInfo` to accept them
    - Update `SocketContext.tsx`: remove hardcoded mock `roomId`/`userId`; read real JWT from store for `auth.token`
    - _Requirements: 11.6, 4.2_

  - [ ] 13.5 Update root index page to redirect to lobby
    - Replace `frontend/src/pages/index.tsx` canvas render with a `router.replace('/lobby')` redirect
    - _Requirements: 11.1_

- [ ] 14. Canvas Core UX — Cursor Modes and Pan Tool
  - [ ] 14.1 Add Pan tool to the store and toolbar
    - Add `'pan'` to `ToolType` union in `useStore.ts`
    - Add Hand icon Pan tool button as first item in `Toolbar.tsx` TOOLS array
    - _Requirements: 12.1, 12.5_

  - [ ] 14.2 Implement per-tool CSS cursors on the canvas
    - Update cursor style logic in `Canvas.tsx`:
      - `pan` (idle) → `grab`, `pan` (dragging) → `grabbing`
      - `pen` → `crosshair`
      - `eraser` → custom SVG circle cursor sized to brush width
      - `pour` → `cell`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ] 14.3 Implement Pan tool pointer interaction
    - Update `useViewport.ts` to pan the viewport when `activeTool === 'pan'` and `e.buttons === 1`
    - Keep existing middle-mouse pan as fallback for all tools
    - _Requirements: 12.5, 12.6_

  - [ ] 14.4 Switch canvas background to white
    - Change `backgroundColor: 0x1a1a1a` → `0xFFFFFF` in `useCanvas.ts`
    - Remove `backgroundColor: '#1a1a1a'` from the container `<div>` in `Canvas.tsx`
    - _Requirements: 13.5_

- [ ] 15. Canvas Core UX — Color Palette and Brush Styles
  - [ ] 15.1 Implement 24-color palette with custom picker
    - Replace the 7-color array in `Toolbar.tsx` with a 24-color grid (neutrals, warms, cools, vibrants rows)
    - Add a native `<input type="color">` custom-picker button as the last swatch
    - Add visible selected-state ring on the active swatch
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ] 15.2 Add brush style selector to toolbar
    - Add `brushStyle: BrushStyleType` (`'round' | 'flat' | 'marker' | 'watercolor'`) to `useStore.ts`
    - Add `setBrushStyle` action
    - Add 4 brush-style icon buttons below color palette in `Toolbar.tsx`
    - _Requirements: 13.4_

  - [ ] 15.3 Implement brush style rendering in StrokeRenderer
    - Extend `StrokeRenderer.render()` to accept `brushStyle` and apply:
      - `round`: current behavior (round cap/join)
      - `flat`: square cap, solid opacity
      - `marker`: 2× width, ~0.4 alpha, no anti-aliasing
      - `watercolor`: 3 overlapping passes at low alpha with ±2px jitter per pass
    - _Requirements: 13.4_

  - [ ] 15.4 Add live size preview dot to brush slider
    - Show a filled circle next to the size slider in `Toolbar.tsx` whose diameter matches `brushSettings.width`
    - _Requirements: 13.6_

- [ ] 16. Checkpoint — Canvas Core UX Verification
  - Verify lobby page create/join flows work end-to-end with the running Room Service
  - Verify cursor changes on tool switch and pan mode works without drawing strokes
  - Verify white canvas background renders correctly
  - Verify all 24 colors and 4 brush styles produce visually distinct strokes
  - Verify multi-user collaboration still works after SocketContext auth changes

- [ ] 17. Deployment and Production Configuration
  - [ ] 17.1 Create production Docker configurations
    - Build optimized Docker images for all services
    - Configure production environment variables and secrets
    - Set up multi-stage builds for minimal image sizes
    - _Requirements: 8.1_

  - [ ] 17.2 Implement deployment automation
    - Create Kubernetes manifests or Docker Compose for production
    - Set up automated deployment pipelines with health checks
    - Configure load balancing and service discovery
    - _Requirements: 8.1, 8.2_

  - [ ] 17.3 Add production monitoring and alerting
    - Configure application performance monitoring (APM)
    - Set up log aggregation and analysis systems
    - Create alerting rules for critical system metrics
    - _Requirements: 10.1, 10.2_

  - [ ]\* 17.4 Write deployment verification tests
    - Test production deployment procedures
    - Verify all services start correctly in production environment
    - Test backup and disaster recovery procedures
    - _Requirements: 6.4, 8.1_

- [ ] 18. Final Integration and User Acceptance
  - [ ] 18.1 Conduct comprehensive system testing
    - Test all user workflows end-to-end including lobby → canvas flow
    - Verify performance requirements under realistic load
    - Validate security measures and access controls
    - _Requirements: All requirements_

  - [ ] 18.2 Create user documentation and deployment guide
    - Write API documentation for all services
    - Create user guide for drawing interface and features including new tools
    - Document deployment and configuration procedures
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]\* 18.3 Write property test for room capacity enforcement
    - **Property 8: Room Capacity Enforcement**
    - **Validates: Requirements 4.3, 11.4**

- [ ] 19. Final Checkpoint - Production Readiness
  - Ensure all tests pass and performance targets are met
  - Verify production deployment is successful and stable
  - Confirm all security measures are properly configured
  - Ask the user if questions arise about production readiness

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability and validation
- Tasks 13–15 are the new Canvas Core UX block — they must be completed before Task 17 (deployment)
- Property tests validate universal correctness properties from the design document
- Checkpoints ensure incremental validation and provide opportunities for user feedback
- The implementation follows microservices architecture with clear service boundaries
- Performance targets: <50ms drawing latency, <100ms physics simulation, 60 FPS rendering
- Security measures include JWT authentication, rate limiting, and input validation
- The system supports up to 50 concurrent users per room with horizontal scaling capabilities
