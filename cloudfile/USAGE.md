# cloudfile 使用与运维手册

> 适用版本：v0.2.0 + Unreleased（Phase 2d-4）
> 文档目的：从一台空 Linux 服务器到能用 Web 写文档、能用 LLM 通过 MCP 读写库——一条端到端的实操路径。
> 设计与架构请看 `DESIGN.md` / `CHANGELOG.md`，本文只讲「怎么操作」。

---

## 0. 快速心智模型

cloudfile 是一个 Docker 单容器服务，里面跑三个 binary：

| Binary | 用途 | 触发方式 |
|---|---|---|
| `cloudfile_backend` | HTTP API + 静态前端托管 | 容器 ENTRYPOINT 自动起 |
| `cloudfile_admin` | 管理员 CLI（建账户、签 token、维护索引） | `docker exec` 手动调 |
| `cloudfile_mcp` | LLM 用的 stdio JSON-RPC server，HTTP 反过来调 backend | LLM 客户端按子进程启动 |

数据真相源：容器内 `/var/lib/cloudfile/`（挂在 docker volume `cloudfile-data`）。下面有：
- `repo/` —— git 仓库，每个用户一个目录 + `shared/`
- `cloudfile.sqlite` —— 用户、邀请、session、token、FTS 索引、wiki link 索引

宿主机映射端口默认 **5494**（容器内固定 8080）。

---

## 1. 服务器部署

### 1.1 服务器要求

- 任意 Linux 发行版（Ubuntu 22.04+ / Debian 12+ 都验证过）
- Docker 20.10+ + `docker compose` v2 plugin（v1 也兼容但有 EOL 警告）
- 一个能 ssh 进去的非 root 账户或 root（脚本不要求 root，但 docker 命令会）
- 5494 端口空闲（或 `--port` 指定其他）
- 首次构建需 ~2GB 磁盘 + 4GB 内存（vcpkg 编 Drogon/libgit2/libsodium 比较吃）

### 1.2 一键部署

```bash
# 1) 把仓库拉到服务器
git clone <repo-url> cloudfile-repo
cd cloudfile-repo/cloudfile

# 2) 跑部署脚本（首次会编 20-40 分钟，之后改代码增量重 build 几十秒~几分钟）
./scripts/deploy.sh

# 3) 验证
curl http://localhost:5494/api/health
# 期望：{"status":"ok","service":"cloudfile_backend","version":"0.1.0"}
```

`deploy.sh` 做了：清旧容器 → 复用 layer cache 增量构建 → 启动 → 等 60s 内 `/api/health` 通。失败会自动打印最后 60 行容器日志。

### 1.3 常用维护命令

```bash
./scripts/deploy.sh                    # 改了代码后重部署
./scripts/deploy.sh --no-build         # 容器存在，仅重启
./scripts/deploy.sh --logs             # 部署完后 tail 日志
./scripts/deploy.sh --port 8080        # 改宿主机端口
./scripts/deploy.sh --clean            # cache 怀疑出鬼时：rmi 旧镜像 + --no-cache 全量重建
./scripts/deploy.sh --purge            # 删 docker volume 全部数据后重部署（需打 yes 确认！）

docker compose logs -f                 # 跟踪日志
docker compose down                    # 停服务（数据保留）
docker compose ps                      # 看容器状态
docker exec -it cloudfile-backend bash # 进容器（调试时）
```

### 1.4 数据备份

数据全在 docker volume `cloudfile-data`。备份就是把整个 `/var/lib/cloudfile/` 拷出来：

```bash
# 热备（在线，sqlite WAL 模式安全）
docker exec cloudfile-backend tar czf - -C /var/lib/cloudfile . > backup-$(date +%Y%m%d).tgz

# 恢复（需先停容器）
docker compose down
docker run --rm -v cloudfile-repo_cloudfile-data:/dst -v $PWD:/src ubuntu \
  tar xzf /src/backup-20260501.tgz -C /dst
docker compose up -d
```

迁移到新机器也是这条路径——把 tarball 拷过去，新机器 `deploy.sh` 一遍后恢复 volume 即可。

### 1.5 公网访问（可选）

当前默认监听 `0.0.0.0:5494` HTTP 明文。**生产**前面必须套反向代理 + HTTPS：

