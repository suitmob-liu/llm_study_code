#!/bin/bash
# ============================================================
# 待办·墨记 — 一键启动脚本
# 用法: bash start.sh
# 端口: 24175 (可通过 TODO_PORT 环境变量修改)
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 Python3
if ! command -v python3 &>/dev/null; then
    echo "[错误] 未找到 python3，请先安装 Python 3.8+"
    exit 1
fi

# 创建虚拟环境（首次运行）
if [ ! -d "venv" ]; then
    echo "[初始化] 创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
echo "[依赖] 安装 Python 依赖..."
pip install -r requirements.txt -q

# 启动
export TODO_PORT=${TODO_PORT:-24175}
echo ""
echo "============================================="
echo "  待办·墨记 启动中..."
echo "  地址: http://0.0.0.0:${TODO_PORT}"
echo "  管理员: admin / admin123"
echo "============================================="
echo ""

python3 app.py
