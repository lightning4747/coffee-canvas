# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root package.json for workspace setup
COPY package*.json ./

# Copy service and shared package files
COPY services/room-service/package*.json ./services/room-service/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci

# Copy source code
COPY services/room-service/ ./services/room-service/
COPY shared/ ./shared/

# Build shared first, then service
RUN npm run build --workspace=shared
RUN npm run build --workspace=@coffee-canvas/room-service

# Production stage
FROM node:24-alpine AS production

WORKDIR /app

# Copy root package.json for workspace setup
COPY package*.json ./

# Copy service and shared package files
COPY services/room-service/package*.json ./services/room-service/
COPY shared/package*.json ./shared/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application from builder stage
COPY --from=builder /app/services/room-service/dist ./services/room-service/dist
COPY --from=builder /app/shared/dist ./shared/dist

EXPOSE 3002

WORKDIR /app/services/room-service
CMD ["npm", "start"]