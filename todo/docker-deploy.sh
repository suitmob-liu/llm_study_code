#!/bin/bash
# ============================================================
# 待办·墨记 — Docker 一键部署/重部署脚本
# 纯 docker 命令，不依赖 docker-compose
#
# 用法:
#   bash docker-deploy.sh          # 构建并启动（保留数据）
#   bash docker-deploy.sh clean    # 清理旧镜像后重新构建启动（保留数据）
#   bash docker-deploy.sh purge    # 彻底清理（删除容器+镜像+数据库），慎用
#   bash docker-deploy.sh stop     # 仅停止容器
#   bash docker-deploy.sh logs     # 查看日志
#   bash docker-deploy.sh status   # 查看运行状态
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

CONTAINER_NAME="todo-moji"
IMAGE_NAME="todo-moji"
PORT=24175
DATA_DIR="${SCRIPT_DIR}/data"

# 从 .env 文件加载环境变量（如果存在）
ENV_ARGS=""
if [ -f ".env" ]; then
    while IFS='=' read -r key value; do
        # 跳过注释和空行
        [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
        # 去除行尾空格
        value=$(echo "$value" | sed 's/[[:space:]]*$//')
        [ -n "$value" ] && ENV_ARGS="${ENV_ARGS} -e ${key}=${value}"
    done < .env
fi

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ------------------------------------------------------------
# 显示当前状态
# ------------------------------------------------------------
show_status() {
    echo ""
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        info "容器运行中"
        docker ps --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    else
        warn "容器未运行"
    fi
    echo ""
}

# ------------------------------------------------------------
# 停止并移除容器
# ------------------------------------------------------------
stop_container() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        info "停止并移除容器 ${CONTAINER_NAME}..."
        docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
        docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    fi
}

# ------------------------------------------------------------
# 清理旧镜像（悬空镜像 + 本项目旧镜像）
# ------------------------------------------------------------
clean_images() {
    info "清理旧镜像..."
    # 删除悬空镜像
    dangling=$(docker images -f "dangling=true" -q 2>/dev/null)
    if [ -n "$dangling" ]; then
        docker rmi $dangling 2>/dev/null || true
        info "已清理悬空镜像"
    fi
    # 删除本项目旧镜像
    if docker images --format '{{.Repository}}' | grep -q "^${IMAGE_NAME}$"; then
        docker rmi "${IMAGE_NAME}" 2>/dev/null || true
        info "已清理项目旧镜像"
    fi
}

# ------------------------------------------------------------
# 构建并启动
# ------------------------------------------------------------
build_and_start() {
    # 确保数据目录存在
    mkdir -p "${DATA_DIR}"

    info "构建镜像 ${IMAGE_NAME}..."
    docker build --no-cache -t "${IMAGE_NAME}" .

    info "启动容器 ${CONTAINER_NAME}..."
    docker run -d \
        --name "${CONTAINER_NAME}" \
        --restart always \
        -p "${PORT}:${PORT}" \
        -v "${DATA_DIR}:/app/data" \
        ${ENV_ARGS} \
        "${IMAGE_NAME}"

    # 等待启动
    sleep 2
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo ""
        info "部署成功！"
        info "访问地址: http://<服务器IP>:${PORT}"
        info "管理员: admin / admin123"
        echo ""
    else
        error "启动失败，查看日志："
        docker logs --tail 30 "${CONTAINER_NAME}" 2>&1 || true
        exit 1
    fi
}

# ------------------------------------------------------------
# 主逻辑
# ------------------------------------------------------------
ACTION="${1:-deploy}"

case "$ACTION" in
    deploy|"")
        echo "=========================================="
        echo "  待办·墨记 — 部署"
        echo "=========================================="
        stop_container
        build_and_start
        ;;

    clean)
        echo "=========================================="
        echo "  待办·墨记 — 清理重部署"
        echo "  (保留数据库)"
        echo "=========================================="
        stop_container
        clean_images
        build_and_start
        ;;

    purge)
        echo "=========================================="
        echo "  待办·墨记 — 彻底清理"
        echo "=========================================="
        warn "将删除容器、镜像和数据库！"
        read -p "确认？(y/N) " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            info "已取消"
            exit 0
        fi
        stop_container
        clean_images
        if [ -d "${DATA_DIR}" ]; then
            rm -rf "${DATA_DIR}"
            info "已删除数据库目录 data/"
        fi
        info "清理完成。再次运行 bash docker-deploy.sh 可重新部署。"
        ;;

    stop)
        echo "=========================================="
        echo "  待办·墨记 — 停止"
        echo "=========================================="
        stop_container
        info "已停止"
        ;;

    logs)
        docker logs -f --tail 100 "${CONTAINER_NAME}"
        ;;

    status)
        echo "=========================================="
        echo "  待办·墨记 — 状态"
        echo "=========================================="
        show_status
        ;;

    *)
        echo "用法: bash docker-deploy.sh [命令]"
        echo ""
        echo "命令:"
        echo "  deploy  (默认) 构建并启动，保留数据"
        echo "  clean   清理旧镜像后重新构建，保留数据"
        echo "  purge   彻底清理（含数据库），慎用"
        echo "  stop    停止容器"
        echo "  logs    查看日志"
        echo "  status  查看运行状态"
        ;;
esac
