#!/bin/bash
# ============================================================
# 待办·墨记 — 生产部署脚本 (systemd + gunicorn)
# 用法: sudo bash deploy.sh
# ============================================================

set -e

APP_NAME="todo-moji"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=${TODO_PORT:-24175}
USER=$(whoami)

echo "=== 待办·墨记 — 部署 ==="
echo "目录: $APP_DIR"
echo "端口: $PORT"
echo "用户: $USER"

# 1. 虚拟环境 + 依赖
cd "$APP_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt -q
pip install gunicorn -q

# 2. 初始化数据库
python3 -c "from app import init_db; init_db()"

# 3. 创建 systemd 服务
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Todo Moji - 待办墨记
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
Environment=TODO_PORT=$PORT
Environment=TODO_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
ExecStart=$APP_DIR/venv/bin/gunicorn -w 2 -b 0.0.0.0:$PORT app:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 4. 启动服务
systemctl daemon-reload
systemctl enable "$APP_NAME"
systemctl restart "$APP_NAME"

echo ""
echo "=== 部署完成 ==="
echo "服务状态: systemctl status $APP_NAME"
echo "查看日志: journalctl -u $APP_NAME -f"
echo "访问地址: http://<你的服务器IP>:$PORT"
echo "管理员: admin / admin123 (请及时修改密码)"
