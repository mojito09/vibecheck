#!/usr/bin/env bash
set -e

npm run worker &
WORKER_PID=$!

cleanup() {
  kill $WORKER_PID 2>/dev/null
  wait $WORKER_PID 2>/dev/null
  exit 0
}

trap cleanup SIGTERM SIGINT

npm run start &
NEXT_PID=$!

wait $NEXT_PID $WORKER_PID
