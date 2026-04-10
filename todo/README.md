# 待办 · 墨记

墨纸禅风的待办事项管理系统。Flask + SQLite 后端，原生 HTML/CSS/JS 前端，支持 Docker 部署。

## 功能

### 待办管理
- 待办事项 CRUD，创建时自动记录创建时间
- 截止日期可选填，逾期自动红色高亮提醒
- 按状态过滤：全部 / 待办 / 已完成
- 点击圆形复选框切换完成状态

### 用户系统
- 用户注册需管理员审核通过后方可使用（最多 10 个用户）
- SHA256 加盐哈希密码存储 + HttpOnly Cookie 会话（7 天过期）
- 用户可自行修改密码

### 管理员面板
- 审核 / 拒绝 / 删除用户
- 查看每个用户的待办数量
- 默认管理员账号 `admin / admin123`（请登录后立即修改）

### 微信推送通知
- 支持四种渠道：**WxPusher**（推荐，完全免费）/ PushPlus / Server酱 / 企业微信 Webhook
- **每个用户独立配置** 自己的推送 Token，互不影响
- 管理员可设置全局环境变量作为未配置用户的 fallback
- 点击铃铛图标手动发送待办摘要到微信
- 长按铃铛图标打开通知设置面板

### 定时推送
- 支持三种频率：关闭（仅手动）/ 每天 / 每周指定日
- 自定义推送时间（精确到分钟，如 09:00）
- 每周模式可选择周一至周日任意组合
- APScheduler 后台调度，每分钟检查一次自动发送

### 主题切换
- 五套主题可选：墨纸禅 / 春日笺 / 赛博霓虹 / 山林雾 / 落日沙
- 点击顶栏太阳图标打开主题面板
- localStorage 持久化用户选择，刷新不丢失
- CSS 变量驱动，切换带过渡动画

### 前端设计
- 字体：Noto Serif SC 宋体 + ZCOOL KuaiLe 书法字
- 响应式设计，支持移动端
- 入场动画、悬停交互、墨渍浮动装饰

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

推荐使用一键部署脚本 `docker-deploy.sh`（纯 docker 命令，不依赖 docker-compose）：

```bash
bash docker-deploy.sh            # 首次部署 / 修改代码后重新部署（保留数据）
bash docker-deploy.sh clean      # 清理旧镜像后重新构建（保留数据）
bash docker-deploy.sh stop       # 停止容器
bash docker-deploy.sh logs       # 查看日志
bash docker-deploy.sh status     # 查看运行状态
bash docker-deploy.sh purge      # 彻底清理（删除容器+镜像+数据库），慎用
```

日常修改代码后只需再次运行 `bash docker-deploy.sh`，脚本会自动停掉旧容器、重新构建、启动新容器，数据库不受影响。

数据库文件持久化在 `./data/` 目录，容器重建不丢数据。

## 微信通知配置

### 方式一：用户自行配置（推荐）

每位用户登录后，**长按铃铛图标** 打开通知设置面板：

1. 选择推送渠道
2. 粘贴自己的 Token
3. 设置定时推送频率和时间（可选）
4. 保存

各用户独立配置，互不影响。

### 方式二：管理员全局配置（fallback）

未单独配置的用户会使用全局 Token：

```bash
cp .env.example .env
# 编辑 .env 填入 Token
```

### 如何获取 Token

| 渠道 | 费用 | 每日额度 | 获取方式 | Token 格式 |
|------|------|----------|----------|------------|
| **WxPusher**（推荐） | 完全免费 | 2000条 | wxpusher.zjiecode.com 扫码登录 → 新建应用获取 appToken；关注公众号「wxpusher」→「我的」→「我的UID」 | `appToken\|UID` |
| PushPlus | 免费版有限额 | 200条 | 关注公众号「pushplus」→ 登录 pushplus.plus → 首页复制 | token 字符串 |
| Server酱 | 免费版有限 | 5条 | GitHub 登录 sct.ftqq.com → 微信扫码绑定 → 复制 SendKey | SendKey 字符串 |
| 企业微信 | 免费 | 20条/分钟 | 群聊 → 添加群机器人 → 复制 Webhook URL | 完整 URL |

详细示例见 `.env.example` 文件。

## 项目结构

```
todo/
├── app.py              # Flask 后端（全部 API + 定时调度）
├── requirements.txt    # Python 依赖（Flask, requests, APScheduler）
├── start.sh            # 开发启动脚本
├── deploy.sh           # 生产部署脚本（systemd + gunicorn）
├── docker-deploy.sh    # Docker 一键部署脚本（纯 docker 命令）
├── Dockerfile          # Docker 镜像构建
├── docker-compose.yml  # Docker 编排配置（可选）
├── .env.example        # 环境变量配置示例
├── .gitignore          # Git 忽略规则
├── .dockerignore       # Docker 忽略规则
├── RELEASE_NOTE.md     # 版本发布记录
├── README.md           # 本文件
├── data/               # 运行时自动创建，存放 todo.db
└── static/
    ├── index.html      # 单页应用入口
    ├── style.css       # 主题样式（5套主题）
    └── app.js          # 前端全部逻辑
```

## 技术栈

- **后端**: Python Flask + SQLite (WAL 模式)
- **定时任务**: APScheduler (BackgroundScheduler)
- **前端**: 原生 HTML/CSS/JS，零依赖
- **部署**: Docker / gunicorn + systemd
- **认证**: SHA256 加盐哈希 + HttpOnly Cookie 会话
- **通知**: WxPusher / PushPlus / Server酱 / 企业微信 Webhook
- **字体**: Noto Serif SC + ZCOOL KuaiLe

## API 概览

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 登录 |
| `/api/auth/logout` | POST | 登出 |
| `/api/auth/me` | GET | 获取当前用户 |
| `/api/auth/change-password` | POST | 修改密码 |
| `/api/todos` | GET | 获取待办列表 |
| `/api/todos` | POST | 创建待办 |
| `/api/todos/:id` | PUT | 更新待办 |
| `/api/todos/:id` | DELETE | 删除待办 |
| `/api/admin/users` | GET | 管理员获取用户列表 |
| `/api/admin/users/:id/approve` | POST | 审核通过 |
| `/api/admin/users/:id/reject` | POST | 审核拒绝 |
| `/api/admin/users/:id` | DELETE | 删除用户 |
| `/api/notify/settings` | GET/POST | 读取/保存通知配置 |
| `/api/notify/send` | POST | 手动发送通知 |
| `/api/notify/status` | GET | 查询通知状态 |
