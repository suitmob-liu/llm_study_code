# 待办 · 墨记

墨纸禅风的待办事项管理系统。

## 功能

- 待办事项 CRUD，自动记录创建时间
- 可选截止日期，逾期高亮提醒
- 用户注册需管理员审核（最多 10 个用户）
- 管理员面板：审核/拒绝/删除用户
- 微信推送待办提醒（PushPlus / Server酱 / 企业微信）
- 响应式设计，支持移动端

## 快速启动

```bash
bash start.sh
```

访问 `http://localhost:24175`，默认管理员 `admin / admin123`。

## 生产部署 (Linux)

```bash
# 使用 systemd + gunicorn
sudo bash deploy.sh
```

## Docker 部署

```bash
# 一键启动
docker compose up -d

# 带微信推送通知
PUSHPLUS_TOKEN="你的token" docker compose up -d

# 查看日志
docker logs -f todo-moji

# 停止
docker compose down
```

数据库文件持久化在 `./data/` 目录，容器重建不丢数据。

## 微信通知

点击页面铃铛图标即可将待办摘要推送到个人微信。支持三种渠道（PushPlus / Server酱 / 企业微信）。

### 每个用户独立配置（推荐）

每位用户登录后，**长按铃铛图标** 打开通知设置，选择渠道并填入自己的 Token 即可。各用户互不影响。

### 全局 fallback（可选）

管理员可配置全局环境变量作为默认值，未单独配置的用户会使用全局 Token：

```bash
cp .env.example .env
# 编辑 .env 填入 Token
```

### 如何获取 Token

| 渠道 | 获取方式 | 环境变量 |
|------|----------|----------|
| **PushPlus**（推荐） | 微信关注公众号「pushplus」→ 登录 pushplus.plus → 首页复制 token | `PUSHPLUS_TOKEN` |
| **Server酱** | GitHub 登录 sct.ftqq.com → 微信扫码绑定 → 复制 SendKey | `SERVERCHAN_KEY` |
| **企业微信** | 群聊 → 添加群机器人 → 复制 Webhook URL | `WECHAT_WEBHOOK_URL` |

详细示例见 `.env.example` 文件。

## 技术栈

- **后端**: Python Flask + SQLite (WAL 模式)
- **前端**: 原生 HTML/CSS/JS
- **部署**: gunicorn + systemd
- **字体**: Noto Serif SC + ZCOOL KuaiLe
