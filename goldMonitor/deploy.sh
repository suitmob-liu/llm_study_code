#!/usr/bin/env bash
# 一键部署 / 更新：bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "未检测到 docker，请先安装：curl -fsSL https://get.docker.com | sh" >&2
  exit 1
fi
[ -f .env ] || { cp .env.example .env; echo "已生成 .env，可按需修改端口、刷新间隔、口令、代理等"; }

docker compose up -d --build
echo
echo "部署完成，查看日志：docker compose logs -f"
PORT=$(grep -E '^PORT=' .env | cut -d= -f2); PORT=${PORT:-1012}
echo "访问地址：http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT}"
