#!/usr/bin/env bash
# cloudfile 一键 Docker 部署 / 重部署脚本
#
# 默认流程：停旧容器 → 复用 layer cache 增量构建 → 启动 → 等 health check
# 默认保留数据 volume（文档不丢）。要彻底重置请加 --purge。
# 遇到 cache 玄学问题（很少见）用 --clean 走干净重建。
#
# 用法：
#   ./scripts/deploy.sh                  默认快速部署（端口 5494，复用缓存）
#   bash scripts/deploy.sh               如果脚本没可执行位
#   scripts/deploy.sh --port 8080        指定端口
#   scripts/deploy.sh --clean            清旧镜像 + --no-cache 重建（慢，兜底用）
#   scripts/deploy.sh --purge            清数据 volume 后部署（慎用！会丢文档）
#   scripts/deploy.sh --no-build         跳过构建直接重启（容器在就复用）
#   scripts/deploy.sh --logs             部署完成后跟踪日志

# 若被 `sh script.sh` 调用（Dash/POSIX sh 不认 bashism），自动重启到 bash。
# Ubuntu/Debian 的 /bin/sh 默认指向 Dash，不支持 pipefail / [[ ]] / 数组等。
if [ -z "${BASH_VERSION:-}" ]; then
    if command -v bash >/dev/null 2>&1; then
        exec bash "$0" "$@"
    fi
    echo "ERROR: 此脚本需要 bash，请安装：apt install bash" >&2
    exit 1
fi

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 默认参数
PORT="${HOST_PORT:-5494}"
CLEAN=0
PURGE=0
NO_BUILD=0
FOLLOW_LOGS=0
HEALTH_TIMEOUT_SEC=60

# ---- 颜色 ----
if [[ -t 1 ]]; then
    C_INFO='\033[1;34m'  # 蓝
    C_OK='\033[1;32m'    # 绿
    C_WARN='\033[1;33m'  # 黄
    C_ERR='\033[1;31m'   # 红
    C_OFF='\033[0m'
else
    C_INFO='' C_OK='' C_WARN='' C_ERR='' C_OFF=''
fi

log()  { printf "${C_INFO}==> %s${C_OFF}\n" "$*"; }
ok()   { printf "${C_OK}✅ %s${C_OFF}\n" "$*"; }
warn() { printf "${C_WARN}⚠  %s${C_OFF}\n" "$*"; }
err()  { printf "${C_ERR}❌ %s${C_OFF}\n" "$*" >&2; }

usage() {
    sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

# ---- 解析参数 ----
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)      PORT="$2"; shift 2 ;;
        --clean)     CLEAN=1; shift ;;
        --purge)     PURGE=1; shift ;;
        --no-build)  NO_BUILD=1; shift ;;
        --logs)      FOLLOW_LOGS=1; shift ;;
        -h|--help)   usage 0 ;;
        *)           err "未知参数：$1"; usage 1 ;;
    esac
done

# ---- 前置检查 ----
command -v docker >/dev/null || { err "未找到 docker 命令"; exit 1; }

# docker compose v2 (plugin) 优先；回落到 docker-compose v1
# v1 已 EOL（2023-07），但语法几乎一致，脚本仍兼容
if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
    warn "检测到 docker-compose v1（已 EOL）。建议升级到 v2 插件："
    warn "    sudo apt install docker-compose-plugin  # Ubuntu/Debian"
    warn "    或参考 https://docs.docker.com/compose/install/linux/"
else
    err "未找到 docker compose。安装方式："
    err "    推荐：sudo apt install docker-compose-plugin"
    err "    兼容（v1）：sudo apt install docker-compose"
    exit 1
fi
echo "    compose 命令：${COMPOSE[*]}"

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    err "端口号无效：$PORT"
    exit 1
fi

log "部署配置："
echo "    宿主机端口：$PORT"
echo "    项目根：    $ROOT"
echo "    干净重建：  $([ $CLEAN -eq 1 ] && echo 是（--no-cache） || echo 否（复用 layer cache）)"
echo "    清空数据：  $([ $PURGE -eq 1 ] && echo 是 || echo 否)"
echo "    跳过构建：  $([ $NO_BUILD -eq 1 ] && echo 是 || echo 否)"

