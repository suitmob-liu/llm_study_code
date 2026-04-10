#!/bin/bash
# ============================================================
# 待办·墨记 — Docker 一键部署/重部署脚本
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
IMAGE_NAME="todo-todo"
COMPOSE_CMD=""

# 检测可用的 compose 命令
if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    echo -e "\033[0;31m[ERROR]\033[0m 未找到 docker compose 或 docker-compose，请先安装"
    exit 1
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
        info "停止容器 ${CONTAINER_NAME}..."
        $COMPOSE_CMD down
    fi
}

# ------------------------------------------------------------
# 清理旧镜像（悬空镜像 + 本项目旧镜像）
# ------------------------------------------------------------
clean_images() {
    info "清理旧镜像..."
    # 删除悬空镜像（none标签）
    dangling=$(docker images -f "dangling=true" -q 2>/dev/null)
    if [ -n "$dangling" ]; then
        docker rmi $dangling 2>/dev/null || true
        info "已清理悬空镜像"
    fi
    # 删除本项目旧镜像
    old_images=$(docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep "${IMAGE_NAME}" | awk '{print $2}')
    if [ -n "$old_images" ]; then
        docker rmi $old_images 2>/dev/null || true
        info "已清理项目旧镜像"
    fi
}

# ------------------------------------------------------------
# 构建并启动
# ------------------------------------------------------------
build_and_start() {
    info "构建镜像..."
    $COMPOSE_CMD build --no-cache

    info "启动容器..."
    $COMPOSE_CMD up -d

    # 等待启动
    sleep 2
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo ""
        info "部署成功！"
        PORT=$(docker port "${CONTAINER_NAME}" 24175 2>/dev/null | head -1 | cut -d: -f2)
        info "访问地址: http://<服务器IP>:${PORT:-24175}"
        info "管理员: admin / admin123"
        echo ""
    else
        error "启动失败，查看日志："
        $COMPOSE_CMD logs --tail 20
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
        if [ -d "data" ]; then
            rm -rf data
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
        $COMPOSE_CMD logs -f --tail 100
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
