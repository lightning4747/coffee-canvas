# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root package.json for workspace setup
COPY package*.json ./

# Copy all workspace manifests
COPY services/canvas-service/package*.json ./services/canvas-service/
COPY services/room-service/package*.json ./services/room-service/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci

# Copy source code
COPY services/canvas-service/ ./services/canvas-service/
COPY shared/ ./shared/

# Build shared first, then service
RUN npm run build --workspace=shared
RUN npm run build --workspace=@coffee-canvas/canvas-service

# Production stage
FROM node:24-alpine AS production

WORKDIR /app

# Copy root package.json for workspace setup
COPY package*.json ./

# Copy all workspace manifests
COPY services/canvas-service/package*.json ./services/canvas-service/
COPY services/room-service/package*.json ./services/room-service/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application from builder stage
COPY --from=builder /app/services/canvas-service/dist ./services/canvas-service/dist
COPY --from=builder /app/shared/dist ./shared/dist

EXPOSE 3001

WORKDIR /app/services/canvas-service
CMD ["npm", "start"]