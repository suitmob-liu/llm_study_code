#!/bin/bash
set -e

DEPS_DIR="deps"
mkdir -p "$DEPS_DIR" data

download() {
    local url="$1" dest="$2"
    if command -v curl &>/dev/null; then
        curl -fL -o "$dest" "$url"
    elif command -v wget &>/dev/null; then
        wget -q -O "$dest" "$url"
    else
        echo "Error: curl or wget is required"
        exit 1
    fi
}

# Download cpp-httplib (header-only HTTP library)
if [ ! -f "$DEPS_DIR/httplib.h" ]; then
    echo "Downloading cpp-httplib..."
    download "https://raw.githubusercontent.com/yhirose/cpp-httplib/v0.15.3/httplib.h" "$DEPS_DIR/httplib.h"
    echo "cpp-httplib downloaded."
fi

# Download SQLite3 amalgamation
if [ ! -f "$DEPS_DIR/sqlite3.c" ]; then
    echo "Downloading SQLite3 amalgamation..."
    SQLITE_ZIP="/tmp/sqlite3_$$.zip"
    SQLITE_TMP="/tmp/sqlite3_$$"

    # Try multiple versions in case one URL is unavailable
    download "https://www.sqlite.org/2024/sqlite-amalgamation-3460000.zip" "$SQLITE_ZIP" || \
    download "https://www.sqlite.org/2024/sqlite-amalgamation-3450000.zip" "$SQLITE_ZIP"

    mkdir -p "$SQLITE_TMP"
    unzip -o "$SQLITE_ZIP" -d "$SQLITE_TMP"
    cp "$SQLITE_TMP"/*/sqlite3.c "$DEPS_DIR/"
    cp "$SQLITE_TMP"/*/sqlite3.h "$DEPS_DIR/"
    rm -rf "$SQLITE_ZIP" "$SQLITE_TMP"
    echo "SQLite3 downloaded."
fi

echo ""
echo "All dependencies ready. Run 'make' to build."
echo "After building, add a user:  ./manage_users add <username> <password>"
echo "Then start the server:       ./server -p 8080"
