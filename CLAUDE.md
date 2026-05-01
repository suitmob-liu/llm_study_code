# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库定位

仓库根 `llm_personal/` 是「大模型生成代码学习仓库」，目前只承载一个完整子项目 `cloudfile/`——自托管 AI-first 云文档系统。所有实际代码都在 `cloudfile/` 下，根目录除了 `README.md` 和 git 元数据没有别的。

当前活跃分支：`feature/add/cloudfile`（master 是空骨架，不会合并到 master 直到 cloudfile 进入稳定期）。

## 常用命令

下列命令都从 `cloudfile/` 目录运行（脚本内部自己 `cd` 到项目根）。

### Docker（推荐，唯一被脚本自动化的部署路径）

```bash
cloudfile/scripts/deploy.sh                 # 清旧容器 + 增量构建 + 启动 + 等 health check（端口 5494）
cloudfile/scripts/deploy.sh --port 8080     # 改端口
cloudfile/scripts/deploy.sh --no-build      # 容器已构建过，仅重启
cloudfile/scripts/deploy.sh --clean         # 玄学 cache 兜底：rmi 旧镜像 + --no-cache 重建
cloudfile/scripts/deploy.sh --purge         # 删除数据 volume 后重部署（会丢所有文档，需打 yes 确认）
cloudfile/scripts/deploy.sh --logs          # 部署完成后跟踪日志
curl http://localhost:5494/api/health       # 健康检查
```

`deploy.sh` 默认走 Docker layer cache + BuildKit cache mount（`/opt/vcpkg/downloads` 和 `/root/.cache/vcpkg`），改 .cpp 重 build 几十秒~几分钟；首次或 `--clean` 才会 20-40 分钟编译 vcpkg 依赖。

### 本地开发（Linux/WSL，需要 `VCPKG_ROOT` 环境变量）

```bash
export VCPKG_ROOT=/path/to/vcpkg
cloudfile/scripts/dev.sh build              # cmake -B out -G Ninja + cmake --build out
cloudfile/scripts/dev.sh run                # 运行 out/backend/cloudfile_backend，数据放 .local-data/
cloudfile/scripts/dev.sh test               # 配置 -DBUILD_TESTING=ON 然后 ctest --output-on-failure
cloudfile/scripts/dev.sh docker             # docker compose up --build（前台）
cloudfile/scripts/dev.sh clean              # rm -rf out build vcpkg_installed .local-data
```

跑单个测试：`ctest --test-dir cloudfile/out -R <name> --output-on-failure`（Phase 0/1/2 暂未引入测试，`backend/tests/` 是空目录，CMake 用 `EXISTS tests/CMakeLists.txt` 守卫）。

### Frontend（Vite + React 18）

```bash
cd cloudfile/frontend
npm install
npm run dev                                 # vite dev server，把 /api 和 /s 反代到 CLOUDFILE_DEV_BACKEND（默认 localhost:5494）
npm run build                               # tsc -b && vite build → dist/
```

Docker build 阶段把 `dist/` 复制到 `/usr/local/share/cloudfile/web`，由 backend `setDocumentRoot` 托管。本地 `dev.sh run` 不带前端——前端走 `npm run dev` + 反代到 backend 的方式调试。

### Admin CLI

构建产物 `out/admin_cli/cloudfile_admin`（Docker 镜像里在 `/usr/local/bin/`）。Phase 1+ 命令：

```bash
cloudfile_admin init-admin                  # 初始化第一个管理员；密码从 CLOUDFILE_INITIAL_ADMIN_PASSWORD 或 tty 读
cloudfile_admin invite <email>              # 7 天有效；token 打到 stdout，日志走 stderr
cloudfile_admin list-users / list-invites
cloudfile_admin revoke-invite <id>
cloudfile_admin mcp-token create <username> <name>   # 明文 token 仅打印一次
cloudfile_admin mcp-token list / revoke <id>
cloudfile_admin shares list / revoke <id>
cloudfile_admin rebuild-index               # 重建 FTS + wiki_links（drift / 外部改 docs_repo 后救回）
```

## 架构关键约束

读多个文件才能理解的「大图」决策——改动前先理解这些，否则会跟既有约定打架。

### 单仓双 binary，靠 `cloudfile_core` 静态库共享

`backend/CMakeLists.txt` 把 `storage/db.cpp` + 多数 `domain/*.cpp` 编进 `cloudfile_core` static lib，被 `cloudfile_backend` 和 `cloudfile_admin` 同时链接。**不要把 libgit2 相关代码放进 core**——`admin_cli` 不链 libgit2。所以 `storage/repo.cpp` + `domain/doc.cpp` + `api/doc_controller.cpp` 单独留在 `BACKEND_SOURCES` 列表里，不进 core。

