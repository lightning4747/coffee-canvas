# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY services/room-service/package*.json ./
RUN mkdir -p ../shared
COPY shared/package*.json ../shared/

# Install all dependencies (including dev dependencies for building)
RUN npm install

# Copy source code
COPY services/room-service/ .
COPY shared/ ../shared/

# Build the application
RUN npm run build

# Production stage
FROM node:24-alpine AS production

WORKDIR /app

# Copy package files
COPY services/room-service/package*.json ./
RUN mkdir -p ../shared
COPY shared/package*.json ../shared/

# Install only production dependencies
RUN npm install --omit=dev

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/../shared/dist ../shared/dist

EXPOSE 3002

CMD ["npm", "start"]