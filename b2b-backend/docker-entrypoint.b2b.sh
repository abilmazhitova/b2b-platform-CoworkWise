#!/bin/sh
set -e
echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -q 2>/dev/null; do
  sleep 1
done
echo "Running Alembic migrations..."
cd /app && alembic upgrade head
echo "Starting server..."
exec "$@"
