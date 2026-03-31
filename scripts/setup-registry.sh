#!/bin/bash

# Docker Registry Setup Script for Coffee & Canvas
# Configures GitHub Container Registry authentication and settings

set -e

REGISTRY="ghcr.io"
REPO_NAME="coffee-canvas-collaborative-drawing"

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[Registry Setup] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[Registry Setup] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[Registry Setup] ERROR: $1${NC}"
    exit 1
}

log "Setting up Docker registry configuration..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Please install Docker first."
fi

# Check if GitHub CLI is available for authentication
if command -v gh &> /dev/null; then
    log "GitHub CLI detected. Attempting automatic authentication..."
    
    # Login to GitHub Container Registry using GitHub CLI
    if gh auth token | docker login ghcr.io -u USERNAME --password-stdin; then
        log "✓ Successfully authenticated with GitHub Container Registry"
    else
        warn "Automatic authentication failed. Please run: echo \$GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin"
    fi
else
    warn "GitHub CLI not found. Manual authentication required:"
    echo "1. Create a Personal Access Token with 'write:packages' scope"
    echo "2. Run: echo \$GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin"
fi

# Create .dockerignore if it doesn't exist
if [[ ! -f .dockerignore ]]; then
    log "Creating .dockerignore file..."
    cat > .dockerignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
build/
.next/
out/

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Git
.git/
.gitignore

# Documentation
README.md
docs/

# Test files
coverage/
*.test.js
*.spec.js

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Temporary folders
tmp/
temp/
EOF
    log "✓ .dockerignore created"
else
    log "✓ .dockerignore already exists"
fi

# Create registry configuration
log "Creating registry configuration..."

cat > .github/registry-config.json << EOF
{
  "registry": "$REGISTRY",
  "repository": "$REPO_NAME",
  "services": [
    "canvas-service",
    "room-service", 
    "physics-service",
    "frontend"
  ],
  "tags": {
    "latest": "main",
    "staging": "develop",
    "feature": "feature/*"
  },
  "retention": {
    "keep_latest": 10,
    "keep_tagged": 5
  }
}
EOF

log "✓ Registry configuration created at .github/registry-config.json"

# Create image build script
log "Creating image build helper script..."

cat > scripts/build-images.sh << 'EOF'
#!/bin/bash

# Build all Docker images for Coffee & Canvas
# Usage: ./scripts/build-images.sh [--push] [--tag TAG]

set -e

REGISTRY="ghcr.io"
REPO_NAME="coffee-canvas-collaborative-drawing"
PUSH=false
TAG="local"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH=true
            shift
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

SERVICES=("canvas-service" "room-service" "physics-service" "frontend")

echo "Building images with tag: $TAG"

for service in "${SERVICES[@]}"; do
    echo "Building $service..."
    
    IMAGE_NAME="$REGISTRY/$REPO_NAME/$service:$TAG"
    
    docker build -t "$IMAGE_NAME" -f "./services/$service/Dockerfile" .
    
    if [[ "$PUSH" == "true" ]]; then
        echo "Pushing $IMAGE_NAME..."
        docker push "$IMAGE_NAME"
    fi
    
    echo "✓ $service built successfully"
done

echo "All images built successfully!"
EOF

log "✓ Image build script created at scripts/build-images.sh"

# Create cleanup script
cat > scripts/cleanup-images.sh << 'EOF'
#!/bin/bash

# Cleanup Docker images for Coffee & Canvas
# Usage: ./scripts/cleanup-images.sh [--all]

set -e

REGISTRY="ghcr.io"
REPO_NAME="coffee-canvas-collaborative-drawing"
CLEANUP_ALL=false

if [[ "$1" == "--all" ]]; then
    CLEANUP_ALL=true
fi

SERVICES=("canvas-service" "room-service" "physics-service" "frontend")

echo "Cleaning up Docker images..."

for service in "${SERVICES[@]}"; do
    if [[ "$CLEANUP_ALL" == "true" ]]; then
        # Remove all images for this service
        docker images "$REGISTRY/$REPO_NAME/$service" --format "table {{.Repository}}:{{.Tag}}" | tail -n +2 | xargs -r docker rmi || true
    else
        # Remove only untagged images
        docker images "$REGISTRY/$REPO_NAME/$service" --filter "dangling=true" -q | xargs -r docker rmi || true
    fi
done

# Clean up build cache
docker builder prune -f

echo "✓ Cleanup completed"
EOF

log "✓ Cleanup script created at scripts/cleanup-images.sh"

log "Registry setup completed successfully!"
log ""
log "Next steps:"
log "1. Authenticate with GitHub Container Registry (see instructions above)"
log "2. Run './scripts/build-images.sh --tag test' to test image building"
log "3. Use GitHub Actions for automated builds and deployments"