#!/usr/bin/env bash
# goldMonitor 一键 Docker 部署 / 重部署脚本
#
# 默认流程：自动测速选 pip 镜像 → 构建（旧服务不停）→ 替换容器 → 等健康检查
# 默认保留数据卷（行情、预测记录、模型不丢）。要彻底重置请加 --purge。
#
# 用法：
#   bash deploy.sh                    默认部署（端口取 .env 的 PORT，默认 1012）
#   bash deploy.sh --port 8080        指定宿主机端口
#   bash deploy.sh --mirror URL       指定 pip 镜像源，不测速（构建成功后保存到 .env）
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
env_set() {  # 写入或替换 .env 中的一项
    if grep -qE "^$1=" .env; then
        sed -i "s#^$1=.*#$1=$2#" .env
    else
        printf '%s=%s\n' "$1" "$2" >> .env
    fi
}

PORT="${PORT_ARG:-$(env_get PORT)}"
PORT="${PORT:-1012}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    err "端口号无效：$PORT"; exit 1
fi
export PORT
export DOCKER_BUILDKIT=1

# ---- pip 镜像：自动测速选择 ----
# 候选镜像（云内网镜像只在对应云厂商的服务器上可用，其他环境会测速失败被跳过）
MIRRORS=(
    "http://mirrors.tencentyun.com/pypi/simple"
    "http://mirrors.cloud.aliyuncs.com/pypi/simple"
    "https://mirrors.cloud.tencent.com/pypi/simple"
    "https://mirrors.aliyun.com/pypi/simple"
    "https://pypi.tuna.tsinghua.edu.cn/simple"
    "https://pypi.org/simple"
)
# 测速文件：pandas 安装包（依赖中最大的一个），只下载前 1MB
PROBE_FILE="e5/63/cd7d615331b328e287d8233ba9fdf191a9c2d11b6af0c7a59cfcec23de68/pandas-2.3.3-cp312-cp312-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl"
MIN_SPEED=$((300 * 1024))   # 低于 300KB/s 视为过慢