```nginx
# /etc/nginx/sites-available/cloudfile
server {
    listen 443 ssl http2;
    server_name notes.your-domain.com;
    ssl_certificate     /etc/letsencrypt/live/notes.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/notes.your-domain.com/privkey.pem;

    client_max_body_size 10M;
    location / {
        proxy_pass http://127.0.0.1:5494;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

上 HTTPS 后必须改两个环境变量（写到 `docker-compose.yml` 的 `environment` 里）：

```yaml
CLOUDFILE_COOKIE_SECURE: "1"            # 让 session cookie 带 Secure 属性
CLOUDFILE_PUBLIC_BASE_URL: "https://notes.your-domain.com"  # 分享链接前缀
```

Phase 3 计划用 Caddy 一键替代上面这一坨，目前还没自动化。

---

## 2. 账户管理

### 2.1 创建第一个管理员（首次部署后必做）

```bash
# 推荐：通过环境变量传密码（不留 shell history）
docker exec -it -e CLOUDFILE_INITIAL_ADMIN_PASSWORD='你的强密码至少12位' \
    cloudfile-backend cloudfile_admin init-admin

# 或者交互输入
docker exec -it cloudfile-backend cloudfile_admin init-admin
# 提示：Admin password (min 12 chars):
```

默认 username=`admin` / email=`admin@localhost`，可加 `--username alice --email alice@example.com` 改。

幂等：同名 admin 已存在静默返回成功；如果库里有别的用户但没这个 admin，会拒绝（防止 init-admin 被当成"加管理员"用——加管理员目前没接口，得直接改 DB 或写新 CLI 命令）。

### 2.2 邀请新用户

cloudfile 不开放公网注册，必须由 admin 一对一签邀请 token。

```bash
docker exec -it cloudfile-backend cloudfile_admin invite alice@example.com
```

输出（**token 只打印一次**，丢了只能 revoke 重发）：

```
[ok] invite created for alice@example.com (expires 2026-05-08 09:00:00 UTC)

  token: 7f3a9c1e0b...d4a6f12e (64 hex)

  share-link example:
    https://your-host/register?token=7f3a9c1e0b...&email=alice@example.com

  NOTE: token is shown ONCE. If lost, revoke-invite 7 and re-invite.
```

### 2.3 完成注册（⚠️ 当前 gap：前端没注册页）

**重要**：v0.2.0 的前端 `Login.tsx` 只有登录表单，没有注册页面（计划 Phase 2e 补）。新用户必须用 curl 直接调注册 API：

```bash
curl -X POST https://notes.your-domain.com/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "invite_token": "7f3a9c1e0b...d4a6f12e",
    "username": "alice",
    "email": "alice@example.com",
    "password": "至少12位的强密码"
  }'
```

成功返回 `201` + `Set-Cookie: cfsession=...`，然后浏览器访问 `https://notes.your-domain.com/` 直接已登录态。

为了用户体验，admin 拿到 token 后可以发一个一次性自助脚本：

```bash
# 给用户的 register.sh
#!/usr/bin/env bash
read -p "用户名: " USERNAME
read -p "邮箱: " EMAIL
read -sp "密码（至少12位）: " PASSWORD; echo
TOKEN="7f3a9c1e0b...d4a6f12e"
curl -i -c cookies.txt -X POST https://notes.your-domain.com/api/register \
  -H "Content-Type: application/json" \
  -d "{\"invite_token\":\"$TOKEN\",\"username\":\"$USERNAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
```

### 2.4 查看 / 撤销

```bash
# 用户列表
docker exec -it cloudfile-backend cloudfile_admin list-users

# 邀请列表（active / used / revoked / expired 状态分明）
docker exec -it cloudfile-backend cloudfile_admin list-invites

# 撤销未使用的邀请（幂等）
docker exec -it cloudfile-backend cloudfile_admin revoke-invite 7
```

密码强度：libsodium Argon2id，长度 12–1024。哈希一次 ~100–500ms（这是 OPSLIMIT_INTERACTIVE 的代价，10 人规模可忽略）。

---

## 3. 日常使用（Web）

登录后默认跳到文档列表。地址栏：

| 路径 | 页面 |
|---|---|
| `/` | DocList — 按 mtime 倒序的文档列表 |
| `/d/<path>` | DocView — 阅读 / 编辑双 tab；`?edit=1` 直接进编辑模式 |
| `/settings` | Settings — 自助管理分享链接和 MCP token |

### 3.1 写文档

