# Room Service

The Room Service is a Node.js microservice that handles room lifecycle management, user authentication, and canvas history queries for the Coffee & Canvas collaborative drawing application.

## Features

- **Room Management**: Create and join drawing rooms with unique codes
- **JWT Authentication**: Secure token-based authentication for room access
- **User Management**: Handle user presence and color assignment
- **Canvas History**: Query stroke events with spatial chunk filtering
- **GraphQL API**: Modern API interface with type safety
- **Rate Limiting**: Protection against abuse and excessive requests
- **Health Monitoring**: Built-in health checks and metrics

## API Endpoints

### GraphQL Endpoint

- **URL**: `http://localhost:3002/graphql`
- **Playground**: Available in development mode

### Health Check

- **URL**: `http://localhost:3002/health`
- **Method**: GET
- **Response**: Service status and statistics

## GraphQL Schema

### Mutations

#### createRoom

Creates a new drawing room with a unique code.

```graphql
mutation CreateRoom($input: CreateRoomInput!) {
  createRoom(input: $input) {
    token
    user {
      id
      displayName
      color
      joinedAt
    }
    room {
      id
      code
      name
      capacity
      createdAt
      participantCount
    }
  }
}
```

**Input:**

```graphql
input CreateRoomInput {
  name: String # Optional room name
  capacity: Int # Optional capacity (1-50, default: 10)
}
```

#### joinRoom

Join an existing room using a room code.

```graphql
mutation JoinRoom($input: JoinRoomInput!) {
  joinRoom(input: $input) {
    token
    user {
      id
      displayName
      color
      joinedAt
    }
    room {
      id
      code
      name
      capacity
      createdAt
      participantCount
    }
  }
}
```

**Input:**

```graphql
input JoinRoomInput {
  code: String! # Room code (4-12 characters)
  displayName: String! # User display name (1-50 characters)
}
```

### Queries

#### getCanvasHistory

Retrieve canvas stroke events for specified spatial chunks.

```graphql
query GetCanvasHistory($input: CanvasHistoryInput!) {
  getCanvasHistory(input: $input) {
    events {
      id
      strokeId
      userId
      eventType
      chunkKey
      data {
        tool
        color
        width
        points {
          x
          y
        }
      }
      createdAt
    }
    cursor
    hasMore
  }
}
```

**Input:**

```graphql
input CanvasHistoryInput {
  roomId: String! # Room ID (requires authentication)
  chunks: [String!]! # Array of chunk keys ("x:y" format)
  cursor: String # Optional pagination cursor
  limit: Int # Optional limit (max 500, default 100)
}
```

#### getRoomInfo

Get information about a specific room.

```graphql
query GetRoomInfo($roomId: String!) {
  getRoomInfo(roomId: $roomId) {
    id
    code
    name
    capacity
    createdAt
    participantCount
  }
}
```

#### healthCheck

Check service health status.

```graphql
query HealthCheck {
  healthCheck
}
```

## Authentication

The Room Service uses JWT (JSON Web Tokens) for authentication. After creating or joining a room, clients receive a JWT token that must be included in subsequent requests.

### Token Format

```
Authorization: Bearer <jwt-token>
```

### Token Payload

```json
{
  "userId": "user-uuid",
  "roomId": "room-uuid",
  "displayName": "User Name",
  "color": "#FF6B6B",
  "iat": 1234567890,
  "exp": 1234567890,
  "iss": "coffee-canvas-room-service",
  "aud": "coffee-canvas-app"
}
```

## Environment Variables

| Variable         | Description                  | Default                                                      |
| ---------------- | ---------------------------- | ------------------------------------------------------------ |
| `PORT`           | Server port                  | `3002`                                                       |
| `DATABASE_URL`   | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/coffeecanvas` |
| `JWT_SECRET`     | JWT signing secret           | `dev-secret-key`                                             |
| `JWT_EXPIRES_IN` | JWT expiration time          | `24h`                                                        |
| `CORS_ORIGIN`    | CORS allowed origin          | `http://localhost:3000`                                      |
| `NODE_ENV`       | Environment mode             | `development`                                                |

## Development

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Shared package built (`npm run build` in `../../shared`)

### Setup

```bash
# Install dependencies
npm install

# Build the service
npm run build

# Run tests
npm test

# Start development server
npm run dev

# Start production server
npm start
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Architecture

The Room Service follows a clean architecture pattern:

- **GraphQL Layer**: API interface with type-safe schema
- **Resolver Layer**: Business logic and request handling
- **Authentication Layer**: JWT token management
- **Database Layer**: PostgreSQL integration via shared utilities
- **Validation Layer**: Input validation and sanitization

## Error Handling

The service implements comprehensive error handling:

- **Authentication Errors**: Invalid or expired tokens
- **Validation Errors**: Invalid input parameters
- **Business Logic Errors**: Room capacity, duplicate codes, etc.
- **Database Errors**: Connection failures, query errors
- **Rate Limiting**: Too many requests protection

## Security Features

- **JWT Authentication**: Secure token-based access control
- **Rate Limiting**: 100 requests per minute per IP
- **Input Validation**: All inputs validated and sanitized
- **CORS Protection**: Configurable cross-origin policies
- **Helmet Security**: Security headers and protections
- **Room Isolation**: Users can only access authorized rooms

## Monitoring

The service provides built-in monitoring capabilities:

- **Health Checks**: `/health` endpoint with database status
- **Metrics**: Room count, active users, total strokes
- **Logging**: Structured logging for errors and events
- **Performance**: Request timing and error tracking

## Integration

The Room Service integrates with:

- **Canvas Service**: Provides authentication for drawing operations
- **Frontend**: GraphQL API for room management
- **Database**: PostgreSQL for persistent storage
- **Redis**: (Future) Caching and pub/sub capabilities

## Requirements Fulfilled

This implementation fulfills the following requirements:

- **4.1**: Room creation with unique codes and JWT token generation
- **4.2**: Room joining with valid codes and JWT token issuance
- **4.3**: Room capacity limits and appropriate error handling
- **4.5**: JWT authentication enforcement for all operations
- **9.1**: Secure authentication and authorization
- **9.2**: Rate limiting protection against abuse
- **9.3**: Input validation and sanitization
