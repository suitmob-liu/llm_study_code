#!/usr/bin/env bash
# netDisk 一键 Docker 部署 / 重部署脚本
#
# 默认流程：检查 .env（没设密码会提示设置）→ 构建镜像（旧服务不停）→ 替换容器 → 等健康检查
# 默认保留数据卷（网盘文件、登录设备不丢）。要彻底清空请加 --purge。
#
# 用法：
#   bash deploy.sh                    默认部署（端口取 .env 的 PORT，默认 8686）
#   bash deploy.sh --port 8080        指定宿主机端口（保存到 .env）
#   bash deploy.sh --password XXX     设置 / 修改登录密码（保存到 .env，所有设备需重新登录）
#   bash deploy.sh --mirror URL       指定 pip 镜像源（构建成功后保存到 .env）
#   bash deploy.sh --clean            删除旧镜像 + --no-cache 重建
#   bash deploy.sh --purge            删除数据卷后重新部署（网盘文件全部丢失，需输入 yes 确认）
#   bash deploy.sh --purge --yes      同上，跳过确认
#   bash deploy.sh --no-build         跳过构建，直接用现有镜像重启（改了 .env 配置时用）
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

PROJECT=netdisk              # 固定 compose 项目名，数据卷名为 netdisk_netdisk_data
VOLUME="${PROJECT}_netdisk_data"
IMAGE=netdisk:latest
HEALTH_TIMEOUT_SEC=60

CLEAN=0
PURGE=0
ASSUME_YES=0
NO_BUILD=0
STOP_ONLY=0
FOLLOW_LOGS=0
PORT_ARG=""
MIRROR_ARG=""
PASSWORD_ARG=""

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
    sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

# ---- 解析参数 ----
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)      PORT_ARG="${2:-}"; shift 2 ;;
        --password)  PASSWORD_ARG="${2:-}"; shift 2 ;;
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

# ---- 仅停止 ----
if (( STOP_ONLY == 1 )); then
    log "停止并移除容器（数据卷与镜像保留）"
    "${COMPOSE[@]}" down --remove-orphans
    ok "已停止"
    exit 0
fi

# ---- .env ----
if [[ ! -f .env ]]; then
    cp .env.example .env
    chmod 600 .env
    ok "已根据 .env.example 生成 .env"
fi
env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
env_set() {  # 写入或替换 .env 中的一项（值里可能有 # & / 等字符，不用 sed 替换）
    local tmp; tmp=$(mktemp)
    grep -vE "^$1=" .env > "$tmp" || true
    printf '%s=%s\n' "$1" "$2" >> "$tmp"
    cat "$tmp" > .env
    rm -f "$tmp"
}

