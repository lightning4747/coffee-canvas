#!/bin/bash

# Coffee & Canvas Deployment Script
# Usage: ./scripts/deploy.sh [staging|production]

set -e

ENVIRONMENT=${1:-staging}
REGISTRY="ghcr.io"
REPO_NAME="coffee-canvas-collaborative-drawing"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT_SHA=$(git rev-parse --short HEAD)

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    error "Invalid environment. Use 'staging' or 'production'"
fi

# Validate branch for production
if [[ "$ENVIRONMENT" == "production" && "$BRANCH" != "main" ]]; then
    error "Production deployments must be from 'main' branch. Current branch: $BRANCH"
fi

log "Starting deployment to $ENVIRONMENT environment"
log "Branch: $BRANCH, Commit: $COMMIT_SHA"

# Services to deploy
SERVICES=("canvas-service" "room-service" "physics-service" "frontend")

# Build and push images
log "Building and pushing Docker images..."

for service in "${SERVICES[@]}"; do
    log "Building $service..."
    
    IMAGE_TAG="$REGISTRY/$REPO_NAME/$service:$BRANCH-$COMMIT_SHA"
    LATEST_TAG="$REGISTRY/$REPO_NAME/$service:latest"
    
    # Build image
    docker build -t "$IMAGE_TAG" -f "./services/$service/Dockerfile" .
    
    # Tag as latest for main branch
    if [[ "$BRANCH" == "main" ]]; then
        docker tag "$IMAGE_TAG" "$LATEST_TAG"
    fi
    
    # Push images
    docker push "$IMAGE_TAG"
    if [[ "$BRANCH" == "main" ]]; then
        docker push "$LATEST_TAG"
    fi
    
    log "✓ $service image pushed successfully"
done

# Generate docker-compose override for deployment
log "Generating deployment configuration..."

cat > "docker-compose.$ENVIRONMENT.yml" << EOF
version: '3.8'

services:
  canvas-service:
    image: $REGISTRY/$REPO_NAME/canvas-service:$BRANCH-$COMMIT_SHA
    environment:
      - NODE_ENV=$ENVIRONMENT
      
  room-service:
    image: $REGISTRY/$REPO_NAME/room-service:$BRANCH-$COMMIT_SHA
    environment:
      - NODE_ENV=$ENVIRONMENT
      
  physics-service:
    image: $REGISTRY/$REPO_NAME/physics-service:$BRANCH-$COMMIT_SHA
    environment:
      - GO_ENV=$ENVIRONMENT
      
  frontend:
    image: $REGISTRY/$REPO_NAME/frontend:$BRANCH-$COMMIT_SHA
    environment:
      - NODE_ENV=$ENVIRONMENT
EOF

log "✓ Deployment configuration generated: docker-compose.$ENVIRONMENT.yml"

# Deploy based on environment
case $ENVIRONMENT in
    "staging")
        log "Deploying to staging..."
        # Add staging-specific deployment commands
        # Example: kubectl apply -f k8s/staging/
        warn "Staging deployment commands not yet implemented"
        ;;
    "production")
        log "Deploying to production..."
        # Add production-specific deployment commands
        # Example: kubectl apply -f k8s/production/
        warn "Production deployment commands not yet implemented"
        ;;
esac

log "Deployment to $ENVIRONMENT completed successfully!"
log "Images tagged with: $BRANCH-$COMMIT_SHA"

# Cleanup
log "Cleaning up local images..."
for service in "${SERVICES[@]}"; do
    docker rmi "$REGISTRY/$REPO_NAME/$service:$BRANCH-$COMMIT_SHA" || true
done

log "Deployment script finished"