**Drogon 的 controller/filter 通过全局构造函数自注册**，这意味着 controller/filter 的 .cpp 必须直接编进 `cloudfile_backend` exe（在 `BACKEND_SOURCES` 里），不能塞进 static lib——会被 linker DCE 掉。新增 controller 时记住这条。

`cloudfile_mcp` 完全独立，只依赖 nlohmann/json + spdlog + fmt + libcurl，不复用 core——它是 stdio JSON-RPC 客户端，所有数据访问通过 HTTP 反过来调 backend。

### 真相源是文件系统 + git，SQLite 是派生索引

`docs_repo/<username>/*.md` 和 `docs_repo/shared/*.md` 是唯一真相源。`docs_fts` (FTS5) 和 `wiki_links` 表是派生索引——写失败时只 log warn，不抛、不回滚 FS+git。drift 通过 `cloudfile_admin rebuild-index` 救回。这条决策意味着：

- `domain/doc::list_for_user` 走 FS walk（不查 SQLite）。
- `domain/doc::write` / `remove` 在 `Database::write_mutex` 同把锁下顺序执行：先 git commit，再 FTS upsert，再 wiki_links 重建。FTS/wiki_links 失败不影响主流程。
- 不要引入 `docs` 表。需要 LEFT JOIN 时再说。

### 全局写锁：`Database::write_mutex`

单进程 + threading lock 是设计决策（≤10 人场景）。所有「会改 SQLite 或 docs_repo」的代码路径都必须在这把锁下。包括：会话 lookup-then-update（`session::find_active_and_touch`）、invite 消费（`mark_used` 走 `WHERE status=active` 单条原子 UPDATE）、`rebuild-index` CLI 全量重建。

### 路径与权限

`domain/doc::normalize`：拒 `..` / 绝对路径 / 空段 / 控制字符 / 非 `.md` 后缀；`\` → `/`。

`domain/doc::check_access`：硬编码 `<username>/...` 和 `shared/...` 两个允许前缀，其他 403。Admin 走 CLI 不走 API。

API 路由用 `ADD_METHOD_VIA_REGEX("/api/docs/(.+)", ...)` 捕获多段路径。前端 `lib/api.ts::encodePath` 按 `/` 分段 `encodeURIComponent`，路径含中文/空格/特殊字符不挂。MCP server 端走 `curl_easy_escape` 同样按段编码。

### 认证：cookie 与 bearer 同一个 filter

`api/AuthFilter`（不是 `SessionAuthFilter`，已改名）：先看 `cfsession` cookie；未命中再读 `Authorization: Bearer <token>` 走 `mcp_token::verify`。两条路径都把 `user_id` 塞 `req->attributes()`，下游 controller 不感知差异。挂 `AuthFilter` 的端点同时接受 Web cookie 和 MCP bearer——`cloudfile_mcp` 用同一套 API 没有特殊路径。

Token 哈希策略统一：DB 只存 BLAKE2b(token)，明文从 `create()` 返回一次。包括 invite_links / sessions / mcp_tokens / share_tokens。密码用 libsodium Argon2id（`OPSLIMIT/MEMLIMIT_INTERACTIVE`，~100-500ms，长度 12-1024）。

### Wiki link 解析（`domain/wiki_link`）

- 扫 `[[target]]` / `[[target|alias]]`，跳过 ``` 围栏代码块（不处理 inline `code`）。
- `target` 含 `/` → repo-relative，缺 `.md` 自动补；裸名先试 `<src_user>/<name>.md` 存在则用，否则 fallback `shared/<name>.md`；都不存在 → orphan，归 `<src_user>/`（前端按红色虚线渲染）。
- `index_replace` / `index_delete_src` 与 `doc::write` / `remove` 在同把 `write_mutex` 下；删源文档时只清出边，入边保留（指向被删文档的链接成为 orphan）。
- 前端 `src/lib/wikilinks.ts` **客户端解析**镜像后端规则（含 `/` → repo-relative，裸名 → `<src_user>/`），但**不做 FS exists 检查**——所以裸名总解析成 `<src_user>/`，不会 fallback shared/。要写在 shared/ 的链接得显式 `[[shared/team]]`。

### Drogon SPA fallback

