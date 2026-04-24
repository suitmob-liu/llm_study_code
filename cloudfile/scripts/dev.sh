#!/usr/bin/env bash
# 本地开发辅助脚本
# 用法：
#   scripts/dev.sh build    编译（需要本机装好 vcpkg）
#   scripts/dev.sh run      本地跑 backend（非 docker）
#   scripts/dev.sh docker   docker-compose 起全栈
#   scripts/dev.sh clean    删除 build 产物

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cmd=${1:-help}

case "$cmd" in
    build)
        : "${VCPKG_ROOT:?请先设置 VCPKG_ROOT 环境变量指向本机 vcpkg 克隆}"
        cmake -B out -G Ninja \
            -DCMAKE_BUILD_TYPE=Debug \
            -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
        cmake --build out --parallel
        ;;
    run)
        export CLOUDFILE_DEV=1
        export CLOUDFILE_DATA_ROOT="$ROOT/.local-data"
        mkdir -p "$CLOUDFILE_DATA_ROOT"
        exec "$ROOT/out/backend/cloudfile_backend"
        ;;
    docker)
        docker compose up --build
        ;;
    clean)
        rm -rf out build vcpkg_installed .local-data
        ;;
    test)
        : "${VCPKG_ROOT:?请先设置 VCPKG_ROOT}"
        cmake -B out -G Ninja \
            -DCMAKE_BUILD_TYPE=Debug \
            -DBUILD_TESTING=ON \
            -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
        cmake --build out --parallel
        ctest --test-dir out --output-on-failure
        ;;
    help|*)
        cat <<'EOF'
cloudfile 开发脚本

scripts/dev.sh <command>

  build    编译（需 VCPKG_ROOT 环境变量）
  run      本地跑 backend（需先 build）
  docker   docker-compose 起全栈
  test     编译并跑 ctest
  clean    删除 build 产物
EOF
        ;;
esac