- DocList 顶部 `+ 新建` 弹对话框，输入路径默认补 `<username>/` 前缀和 `.md` 后缀
- 编辑器是 Milkdown Crepe（Notion 风 WYSIWYG）：`/` 唤出菜单插入代码块、表格、任务列表
- 顶栏 `保存` 触发 `PUT /api/docs/<path>` → 后端做 git commit + FTS 更新 + wiki link 重建
- 未保存时刷页/关页有浏览器原生提示防误关

权限模型很简单：每个用户只能读写自己的目录 `<username>/...` 和 `shared/...`。其他用户的目录 403 不可见。

### 3.2 wiki link

在文档里写 `[[other-doc]]` 或 `[[other-doc|显示名]]`，阅读模式下自动渲染为可点击链接。解析规则：

| 形态 | 解析 |
|---|---|
| `[[shared/team]]` | 含 `/` → repo-relative，缺 `.md` 自动补 |
| `[[notes]]` | 裸名 → `<当前用户>/notes.md` |
| `[[notes\|笔记]]` | 同上，但显示文字是「笔记」 |

> ⚠️ 已知限制：客户端解析不做 FS exists 检查，所以裸名**永远**解析成 `<当前用户>/`，不会 fallback 到 `shared/`。要写在 shared/ 的链接得显式 `[[shared/team]]`。

### 3.3 反向链接

DocView 底部「反向链接」面板列出所有引用本文的文档，点击跳转。保存后自动刷新（不用手动 reload）。

### 3.4 全局搜索

任意页面按 `⌘K`（Mac）或 `Ctrl+K`（其他）唤出搜索 modal。FTS5 + trigram tokenizer，中文/英文/混合都能搜，命中片段用 `<mark>` 高亮。↑↓ 选 / Enter 跳 / Esc 关。

如果搜出来的结果跟实际内容明显不一致（drift——比如外部 `git pull` 改了 `docs_repo/`），跑：

```bash
docker exec -it cloudfile-backend cloudfile_admin rebuild-index
```

会清空 FTS + wiki_links 表后扫整个 `docs_repo/` 重建。≤1000 文档量级毫秒级。

### 3.5 公共分享链接

DocView 右上角「分享」按钮调 `POST /api/docs/<path>/share` → 后端签发一个 64 字符随机 token → 返回 `share_url` 自动复制到剪贴板。任何人凭 URL 可只读。

`/settings` 里能看到自己创建的所有分享，可撤销。**注意**：DB 只存 token hash，所以列表不展示 share_url——遗失只能 revoke 旧的 + 创建新的。

撤销也可以走 admin CLI：

```bash
docker exec -it cloudfile-backend cloudfile_admin shares list
docker exec -it cloudfile-backend cloudfile_admin shares revoke 12
```

---

## 4. MCP 配置（让 LLM 读写文档库）

`cloudfile_mcp` 是 stdio JSON-RPC 进程，必须由 LLM 客户端按子进程启动；它在自己进程内通过 HTTP 反过来调 backend。提供 6 个工具：

| 工具 | 作用 |
|---|---|
| `list_docs` | 列出当前 token 用户可见的所有文档 |
| `read_doc(path)` | 读文档原文 |
| `write_doc(path, content)` | 写/覆盖文档（触发 git commit） |
| `search_docs(query, limit?)` | FTS 全文搜索 |
| `backlinks_of(path)` | 反向链接 |
| `recent_edits(limit?)` | 最近修改 |

### 4.1 创建 MCP token

```bash
docker exec -it cloudfile-backend cloudfile_admin mcp-token create alice "claude-code-laptop"
```

输出（**明文 token 只打印一次**）：

```
[ok] mcp token created (id=3, user=alice, name=claude-code-laptop)

  token: 9b2c1f3e...a7f4d92e

  use it in cloudfile_mcp:
    export CLOUDFILE_MCP_TOKEN=9b2c1f3e...a7f4d92e

  NOTE: token is shown ONCE. If lost, mcp-token revoke 3 and re-create.
```

Token 的权限边界 = 关联用户的权限边界，只能读写 `<username>/` 和 `shared/`。Admin token 没有特殊权限——admin 操作走 CLI，不走 API。

普通用户也可以**自助签发** token：登录 Web → `/settings` → 「MCP Token」表格 → 「+ 新建」。

### 4.2 三种连接方式

`cloudfile_mcp` 二进制是容器内 Ubuntu 24.04 的 ELF。LLM 客户端在哪，就要让 binary 在哪能跑。

#### 方式 A（推荐）：远程服务器，SSH 包装

LLM 客户端在你笔记本，backend 在远程服务器。MCP 通过 SSH 通道把 stdio 转发到容器内的 `cloudfile_mcp`。

