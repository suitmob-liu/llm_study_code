#!/usr/bin/env bash
# goldMonitor 一键 Docker 部署 / 重部署脚本
#
# 默认流程：停旧容器 → 复用缓存增量构建 → 启动 → 等健康检查
# 默认保留数据卷（行情、预测记录、模型不丢）。要彻底重置请加 --purge。
#
# 用法：
#   bash deploy.sh                    默认部署（端口取 .env 的 PORT，默认 1012）
#   bash deploy.sh --port 8080        指定宿主机端口
#   bash deploy.sh --mirror URL       临时指定 pip 镜像源（http 内网镜像会自动加 trusted-host）
#   bash deploy.sh --clean            删除旧镜像 + --no-cache 重建（pip 下载缓存保留）
#   bash deploy.sh --purge            删除数据卷后重新部署（会丢所有数据，需输入 yes 确认）
#   bash deploy.sh --purge --yes      同上，跳过确认
#   bash deploy.sh --no-build         跳过构建，直接用现有镜像重启
#   bash deploy.sh --stop             停止并移除容器（保留数据卷和镜像）
#   bash deploy.sh --logs             部署完成后跟踪日志

# 被 `sh deploy.sh` 调用时（Ubuntu 的 sh 是 dash）自动切换到 bash
if [ -z "${BASH_VERSION:-}" ]; then
    if command -v bash >/dev/null 2>&1; then
        exec bash "$0" "$@"
    fi
    echo "ERROR: 此脚本需要 bash" >&2
    exit 1
fi

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PROJECT=goldmonitor          # 固定 compose 项目名，数据卷名为 goldmonitor_gold_data
IMAGE=gold-analyzer:latest
HEALTH_TIMEOUT_SEC=90

CLEAN=0
PURGE=0
ASSUME_YES=0
NO_BUILD=0
STOP_ONLY=0
FOLLOW_LOGS=0
PORT_ARG=""
MIRROR_ARG=""

# ---- 颜色 ----
if [[ -t 1 ]]; then
    C_INFO='\033[1;34m'; C_OK='\033[1;32m'; C_WARN='\033[1;33m'; C_ERR='\033[1;31m'; C_OFF='\033[0m'
else
    C_INFO='' C_OK='' C_WARN='' C_ERR='' C_OFF=''
fi
log()  { printf "${C_INFO}==> %s${C_OFF}\n" "$*"; }
ok()   { printf "${C_OK}✅ %s${C_OFF}\n" "$*"; }
warn() { printf "${C_WARN}⚠  %s${C_OFF}\n" "$*"; }
err()  { printf "${C_ERR}❌ %s${C_OFF}\n" "$*" >&2; }

usage() {
    sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

# ---- 解析参数 ----
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)      PORT_ARG="${2:-}"; shift 2 ;;
        --mirror)    MIRROR_ARG="${2:-}"; shift 2 ;;
        --clean)     CLEAN=1; shift ;;
        --purge)     PURGE=1; shift ;;
        -y|--yes)    ASSUME_YES=1; shift ;;
        --no-build)  NO_BUILD=1; shift ;;
        --stop)      STOP_ONLY=1; shift ;;
        --logs)      FOLLOW_LOGS=1; shift ;;
        -h|--help)   usage 0 ;;
        *)           err "未知参数：$1"; usage 1 ;;
    esac
done

# ---- 前置检查 ----
command -v docker >/dev/null || { err "未找到 docker，安装：curl -fsSL https://get.docker.com | sh"; exit 1; }
if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose -p "$PROJECT")
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose -p "$PROJECT")
    warn "检测到 docker-compose v1（已停止维护），建议安装 docker-compose-plugin"
else
    err "未找到 docker compose，安装：sudo apt install docker-compose-plugin"
    exit 1
fi

# ---- .env ----
if [[ ! -f .env ]]; then
    cp .env.example .env
    ok "已根据 .env.example 生成 .env（可修改端口、刷新间隔、口令、代理、pip 镜像）"
fi
env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }

PORT="${PORT_ARG:-$(env_get PORT)}"
PORT="${PORT:-1012}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    err "端口号无效：$PORT"; exit 1
fi
export PORT

