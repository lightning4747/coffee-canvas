#!/bin/bash

# Coffee & Canvas Database Migration Runner
# This script runs all migration files in order

set -e

# Database connection parameters
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-coffeecanvas}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}

# Migration directory
MIGRATION_DIR="$(dirname "$0")/migrations"

echo "🚀 Starting Coffee & Canvas database migrations..."
echo "📍 Target: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

# Check if PostgreSQL is available
echo "🔍 Checking database connection..."
if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Create migrations tracking table if it doesn't exist
echo "📋 Setting up migration tracking..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);"

# Run migrations in order
for migration_file in $(ls $MIGRATION_DIR/*.sql | sort); do
    migration_name=$(basename "$migration_file" .sql)

    # Check if migration has already been applied
    # Trim whitespace from the COUNT result to avoid numeric comparison failures
    applied=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM schema_migrations WHERE version = '$migration_name';" | xargs)

    if [ "$applied" -eq 0 ]; then
        echo "🔄 Applying migration: $migration_name"
        if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration_file"; then
            # Record successful migration
            PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "INSERT INTO schema_migrations (version) VALUES ('$migration_name');"
            echo "✅ Migration $migration_name applied successfully"
        else
            echo "❌ Migration $migration_name failed"
            exit 1
        fi
    else
        echo "⏭️  Migration $migration_name already applied, skipping"
    fi
done

echo "🎉 All migrations completed successfully!"