`backend/src/main.cpp::setCustomErrorHandler`：`/api/*` 和 `/s/*` 路径返 JSON 404；其他路径返 `index.html` + 200，让 React Router 接管。新增 API 路径前缀必须加进这个分流逻辑（目前是 hard-coded 字符串前缀检查）。

### 前端视觉系统硬约束

所有颜色/间距/字号/圆角必须走 `cloudfile/DESIGN-SYSTEM.md` 里定义的 CSS 变量（Tailwind `rgb(var(--bg) / <alpha-value>)` 模式），**不允许硬编码十六进制颜色**。Warm Scholar 方向：琥珀 `#D97706` + 卡其白 `#FFFBF5`，自动跟随 `prefers-color-scheme`。字体栈 DM Sans / JetBrains Mono / Newsreader / Noto Sans SC。

## 环境变量

| 名 | 默认 | 用途 |
|---|---|---|
| `CLOUDFILE_HOST` | `0.0.0.0` | backend 监听地址 |
| `CLOUDFILE_PORT` | `8080` | backend 监听端口（容器内固定 8080；宿主机映射端口看 `HOST_PORT`） |
| `CLOUDFILE_DATA_ROOT` | `/var/lib/cloudfile` | SQLite + docs_repo 根目录 |
| `CLOUDFILE_DEV` | `0` | 1 = debug 日志 |
| `CLOUDFILE_COOKIE_SECURE` | `0` | 上 HTTPS 后改 1（localhost http 调试需要 0 才拿得到 cookie） |
| `CLOUDFILE_PUBLIC_BASE_URL` | — | share_url 前缀；不设时反推 Host header（开发 OK，生产必须显式设） |
| `CLOUDFILE_INITIAL_ADMIN_PASSWORD` | — | `cloudfile_admin init-admin` 读取 |
| `CLOUDFILE_GIT_NAME` / `CLOUDFILE_GIT_EMAIL` | `cloudfile` / `cloudfile@localhost` | git commit 默认 author（用户提交时改写为 `<username> <user.email>`） |
| `HOST_PORT` | `5494` | docker-compose / deploy.sh 宿主机端口 |
| `CLOUDFILE_DEV_BACKEND` | `http://localhost:5494` | Vite dev server 反代目标 |
| `CLOUDFILE_MCP_TOKEN` | — | `cloudfile_mcp` 必填，缺失 exit(1) |
| `CLOUDFILE_BACKEND_URL` | `http://127.0.0.1:8080` | `cloudfile_mcp` 调 backend 的 URL |

## Phase 路线图

按 `cloudfile/CHANGELOG.md` 时间线，当前状态：

- **Phase 0**（v0.0）：vertical slice、SQLite v1 schema、docker-compose 跑通 ✅
- **Phase 1**（v0.1.0，已 tag）：认证 + 文档 CRUD + git commit + FTS + wiki link/反向链接 ✅
- **Phase 2**（v0.2.0，已 tag）：MCP server（6 工具）+ React + Milkdown 前端 + 公共分享链接 ✅
- **Unreleased**：Phase 2d-4 全局搜索 modal + 设置页 + 自助 share/MCP-token 管理 ✅
- **Phase 3**（计划中）：Caddy/Nginx 反代 + HTTPS + 速率限制 + 端到端测试

新功能动手前先翻 `CHANGELOG.md` Unreleased 段，那里记的设计决策比 `DESIGN.md` 新。

## 提交约定

`cloudfile/CHANGELOG.md` 走 Keep-a-Changelog；版本走 SemVer。Commit message 看历史是 `feat(cloudfile): 阶段 2d-4 — 全局搜索 + 自助管理` 这种 conventional commits 风格——`type(scope): subject`，scope 用 `cloudfile`，subject 用中文，并标记 phase 编号方便对照 CHANGELOG。

`docs_repo/`、`attachments/`、`*.sqlite*`、`/out/`、`/build/`、`/vcpkg_installed/`、`/frontend/node_modules/`、`/frontend/dist/` 全部在 `.gitignore` 里——绝对不要提交运行时数据。

## 文档地图

读完这一页，再去读：

- `cloudfile/DESIGN.md` — 产品定位、3 方案对比、8 项工程决策（架构原子性、并发锁、MCP 路径、wiki link 重命名等）、UI 设计决策表
- `cloudfile/DESIGN-SYSTEM.md` — 完整视觉规范（CSS 变量 token、AI 活动专属 token 如 wiki link 四态/AI 横幅）
- `cloudfile/CHANGELOG.md` — 每个 phase 的实现细节、为什么这么写、踩过哪些坑