trusted_host_of() { [[ "$1" == http://* ]] && echo "$1" | sed -E 's#^http://([^/:]+).*#\1#' || true; }

probe_speed() {  # 输出该镜像的下载速度（字节/秒），不可用时输出 0
    local base="$1" url out code size speed
    if [[ "$base" == *"pypi.org/simple"* ]]; then
        url="https://files.pythonhosted.org/packages/$PROBE_FILE"
    else
        url="${base%/simple}/packages/$PROBE_FILE"
    fi
    out=$(curl -s --noproxy '*' -r 0-1048575 -m 6 -o /dev/null \
          -w '%{http_code} %{size_download} %{speed_download}' "$url" 2>/dev/null || true)
    read -r code size speed <<< "${out:-0 0 0}"
    size="${size%%[.,]*}"; size="${size:-0}"
    speed="${speed%%[.,]*}"; speed="${speed:-0}"
    [[ "$size" =~ ^[0-9]+$ && "$speed" =~ ^[0-9]+$ ]] || { echo 0; return; }
    if [[ "$code" =~ ^20[06]$ ]] && (( size > 65536 )); then echo "$speed"; else echo 0; fi
}

fmt_speed() { awk -v s="$1" 'BEGIN { if (s >= 1048576) printf "%.1f MB/s", s/1048576; else printf "%.0f KB/s", s/1024 }'; }

# 结果：CANDIDATES 数组，按优先级排列，构建失败时依次换下一个
choose_mirrors() {
    CANDIDATES=()
    if [[ -n "$MIRROR_ARG" ]]; then
        CANDIDATES=("$MIRROR_ARG")
        return
    fi
    if ! command -v curl >/dev/null 2>&1; then
        warn "未安装 curl，无法测速，使用 .env 中的镜像"
        CANDIDATES=("$(env_get PIP_INDEX_URL)")
        [[ -n "${CANDIDATES[0]}" ]] || CANDIDATES=("${MIRRORS[2]}")
        return
    fi
    local current speed
    current="$(env_get PIP_INDEX_URL)"
    if [[ -n "$current" ]]; then
        speed=$(probe_speed "$current")
        if (( speed >= MIN_SPEED )); then
            echo "    当前镜像 $current：$(fmt_speed "$speed")，直接使用"
            CANDIDATES=("$current")
            # 备选：万一构建中途失败
            for m in "${MIRRORS[@]}"; do [[ "$m" == "$current" ]] || CANDIDATES+=("$m"); done
            return
        fi
        echo "    当前镜像 $current：$( ((speed)) && fmt_speed "$speed" || echo '不可用')，过慢，自动测速选择…"
    fi
    # 并行测速
    local tmp; tmp=$(mktemp -d)
    local i=0
    for m in "${MIRRORS[@]}"; do
        ( probe_speed "$m" > "$tmp/$i" ) &
        i=$((i + 1))
    done
    wait
    local lines=()
    i=0
    for m in "${MIRRORS[@]}"; do
        speed=$(cat "$tmp/$i" 2>/dev/null || echo 0)
        printf "      %-52s %s\n" "$m" "$( ((speed)) && fmt_speed "$speed" || echo '不可用')"
        (( speed > 0 )) && lines+=("$speed $m")
        i=$((i + 1))
    done
    rm -rf "$tmp"
    if (( ${#lines[@]} == 0 )); then
        warn "所有镜像测速都失败（服务器可能无法访问外网），按默认顺序尝试"
        CANDIDATES=("${MIRRORS[@]}")
        return
    fi
    while read -r _ m; do CANDIDATES+=("$m"); done < <(printf '%s\n' "${lines[@]}" | sort -rn)
}

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

# ---- 清旧镜像 ----
if (( CLEAN == 1 )); then
    log "删除旧镜像 $IMAGE"
    docker rmi -f "$IMAGE" 2>&1 | sed 's/^/    /' || echo "    （没有旧镜像）"
fi

# ---- 构建（旧容器继续运行，构建成功后才替换，失败不影响线上服务） ----
if (( NO_BUILD == 0 )); then
    log "选择 pip 镜像"
    choose_mirrors
    BUILD_ARGS=()
    (( CLEAN == 1 )) && BUILD_ARGS+=(--no-cache)
    built=0
    tries=0
    for mirror in "${CANDIDATES[@]}"; do
        (( tries >= 3 )) && break
        tries=$((tries + 1))
        PIP_INDEX_URL="$mirror"
        PIP_TRUSTED_HOST="$(trusted_host_of "$mirror")"
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
    # 记住可用的镜像，下次直接使用，Docker 构建缓存也能命中
    env_set PIP_INDEX_URL "$PIP_INDEX_URL"
    env_set PIP_TRUSTED_HOST "$PIP_TRUSTED_HOST"
    ok "构建完成（已将 pip 镜像保存到 .env）"
else
    log "跳过构建（--no-build）"
fi

# ---- 替换容器 ----
log "停止旧容器"
if (( PURGE == 1 )); then
    "${COMPOSE[@]}" down --remove-orphans --volumes 2>&1 | sed 's/^/    /' || true
    docker volume rm "${PROJECT}_gold_data" >/dev/null 2>&1 || true
    ok "数据卷已删除"
else
    "${COMPOSE[@]}" down --remove-orphans 2>&1 | sed 's/^/    /' || true
fi
# 兼容旧版本（未固定项目名时）遗留的同名容器
docker rm -f gold-analyzer >/dev/null 2>&1 || true

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
echo "    本机地址：http://127.0.0.1:${PORT}"
echo "    首次启动会在后台下载近两年行情并训练模型，约需 1 分钟，网页会显示“下载中”"
echo "    跟踪日志：bash deploy.sh --logs  或  docker compose -p $PROJECT logs -f"
echo "    停止服务：bash deploy.sh --stop"

if (( FOLLOW_LOGS == 1 )); then
    log "跟踪日志（Ctrl-C 退出，服务继续运行）"
    "${COMPOSE[@]}" logs -f
fi
