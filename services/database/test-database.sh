#!/bin/bash

# Coffee & Canvas Database Test Runner
# Tests the database schema and functions

set -e

# Database connection parameters
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-coffeecanvas}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}

echo "🧪 Running Coffee & Canvas database tests..."
echo "📍 Target: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

# Check if PostgreSQL is available
echo "🔍 Checking database connection..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Run the test script
echo "🔄 Running schema tests..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$(dirname "$0")/test-schema.sql"

if [ $? -eq 0 ]; then
    echo "✅ All database tests passed!"
else
    echo "❌ Database tests failed"
    exit 1
fi

echo "🎉 Database testing completed successfully!"