**先决条件**：从笔记本到服务器**免密 SSH**（公钥认证），否则每次 MCP 启动会卡在密码提示。

Claude Code 配置（`~/.claude.json` 或项目 `.mcp.json`）：

```json
{
  "mcpServers": {
    "cloudfile": {
      "command": "ssh",
      "args": [
        "root@your-server.com",
        "docker exec -i -e CLOUDFILE_MCP_TOKEN=9b2c1f3e...a7f4d92e cloudfile-backend cloudfile_mcp"
      ]
    }
  }
}
```

或用 CLI 一行：

```bash
claude mcp add cloudfile -- ssh root@your-server.com \
  docker exec -i -e CLOUDFILE_MCP_TOKEN=9b2c1f3e...a7f4d92e cloudfile-backend cloudfile_mcp
```

要点：
- `-i` 而不是 `-it` —— MCP 走 stdio 必须非 tty，否则协议帧被 line discipline 搞乱
- `-e CLOUDFILE_MCP_TOKEN=...` 把 token 塞容器内进程；不能依赖宿主机 env
- 不需要传 `CLOUDFILE_BACKEND_URL` —— 容器内默认 `http://127.0.0.1:8080` 正好就是 backend

#### 方式 B：本地 Linux/WSL，binary 拿出来跑

服务在本机 Docker、或者你愿意把 binary 拷到服务器同 OS 的另一台机器：

```bash
# 把 binary 从容器拷出来
docker cp cloudfile-backend:/usr/local/bin/cloudfile_mcp ~/.local/bin/cloudfile_mcp
chmod +x ~/.local/bin/cloudfile_mcp
```

Claude Code 配置：

```json
{
  "mcpServers": {
    "cloudfile": {
      "command": "/home/you/.local/bin/cloudfile_mcp",
      "env": {
        "CLOUDFILE_MCP_TOKEN": "9b2c1f3e...a7f4d92e",
        "CLOUDFILE_BACKEND_URL": "http://localhost:5494"
      }
    }
  }
}
```

注意 `CLOUDFILE_BACKEND_URL` 必须是宿主机映射端口（默认 `5494`），不是容器内的 `8080`，因为这次 mcp 不在容器里。

#### 方式 C：Windows，没办法直接跑 ELF

只能走方式 A（SSH 包装）。如果非要本地跑，用 WSL2 + 方式 B。

### 4.3 验证

```bash
claude mcp list                 # 应该看到 cloudfile
```

会话里：

```
> /mcp
# 显示 cloudfile 状态 connected，列出 6 个工具

> 帮我用 cloudfile 列我所有文档
# Claude 调 list_docs，返回 path + size + mtime 列表
```

裸跑调试（不通过 LLM 客户端）：

```bash
# 远程服务器版（方式 A）
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}' | \
  ssh root@your-server.com docker exec -i \
    -e CLOUDFILE_MCP_TOKEN=9b2c1f3e... cloudfile-backend cloudfile_mcp
```

期望一行返回：

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","serverInfo":{"name":"cloudfile","version":"0.1.0"},"capabilities":{"tools":{}}}}
```

### 4.4 撤销 / 审计

```bash
# 列所有 token，含 last_used_at（验证哪个 token 在用）
docker exec -it cloudfile-backend cloudfile_admin mcp-token list