PIP_INDEX_URL="${MIRROR_ARG:-$(env_get PIP_INDEX_URL)}"
PIP_INDEX_URL="${PIP_INDEX_URL:-https://mirrors.cloud.tencent.com/pypi/simple}"
PIP_TRUSTED_HOST="$(env_get PIP_TRUSTED_HOST)"
if [[ -n "$MIRROR_ARG" ]]; then
    PIP_TRUSTED_HOST=""
    [[ "$PIP_INDEX_URL" == http://* ]] && PIP_TRUSTED_HOST="$(echo "$PIP_INDEX_URL" | sed -E 's#^http://([^/:]+).*#\1#')"
fi
export PIP_INDEX_URL PIP_TRUSTED_HOST
export DOCKER_BUILDKIT=1

# ---- 仅停止 ----
if (( STOP_ONLY == 1 )); then
    log "停止并移除容器（数据卷与镜像保留）"
    "${COMPOSE[@]}" down --remove-orphans
    ok "已停止"
    exit 0
fi

log "部署配置："
echo "    项目目录：  $ROOT"
echo "    宿主机端口：$PORT  →  容器 8000"
echo "    pip 镜像：  $PIP_INDEX_URL${PIP_TRUSTED_HOST:+（trusted-host $PIP_TRUSTED_HOST）}"
echo "    干净重建：  $( ((CLEAN)) && echo '是（删除旧镜像，--no-cache）' || echo '否（复用缓存）')"
echo "    清空数据：  $( ((PURGE)) && echo '是' || echo '否')"
echo "    跳过构建：  $( ((NO_BUILD)) && echo '是' || echo '否')"

if (( NO_BUILD == 1 )) && ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    err "镜像 $IMAGE 不存在，不能使用 --no-build"; exit 1
fi

# ---- 清空数据确认 ----
if (( PURGE == 1 && ASSUME_YES == 0 )); then
    warn "--purge 将删除数据卷 ${PROJECT}_gold_data：行情、预测记录、模型、国际情景全部清空"
    read -r -p "    输入 yes 确认继续： " confirm
    [[ "$confirm" == "yes" ]] || { err "已取消"; exit 1; }
fi

# ---- 停旧容器 ----
log "停止并移除旧容器"
if (( PURGE == 1 )); then
    "${COMPOSE[@]}" down --remove-orphans --volumes 2>&1 | sed 's/^/    /' || true
    docker volume rm "${PROJECT}_gold_data" >/dev/null 2>&1 || true
    ok "数据卷已删除"
else
    "${COMPOSE[@]}" down --remove-orphans 2>&1 | sed 's/^/    /' || true
fi
# 兼容旧版本（未固定项目名时）遗留的同名容器
docker rm -f gold-analyzer >/dev/null 2>&1 || true

# ---- 清旧镜像 ----
if (( CLEAN == 1 )); then
    log "删除旧镜像 $IMAGE"
    docker rmi -f "$IMAGE" 2>&1 | sed 's/^/    /' || echo "    （没有旧镜像）"
fi

# ---- 构建 ----
if (( NO_BUILD == 0 )); then
    BUILD_ARGS=()
    (( CLEAN == 1 )) && BUILD_ARGS+=(--no-cache)
    log "构建镜像（首次需要下载 Python 依赖，之后改代码重建只需几秒）"
    "${COMPOSE[@]}" build "${BUILD_ARGS[@]}"
    ok "构建完成"
else
    log "跳过构建（--no-build）"
fi

# ---- 启动 ----
log "启动服务"
"${COMPOSE[@]}" up -d

# ---- 等健康检查 ----
health() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsS --noproxy '*' "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1
    else
        docker exec gold-analyzer python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)" >/dev/null 2>&1
    fi
}
log "等待服务就绪（最长 ${HEALTH_TIMEOUT_SEC}s）"
start_ts=$(date +%s)
until health; do
    if (( $(date +%s) - start_ts >= HEALTH_TIMEOUT_SEC )); then
        printf "\n"
        err "健康检查超时，最近 60 行日志："
        "${COMPOSE[@]}" logs --tail=60 | sed 's/^/    /'
        exit 1
    fi
    printf "."
    sleep 2
done
printf "\n"
ok "goldMonitor 已就绪"
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "    访问地址：http://${IP:-localhost}:${PORT}"
echo "    首次启动会在后台下载近两年行情并训练模型，约需 1 分钟，网页会显示“下载中”"
echo "    跟踪日志：bash deploy.sh --logs  或  docker compose -p $PROJECT logs -f"
echo "    停止服务：bash deploy.sh --stop"

if (( FOLLOW_LOGS == 1 )); then
    log "跟踪日志（Ctrl-C 退出，服务继续运行）"
    "${COMPOSE[@]}" logs -f
fi