# ---- 停旧容器 ----
log "停止并移除旧容器"
"${COMPOSE[@]}" down --remove-orphans 2>&1 | sed 's/^/    /' || true

# ---- 清旧镜像（仅 --clean 模式） ----
# 正常模式保留旧镜像，让 Docker layer cache 生效。
# 旧镜像层不占新 build 的路径，只是多挂在磁盘上；Docker GC 自己管。
if (( CLEAN == 1 )); then
    log "清理旧的 cloudfile-backend 镜像（--clean）"
    OLD_IMAGES=$(docker images -q cloudfile-backend 2>/dev/null || true)
    if [[ -n "$OLD_IMAGES" ]]; then
        # shellcheck disable=SC2086
        docker rmi -f $OLD_IMAGES 2>&1 | sed 's/^/    /' || true
    else
        echo "    （没有旧镜像）"
    fi
fi

# ---- 可选清 volume ----
if (( PURGE == 1 )); then
    warn "PURGE 模式将删除所有文档数据"
    read -r -p "    输入 yes 确认继续： " confirm
    if [[ "$confirm" != "yes" ]]; then
        err "已取消"
        exit 1
    fi
    log "删除数据 volume"
    # compose v2 的 volume 前缀是项目目录名
    PROJECT_NAME=$(basename "$ROOT")
    docker volume rm "${PROJECT_NAME}_cloudfile-data" 2>/dev/null \
        || warn "volume 不存在或已被删除，跳过"
fi

# ---- 构建 ----
# 默认复用 Docker layer cache + BuildKit cache mount（vcpkg downloads/编译产物跨 build 持久化）。
# 改 src 只触发 cmake build 层重跑，vcpkg install 层命中 cache 秒过。
# --clean 模式强制 --no-cache（+ 配合上面的 rmi），整套从头走。
BUILD_ARGS=()
if (( CLEAN == 1 )); then
    BUILD_ARGS+=(--no-cache)
    BUILD_MSG="构建镜像（--clean / --no-cache，预计 20-40 分钟）"
else
    BUILD_MSG="构建镜像（复用 cache，首次约 20-40 分钟，改代码后重跑几十秒~几分钟）"
fi

if (( NO_BUILD == 0 )); then
    log "$BUILD_MSG"
    HOST_PORT="$PORT" "${COMPOSE[@]}" build "${BUILD_ARGS[@]}"
    ok "构建完成"
else
    log "跳过构建（--no-build）"
fi

# ---- 启动 ----
log "启动 cloudfile（宿主机端口 $PORT → 容器端口 8080）"
HOST_PORT="$PORT" "${COMPOSE[@]}" up -d

# ---- 等 health check ----
log "等待服务就绪（最长 ${HEALTH_TIMEOUT_SEC}s）"
start_ts=$(date +%s)
while true; do
    elapsed=$(( $(date +%s) - start_ts ))
    if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        printf "\n"
        ok "cloudfile 已就绪"
        echo "    健康检查："
        curl -s "http://localhost:${PORT}/api/health" | sed 's/^/        /'
        echo
        echo "    访问地址：http://localhost:${PORT}"
        echo "    跟踪日志：${COMPOSE[*]} logs -f"
        echo "    停止服务：${COMPOSE[*]} down"

        if (( FOLLOW_LOGS == 1 )); then
            log "跟踪日志（Ctrl-C 退出，服务继续运行）"
            "${COMPOSE[@]}" logs -f
        fi
        exit 0
    fi

    if (( elapsed >= HEALTH_TIMEOUT_SEC )); then
        printf "\n"
        err "health check 失败（${HEALTH_TIMEOUT_SEC}s 超时）"
        echo "    最近 60 行日志："
        "${COMPOSE[@]}" logs --tail=60 | sed 's/^/        /'
        exit 1
    fi

    printf "."
    sleep 2
done
