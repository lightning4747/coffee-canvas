#!/bin/bash

# Development Environment Setup Script for Coffee & Canvas
# Sets up the complete development environment

set -e

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[Setup] $1${NC}"
}

info() {
    echo -e "${BLUE}[Setup] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[Setup] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[Setup] ERROR: $1${NC}"
    exit 1
}

log "Setting up Coffee & Canvas development environment..."

# Check prerequisites
info "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Please install Node.js 20+ first."
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [[ $NODE_VERSION -lt 20 ]]; then
    error "Node.js version 20+ required. Current version: $(node --version)"
fi

log "✓ Node.js $(node --version) detected"

# Check npm
if ! command -v npm &> /dev/null; then
    error "npm is not installed."
fi

log "✓ npm $(npm --version) detected"

# Check Docker
if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Please install Docker first."
fi

log "✓ Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1) detected"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    error "Docker Compose is not installed."
fi

log "✓ Docker Compose detected"

# Check Go (for physics service)
if ! command -v go &> /dev/null; then
    warn "Go is not installed. Physics service development will be limited."
else
    log "✓ Go $(go version | cut -d' ' -f3) detected"
fi

# Install dependencies
log "Installing dependencies..."
npm ci

# Setup Husky hooks
log "Setting up Git hooks..."
npm run prepare

# Generate Protocol Buffers
log "Generating Protocol Buffer code..."
npm run proto:generate

# Build shared packages
log "Building shared packages..."
npm run build --workspace=shared

# Setup environment files
log "Setting up environment files..."

if [[ ! -f .env ]]; then
    cp .env.example .env
    log "✓ Created .env from .env.example"
    warn "Please update .env with your configuration"
else
    log "✓ .env already exists"
fi

# Create development directories
log "Creating development directories..."
mkdir -p logs
mkdir -p tmp
mkdir -p coverage

# Setup Docker development environment
log "Setting up Docker development environment..."

# Pull required images
docker-compose pull postgres redis nginx

log "✓ Docker images pulled"

# Validate TypeScript configuration
log "Validating TypeScript configuration..."
npm run type-check

log "✓ TypeScript configuration valid"

# Run linting
log "Running code quality checks..."
npm run lint

log "✓ Code quality checks passed"

# Test Docker Compose setup
log "Testing Docker Compose setup..."
docker-compose config > /dev/null

log "✓ Docker Compose configuration valid"

# Create useful development aliases
log "Creating development aliases..."

cat > .dev-aliases << 'EOF'
# Coffee & Canvas Development Aliases
# Source this file: source .dev-aliases

alias cc-dev='docker-compose up -d'
alias cc-logs='docker-compose logs -f'
alias cc-down='docker-compose down'
alias cc-restart='docker-compose restart'
alias cc-build='npm run build'
alias cc-test='npm run test'
alias cc-lint='npm run lint'
alias cc-format='npm run format'
alias cc-clean='npm run clean'

# Service-specific aliases
alias cc-canvas='docker-compose logs -f canvas-service'
alias cc-room='docker-compose logs -f room-service'
alias cc-physics='docker-compose logs -f physics-service'
alias cc-frontend='docker-compose logs -f frontend'

# Database aliases
alias cc-db='docker-compose exec postgres psql -U postgres -d coffeecanvas'
alias cc-redis='docker-compose exec redis redis-cli'

echo "Coffee & Canvas development aliases loaded!"
echo "Available commands:"
echo "  cc-dev     - Start development environment"
echo "  cc-logs    - View all service logs"
echo "  cc-down    - Stop development environment"
echo "  cc-build   - Build all services"
echo "  cc-test    - Run all tests"
echo "  cc-lint    - Run linting"
echo "  cc-format  - Format code"
EOF

log "✓ Development aliases created (.dev-aliases)"

# Setup complete
log ""
log "🎉 Development environment setup complete!"
log ""
log "Next steps:"
log "1. Update .env with your configuration"
log "2. Source development aliases: source .dev-aliases"
log "3. Start development environment: cc-dev (or docker-compose up -d)"
log "4. View logs: cc-logs (or docker-compose logs -f)"
log ""
log "Useful commands:"
log "  npm run dev          - Start all services"
log "  npm run test         - Run tests"
log "  npm run lint         - Check code quality"
log "  npm run format       - Format code"
log "  npm run type-check   - Check TypeScript"
log ""
log "Happy coding! ☕🎨"