# Coffee & Canvas Development Commands

.PHONY: help dev dev-logs dev-down build test lint clean install proto

help: ## Show this help message
	@echo "Coffee & Canvas Development Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	npm install
	cd shared && npm install
	cd services/canvas-service && npm install
	cd services/room-service && npm install
	cd frontend && npm install
	cd services/physics-service && go mod download

dev: ## Start development environment
	docker-compose up -d

dev-logs: ## View development logs
	docker-compose logs -f

dev-down: ## Stop development environment
	docker-compose down

build: ## Build all services
	npm run build

test: ## Run all tests
	npm run test

lint: ## Run linting
	npm run lint

clean: ## Clean build artifacts and stop containers
	npm run clean
	docker-compose down -v
	docker system prune -f

proto: ## Generate Protocol Buffer code
	cd shared && npm run proto:generate

# Individual service commands
canvas-dev: ## Start only Canvas Service for development
	cd services/canvas-service && npm run dev

room-dev: ## Start only Room Service for development
	cd services/room-service && npm run dev

physics-dev: ## Start only Physics Service for development
	cd services/physics-service && go run main.go

frontend-dev: ## Start only Frontend for development
	cd frontend && npm run dev