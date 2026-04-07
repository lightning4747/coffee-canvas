# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root package.json for workspace setup
COPY package*.json ./

# Copy frontend and shared package files
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci

# Copy source code
COPY frontend/ ./frontend/
COPY shared/ ./shared/

# Build shared first, then frontend
RUN npm run build --workspace=shared
RUN npm run build --workspace=@coffee-canvas/frontend

# Production stage
FROM node:24-alpine AS production

WORKDIR /app

# Copy root package.json for workspace setup
COPY package*.json ./

# Copy frontend package files
COPY frontend/package*.json ./frontend/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=@coffee-canvas/frontend

# Copy built application from builder stage
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/next.config.js ./frontend/next.config.js

EXPOSE 3000

WORKDIR /app/frontend
CMD ["npm", "start"]