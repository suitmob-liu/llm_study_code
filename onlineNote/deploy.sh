#!/bin/bash
set -e

# Configuration
IMAGE="onlinenote"
CONTAINER="onlinenote"
HOST_PORT=5493
CONTAINER_PORT=8080
DATA_DIR="$(cd "$(dirname "$0")" && pwd)/data"

echo "=== Online Notes Deploy ==="

# Build
echo "[1/3] Building image..."
docker build -t "$IMAGE" "$(dirname "$0")"

# Stop old container (if exists)
echo "[2/3] Replacing container..."
docker rm -f "$CONTAINER" 2>/dev/null || true

# Start
echo "[3/3] Starting..."
mkdir -p "$DATA_DIR"
docker run -d \
    --name "$CONTAINER" \
    --restart always \
    -p "$HOST_PORT:$CONTAINER_PORT" \
    -v "$DATA_DIR:/app/data" \
    "$IMAGE"

echo ""
echo "=== Done ==="
echo "URL:  http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):$HOST_PORT"
echo "Data: $DATA_DIR"
echo ""

# Check if any users exist
USER_COUNT=$(docker exec "$CONTAINER" ./manage_users list 2>/dev/null | tail -n +3 | wc -l)
if [ "$USER_COUNT" -eq 0 ]; then
    echo "No users found. Create one:"
    echo "  docker exec $CONTAINER ./manage_users add <username> <password>"
fi