# 撤销（幂等）
docker exec -it cloudfile-backend cloudfile_admin mcp-token revoke 3
```

撤销后下一次 `cloudfile_mcp` 调 backend 即返 401。Token 是长生命周期的，没有自动过期——靠 `revoked_at` 控制。

---

## 5. 故障排除

### 5.1 health check 60s 超时

`./scripts/deploy.sh` 失败时会自动打 60 行日志。常见原因：

| 现象 | 原因 | 修复 |
|---|---|---|
| `database init failed: no such module: fts5` | vcpkg 装的 sqlite3 没启 fts5 feature | `--clean` 重 build；vcpkg.json 已声明，重装即可 |
| `docs_repo init failed: failed to create signature` | git author 未配 | 已默认走 `cloudfile@localhost`，不应触发；触发则查容器 env 是不是被覆盖了 |
| `bind: address already in use` | 5494 被占 | `--port 8080` 换端口，或 `lsof -i:5494` 看是谁 |
| 容器一直 restart | 看 `docker compose logs` 找 `[critical]` 行 | 通常是 schema migration / volume 权限问题 |

### 5.2 search 结果空 / 不一致

```bash
docker exec -it cloudfile-backend cloudfile_admin rebuild-index
```

任何外部修改 `docs_repo/`（比如手动 `git pull`、批量重命名）后必跑。

### 5.3 SSH 包装的 MCP 卡在「starting」

按概率排查：

1. **没免密** —— `ssh root@server echo ok` 看是否需要密码；要的话 `ssh-copy-id`
2. **用了 `-it`** —— 改成 `-i`
3. **服务器侧 `cloudfile-backend` 容器没起** —— `ssh server docker ps` 验证
4. **token 已被 revoke 或拼错** —— `cloudfile_mcp` 启动后 backend 401，进程立即退出。日志在 LLM 客户端那边（Claude Code: `~/.claude/logs/`）

### 5.4 注册时返 410 Gone "invite is expired"

邀请 7 天有效。过期了 admin 重发：

```bash
docker exec -it cloudfile-backend cloudfile_admin invite alice@example.com
```

### 5.5 cookie 在浏览器拿不到（开发环境）

如果 backend 开了 `CLOUDFILE_COOKIE_SECURE=1` 但实际是 HTTP 不是 HTTPS，cookie 会被浏览器丢弃。开发环境必须 `CLOUDFILE_COOKIE_SECURE=0`（默认就是 0）。生产 HTTPS 必须 `=1`。

---

## 6. 环境变量速查

| 变量 | 默认 | 在哪用 | 说明 |
|---|---|---|---|
| `CLOUDFILE_HOST` | `0.0.0.0` | backend | 监听地址 |
| `CLOUDFILE_PORT` | `8080` | backend | 容器内监听端口（不要改） |
| `CLOUDFILE_DATA_ROOT` | `/var/lib/cloudfile` | backend / admin_cli | sqlite + docs_repo 根 |
| `CLOUDFILE_DEV` | `0` | backend | 1 = debug 日志 |
| `CLOUDFILE_COOKIE_SECURE` | `0` | backend | 上 HTTPS 后必须 `1` |
| `CLOUDFILE_PUBLIC_BASE_URL` | — | backend | share_url 前缀；生产必设 |
| `CLOUDFILE_INITIAL_ADMIN_PASSWORD` | — | admin_cli | `init-admin` 非交互密码源 |
| `CLOUDFILE_GIT_NAME` / `CLOUDFILE_GIT_EMAIL` | `cloudfile` / `cloudfile@localhost` | backend | git commit 默认 author |
| `HOST_PORT` | `5494` | docker-compose | 宿主机端口（`deploy.sh --port` 也设这个） |
| `CLOUDFILE_DEV_BACKEND` | `http://localhost:5494` | vite dev | 前端开发反代目标 |
| `CLOUDFILE_MCP_TOKEN` | — | cloudfile_mcp | 必填，缺失 exit(1) |
| `CLOUDFILE_BACKEND_URL` | `http://127.0.0.1:8080` | cloudfile_mcp | 容器内默认即对，跨机要改 |

---

## 7. 一张图看完整流程

```
[管理员]                                   [新用户]                    [LLM 客户端]
   │                                          │                            │
   │ 1. deploy.sh                             │                            │
   │ 2. init-admin                            │                            │
   │ 3. invite <email> ──────token──────►     │                            │
   │                                          │ 4. curl POST /api/register │
   │                                          │    （含 invite_token）      │
   │                                          │ 5. 浏览器登录写文档         │
   │                                          │                            │
   │ 6. mcp-token create <user> ─token─►      │                            │
   │    （或用户在 /settings 自助签发）        │                            │
   │                                          │ ──────token──────►         │
   │                                          │                            │ 7. 配 mcp.json
   │                                          │                            │ 8. LLM 调 6 个工具
   │                                          │                            │    读写搜索文档
   ▼                                          ▼                            ▼
              docker volume cloudfile-data ── repo/<user>/*.md + sqlite
                              │
                              └─ 备份：docker exec ... tar czf - ...
```

---

## 8. 我还想知道更多

- 架构「为什么这么写」 → `cloudfile/DESIGN.md`（3 方案对比 + 8 项工程决策）
- 视觉规范 → `cloudfile/DESIGN-SYSTEM.md`（CSS 变量 token 表）
- 每个 phase 干了啥 + 踩了哪些坑 → `cloudfile/CHANGELOG.md`
- Claude Code 工作时的约束 → 仓库根 `CLAUDE.md`
