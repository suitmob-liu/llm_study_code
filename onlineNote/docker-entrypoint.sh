#!/bin/bash
set -e

# Ensure data directory is writable
mkdir -p /app/data

exec "$@"
