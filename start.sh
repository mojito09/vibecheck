#!/usr/bin/env bash

echo "Running migrations..."
./node_modules/.bin/prisma migrate deploy || echo "Migration warning (non-fatal)"

echo "Starting worker..."
npm run worker &
WORKER_PID=$!

cleanup() {
  kill $WORKER_PID 2>/dev/null
  wait $WORKER_PID 2>/dev/null
  exit 0
}

trap cleanup SIGTERM SIGINT

echo "Starting Next.js..."
npm run start &
NEXT_PID=$!

wait $NEXT_PID $WORKER_PID