# ---- 密码 ----
# docker compose 读 .env 时会解析 $ 引号 # 等字符，这些字符不允许出现在密码里
PASSWORD_RULE="密码至少 6 位，不能包含空格和 \$ ' \" # \\ \` 字符"
bad_password() {
    local re='[[:space:]$'"'"'"#\\`]'
    [[ ${#1} -lt 6 || "$1" =~ $re ]]
}
if [[ -n "$PASSWORD_ARG" ]]; then
    if bad_password "$PASSWORD_ARG"; then err "$PASSWORD_RULE"; exit 1; fi
    env_set NETDISK_PASSWORD "$PASSWORD_ARG"
    ok "登录密码已更新（所有设备需要重新登录）"
fi
PASSWORD="$(env_get NETDISK_PASSWORD)"
if (( ${#PASSWORD} < 6 )); then
    if [[ -t 0 ]]; then
        warn "还没有设置登录密码（至少 6 位）"
        while true; do
            read -r -s -p "    请输入登录密码： " p1; echo
            read -r -s -p "    再输入一次：     " p2; echo
            if bad_password "$p1"; then warn "$PASSWORD_RULE"; continue; fi
            if [[ "$p1" != "$p2" ]]; then warn "两次输入不一致"; continue; fi
            break
        done
        env_set NETDISK_PASSWORD "$p1"
        ok "密码已保存到 .env"
    else
        p1="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 16)"
        env_set NETDISK_PASSWORD "$p1"
        warn "未设置密码且非交互模式，已生成随机密码：$p1 （保存在 .env，可用 --password 修改）"
    fi
fi

if [[ -n "$PORT_ARG" ]]; then env_set PORT "$PORT_ARG"; fi
PORT="$(env_get PORT)"
PORT="${PORT:-8686}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    err "端口号无效：$PORT"; exit 1
fi
export PORT
export DOCKER_BUILDKIT=1

log "部署配置："
echo "    项目目录：  $ROOT"
echo "    宿主机端口：$PORT  →  容器 8000"
echo "    容量上限：  $(env_get NETDISK_QUOTA_GB || true) GB    设备上限：$(env_get NETDISK_MAX_DEVICES || true) 台"
echo "    干净重建：  $( ((CLEAN)) && echo '是（删除旧镜像，--no-cache）' || echo '否（复用缓存）')"
echo "    清空数据：  $( ((PURGE)) && echo '是' || echo '否')"
echo "    跳过构建：  $( ((NO_BUILD)) && echo '是' || echo '否')"

if (( NO_BUILD == 1 )) && ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    err "镜像 $IMAGE 不存在，不能使用 --no-build"; exit 1
fi

# ---- 清空数据确认 ----
if (( PURGE == 1 && ASSUME_YES == 0 )); then
    warn "--purge 将删除数据卷 ${VOLUME}：网盘里的所有文件、登录设备全部清空，无法恢复"
    read -r -p "    输入 yes 确认继续： " confirm
    [[ "$confirm" == "yes" ]] || { err "已取消"; exit 1; }
fi

# ---- 清旧镜像 ----
if (( CLEAN == 1 )); then
    log "删除旧镜像 $IMAGE"
    docker rmi -f "$IMAGE" 2>&1 | sed 's/^/    /' || echo "    （没有旧镜像）"
fi

# ---- 构建（旧容器继续运行，构建成功后才替换，失败不影响线上服务） ----
trusted_host_of() { [[ "$1" == http://* ]] && echo "$1" | sed -E 's#^http://([^/:]+).*#\1#' || true; }

if (( NO_BUILD == 0 )); then
    CANDIDATES=()
    if [[ -n "$MIRROR_ARG" ]]; then
        CANDIDATES=("$MIRROR_ARG")
    else
        current="$(env_get PIP_INDEX_URL)"
        [[ -n "$current" ]] && CANDIDATES+=("$current")
        for m in "https://mirrors.cloud.tencent.com/pypi/simple" \
                 "https://mirrors.aliyun.com/pypi/simple" \
                 "https://pypi.tuna.tsinghua.edu.cn/simple" \
                 "https://pypi.org/simple"; do
            [[ "$m" == "$current" ]] || CANDIDATES+=("$m")
        done
    fi
    BUILD_ARGS=()
    (( CLEAN == 1 )) && BUILD_ARGS+=(--no-cache)
    built=0
    tries=0
    for mirror in "${CANDIDATES[@]}"; do
        (( tries >= 3 )) && break
        tries=$((tries + 1))
        PIP_INDEX_URL="$mirror"
        if [[ "$mirror" == "$(env_get PIP_INDEX_URL)" && -n "$(env_get PIP_TRUSTED_HOST)" ]]; then
            PIP_TRUSTED_HOST="$(env_get PIP_TRUSTED_HOST)"
        else
            PIP_TRUSTED_HOST="$(trusted_host_of "$mirror")"
        fi
        export PIP_INDEX_URL PIP_TRUSTED_HOST
        log "构建镜像（第 $tries 次，pip 镜像：$mirror）"
        if "${COMPOSE[@]}" build "${BUILD_ARGS[@]}"; then
            built=1
            break
        fi
        warn "使用 $mirror 构建失败，换下一个镜像重试"
    done
    if (( built == 0 )); then
        err "构建失败（已尝试 $tries 个镜像），线上服务未受影响"
        err "可指定镜像重试：bash deploy.sh --mirror <pip镜像地址>"
        exit 1
    fi
    env_set PIP_INDEX_URL "$PIP_INDEX_URL"
    env_set PIP_TRUSTED_HOST "$PIP_TRUSTED_HOST"
    ok "构建完成"
else
    log "跳过构建（--no-build）"
fi

# ---- 替换容器 ----
log "停止旧容器"
if (( PURGE == 1 )); then
    "${COMPOSE[@]}" down --remove-orphans --volumes 2>&1 | sed 's/^/    /' || true
    docker volume rm "$VOLUME" >/dev/null 2>&1 || true
    ok "数据卷已删除"
else
    "${COMPOSE[@]}" down --remove-orphans 2>&1 | sed 's/^/    /' || true
fi

log "启动服务"
"${COMPOSE[@]}" up -d

# ---- 等健康检查 ----
health() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsS --noproxy '*' "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1
    else
        docker exec netdisk python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)" >/dev/null 2>&1
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
ok "netDisk 已就绪"
echo "    本机地址：http://127.0.0.1:${PORT}"
echo "    外网访问：http://<服务器公网IP>:${PORT}（需在云服务器安全组 / 防火墙放行 ${PORT} 端口）"
echo "    登录密码：见 .env 中的 NETDISK_PASSWORD"
echo "    跟踪日志：bash deploy.sh --logs  或  docker compose -p $PROJECT logs -f"
echo "    停止服务：bash deploy.sh --stop"

if (( FOLLOW_LOGS == 1 )); then
    log "跟踪日志（Ctrl-C 退出，服务继续运行）"
    "${COMPOSE[@]}" logs -f
fi
