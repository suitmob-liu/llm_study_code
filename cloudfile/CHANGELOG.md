# Changelog

All notable changes to **cloudfile** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

> Phase 2 起步：MCP server（让 LLM 跨库读写搜索）+ React + Milkdown 前端。

### Added

- **Phase 2d-3 编辑器 + wiki link + 反向链接 + 新建文档**：
  - **Milkdown Crepe 编辑器**（@milkdown/crepe）：Notion 风 WYSIWYG，slash 菜单 / 代码块 / 表格 / 任务列表全都自带。React 包装走命令式生命周期——mount 时 `new Crepe + create()`，unmount `destroy()`；不做 controlled 模式（避免 setValue 重建文档树丢光标）。`onChange` 通过 ref 持有最新闭包，父组件 rerender 不会重建编辑器。
  - **DocView 改造为读/写双模**：tab 切换 阅读/编辑，`?edit=1` 查询参数可直接进编辑模式（新建文档跳转后用）；编辑态 `dirty` 跟踪未保存改动，`beforeunload` 提示防误关；保存按钮调 `PUT /api/docs/<path>`，触发 git commit + FTS 更新 + wiki_links 重建（架构决策 1.3）。保存成功后递增 `refreshKey` 触发 BacklinksPanel 重查，及时反映新写入的 `[[link]]`。
  - **wiki link 客户端解析**（`src/lib/wikilinks.ts`）：阅读模式下把 `[[target]]` / `[[target|alias]]` 用正则替换为 `[alias-or-target](/d/resolved)`，再喂 react-markdown。解析规则镜像后端：含 `/` 当 repo-relative，裸名归 `<src_user>/`。点链接走 React Router 内部跳转，不刷新页面，保持上下文。
    - 已知限制：客户端不做 FS exists 检查，所以不会 fallback shared/——裸名 `[[team]]` 总解析成 `<src_user>/team.md`，实际在 shared/ 的得显式写 `[[shared/team]]`。code fence 内的 `[[...]]` 也会被吃，写 wiki link 教学文档时再修。
  - **反向链接面板**（`BacklinksPanel`）：DocView 底部可折叠，调 `GET /api/backlinks/<path>`，列出引用此文档的所有源文档点击跳转。`refreshKey` 让保存后立即重查。
  - **新建文档对话框**（`NewDocDialog`）：DocList 顶部 `+ 新建` 按钮触发；输入路径默认前缀 `<username>/`，自动补 `.md`；先 `GET` 试探防止覆盖（已存在则直接打开），不存在则 `PUT` 写一行 `# basename` 模板，跳转 `/d/<path>?edit=1`。ESC 关闭，遮罩点击关闭。
  - 后端不动——所有功能都基于 Phase 1b/2d-1 已有的 doc CRUD / backlinks / share API。

- **Phase 2d-2 前端骨架**（Vite + React 18 + TS + Tailwind）：
  - `frontend/` 工程：`package.json` / `tsconfig` / `vite.config.ts` / `tailwind.config.js` / `postcss.config.js` / `index.html`。Vite dev server 把 `/api` 和 `/s` 反代到 `CLOUDFILE_DEV_BACKEND`（默认 localhost:5494，便于本地走 SSH tunnel 调）。
  - 视觉：按 DESIGN-SYSTEM Warm Scholar 暖琥珀方案，CSS 变量 + Tailwind `rgb(var(--bg) / <alpha-value>)` 模式，自动跟随 `prefers-color-scheme` 切深浅；字体栈 DM Sans / JetBrains Mono / Newsreader / Noto Sans SC fallback。
  - `src/lib/api.ts`：fetch 包装器，`credentials:'include'` 自动带 cookie；`encodePath` 按 `/` 分段 `encodeURIComponent`，路径含中文/空格/特殊字符不挂；HttpError 类带 status，调用方按 401 跳登录。
  - 3 页 MVP：
    - `Login`：用户名/邮箱 + 密码表单，401 静默显示 `invalid credentials`，登录成功跳 `/`。
    - `DocList`：`GET /api/docs`，按 mtime 倒序列出，loading 用 skeleton，空状态提示去 MCP/API 写。
    - `DocView`：`GET /api/docs/:path`（path 从 `/d/*` 解出，含多段），react-markdown + remark-gfm 渲染表格/任务列表/删除线；右上角"分享"按钮调 `POST /api/docs/{path}/share`，返回 share_url 自动 `navigator.clipboard.writeText` 复制 + 屏内提示。
  - `App.tsx` 启动时 `GET /api/me`：401 → `Login`；200 → `Layout`+ 已登录路由。`Layout` 顶栏含 logo / 用户名 / admin 标签 / 退出按钮。
  - 后端 `main.cpp` 加 `setDocumentRoot(/usr/local/share/cloudfile/web)` + `setCustomErrorHandler`：404 时按路径前缀分流——`/api/` 和 `/s/` 返 JSON 404，其他路径返 `index.html` 让 React Router 接管 SPA 路由。
  - `Dockerfile` 加 `node:20-slim AS frontend-builder` 阶段：`npm ci`（无 lockfile 时退化 `npm install`）+ `npm run build` 产 `dist/`，runtime 阶段 `COPY --from=frontend-builder` 到 `/usr/local/share/cloudfile/web`。和 C++ 阶段并行，整体 build time 不显著增加。

- **Phase 2d-1 公共分享链接**：
  - schema v2 migration：`share_tokens(id, token_hash, doc_path, created_by, created_at, expires_at, revoked_at)`，`token_hash` 唯一，`doc_path` 索引；半部分活跃 token（`revoked_at IS NULL`）走 partial index 加速 verify。
  - `domain/share`：`create / verify / revoke_by_id / list_for_doc / list_all`。token 32 字节随机 hex（64 chars），DB 存 BLAKE2b。`lifetime_days = 0` 表示永不过期（`expires_at = NULL`）。`verify()` 走 `WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`，过期/撤销静默 404。
  - `api/ShareController`：
    - `POST /api/docs/{path}/share`（挂 AuthFilter）→ body `{lifetime_days?: int}`，0 或缺省 = 永不过期。返回 `{id, path, token, share_url, expires_at}`。`share_url` 优先取 `CLOUDFILE_PUBLIC_BASE_URL` 环境变量，否则反推 `Host` header（开发环境 OK，上 HTTPS 必须显式设）。
    - `GET /s/{token}`（**不挂 filter**，正则 `[0-9a-fA-F]+` 限制 token 形态）→ 返回 HTML 渲染页：marked.js@12.0.2 CDN 客户端渲染（无需后端 Markdown 库），DESIGN-SYSTEM 暖琥珀配色 + 自适应深浅色。Markdown 内容用 `nlohmann::json::dump()` 转成 JS 字符串字面量塞进 `<script>`，自动 escape `</script>` 等 sentinel 防 XSS。CDN fail 自动降级 `<pre>` 兜底。token 无效或目标 doc 已删都返同一个 404 HTML（不暴露内部细节）。
  - `cloudfile_admin shares list / revoke`：列表打印 active/revoked/expired 三态，CLI 端按当前 UTC 时间字符串比对 expires_at 计算 expired 标签。
  - 安全权衡：share_url 是 64 字符随机，无外部枚举；只读、不能修改；可随时 `shares revoke` 立即失效。MVP 暂不限频，未来 Phase 3 上 nginx limit_req 兜一手。

- **Phase 2c MCP 工具补齐**（5 个工具）：
  - `read_doc(path)` → `GET /api/docs/<path>`
  - `write_doc(path, content)` → `PUT /api/docs/<path>` body `{content}`，触发单文件 git commit
  - `search_docs(query, limit?)` → `GET /api/search?q=...&limit=...`，trigram 中英文都吃
  - `backlinks_of(path)` → `GET /api/backlinks/<path>`
  - `recent_edits(limit?)` → 调 `/api/docs` 然后客户端截前 N 条（list_for_user 已按 mtime desc，无需后端新增端点）
  - 新增 `HttpClient::escape` / `escape_path`：用 `curl_easy_escape` URL 编码。`escape_path` 按 `/` 分段编码，保留路径分隔符——`bob/中文 笔记.md` 正确编为 `bob/%E4%B8%AD%E6%96%87%20%E7%AC%94%E8%AE%B0.md`，包含中文/空格/特殊字符的路径不会让 backend 收到坏 URL。
  - `tools/call` 内部错（参数缺失、类型错、JSON 解析失败）走 `result.isError=true + content[0].text`，不上升到 JSON-RPC 层；后端非 2xx 同样 wrap 成 isError，给 LLM 看到 HTTP 状态码 + body。
  - `require_arg<T>` 模板小工具：必填参数缺失/类型错时抛 std::runtime_error，外层统一捕获。

- **Phase 2b MCP server 核心**（stdio JSON-RPC 2.0 + 1 个烟测工具）：
  - `mcp_server/src/main.cpp` 替换 Phase 0 stub。stdio 行式 JSON 主循环，spdlog 强制走 stderr（stdout 留给协议——协议 stream 里混 log 整个就废了）。
  - 必需协议方法 `initialize` / `tools/list` / `tools/call`，外加 `ping` 和 `notifications/initialized`/`notifications/cancelled` 静默 ack。`initialize` 响应里 `protocolVersion` 回客户端给的——MCP 这两年版本切得勤，回客户端版本对兼容性最稳。
  - 错误码遵循 JSON-RPC 2.0：`-32700` parse error / `-32601` method not found / `-32603` internal error。tools/call 工具内部错则走 `result.isError = true` + content text，不上升到 JSON-RPC 层（这是 MCP spec 的约定）。
  - libcurl HttpClient：单 `CURL*` 复用，每请求 reset。`Authorization: Bearer $CLOUDFILE_MCP_TOKEN` 自动带；30s 超时；body 走 `CURLOPT_POSTFIELDS` + 自定义 `CURLOPT_CUSTOMREQUEST` 支持 PUT/DELETE。
  - 配置：`CLOUDFILE_MCP_TOKEN`（必填）+ `CLOUDFILE_BACKEND_URL`（默认 `http://127.0.0.1:8080`，容器内访问 backend）。token 缺失直接 `exit(1)` 让用户立刻发现。
  - 1 个烟测工具 `list_docs`：调 `GET /api/docs`，把响应 body 原样塞进 `content[0].text`。Phase 2c 补齐其余 5 个工具。
  - vcpkg 加 `curl[ssl]` 依赖；`mcp_server/CMakeLists.txt` link `CURL::libcurl`。

- **Phase 2a 后端 MCP token 认证**：
  - `domain/mcp_token`：`create / verify / revoke_by_id / list_all / list_for_user`。token 是 32 字节随机 hex（64 chars），DB 存 BLAKE2b(plaintext)，明文从 `create()` 返回一次。`verify()` 命中后顺手 `UPDATE last_used_at = now`，便于审计哪个 token 在用。`mcp_tokens` 表在 schema v1 已经造好，本阶段只填代码。
  - `api/AuthFilter`：取代 `SessionAuthFilter`。先看 `cfsession` cookie，未命中再读 `Authorization: Bearer <token>` 走 `mcp_token::verify`。两条路径都把 `user_id` 塞 `req->attributes()`，下游 controller 不感知差异——浏览器走 cookie，`cloudfile_mcp` 进程走 bearer。同一接口同一逻辑。`auth_controller.h` / `doc_controller.h` / `search_controller.h` / `backlinks_controller.h` 全部改名引用。
  - `cloudfile_admin mcp-token` 三个子命令：
    - `mcp-token create <username> <name>`：签发 token；明文打印一次；提示 `export CLOUDFILE_MCP_TOKEN=...` 给 MCP 进程
    - `mcp-token list`：列出 id / user_id / name / status / created_at / last_used_at
    - `mcp-token revoke <id>`：幂等设 `revoked_at`
  - 设计：token 是长生命周期（不像 session 30 天就过期），靠 `revoked_at` 控制。这跟 MCP 客户端经常断开重连的使用模式匹配——LLM 客户端不会每次都重新认证。

### Changed

- `SessionAuthFilter` 改名 `AuthFilter`（行为扩展见 Added）。所有挂这个 filter 的端点对外行为不变：cookie 客户端无感，新增接受 bearer token。

---

## [0.1.0] - 2026-04-27

> Phase 1 完成里程碑：认证 + 文档 CRUD + git 提交链路 + FTS 搜索 + wiki link/反向链接 全部跑通。
> 自托管单机部署，≤10 人小团队可用。下一步进 Phase 2（MCP + 前端）。

### Added

- **项目骨架**：C++20 + CMake + vcpkg manifest。依赖：Drogon、SQLiteCpp、libgit2、libsodium（Argon2id）、nlohmann/json、spdlog、fmt、GoogleTest。
- **Backend 最小垂直切片**：`cloudfile_backend` 可执行文件，启动 Drogon HTTP 服务，提供 `/api/health` 端点返回 `{"status":"ok","service":"cloudfile_backend","version":"0.1.0"}`。
- **SQLite schema v1**（自动迁移，WAL 模式）：
  - `users` / `invite_links` / `sessions` / `mcp_tokens`
  - `wiki_links`（双向链接索引表）
  - `docs_fts` FTS5 虚表，使用 **trigram tokenizer**——对中文全文搜索有效
  - `schema_version` 迁移追踪表
- **Docker 部署**：
  - Multi-stage `Dockerfile`（Ubuntu 24.04 builder → runtime）
  - `docker-compose.yml` 带 health check、volume 持久化、非 root 运行
- **`scripts/deploy.sh` 一键部署脚本**：清旧容器 + 清旧镜像 + `--no-cache` 构建 + 启动 + 等 health check。参数：
  - `--port <N>` 指定宿主机端口（默认 5494）
  - `--purge` 连同数据 volume 一起清（需打 `yes` 二次确认）
  - `--no-build` 跳过构建复用镜像
  - `--logs` 部署后自动跟踪日志
- **辅助进程骨架（Phase 0 占位）**：
  - `cloudfile_mcp`：MCP JSON-RPC server（Phase 2 实现）
  - `cloudfile_admin`：管理员 CLI（Phase 1 实现 `init-admin` / `invite` / `list-users` / `revoke-invite`）
- **开发脚本** `scripts/dev.sh`：`build` / `run` / `docker` / `test` / `clean`。
- **设计文档**：
  - [`DESIGN.md`](DESIGN.md)：产品定位、3 个实现方案对比、工程决策（原子性、并发锁、MCP 路径等 8 项）、测试策略、3 周实施计划
  - [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md)：Warm Scholar 视觉方向，CSS 变量 token（琥珀 `#D97706` 主色 + 卡其白 `#FFFBF5`）、DM Sans + Newsreader + JetBrains Mono 字体栈、AI 活动专属 token（wiki link 四种状态、AI 横幅等）
- [`README.md`](README.md) 快速开始 + 技术栈 + 目录结构 + 环境变量 + Phase 路线图。
- **Phase 1a-1 管理员初始化**：
  - `domain/password`：libsodium Argon2id 封装（OPSLIMIT/MEMLIMIT_INTERACTIVE），长度校验 12-1024
  - `domain/user`：users 表 CRUD + 登录查询（支持 username 或 email）+ 计数
  - `storage/Database::init()` / `::instance()` 单例——backend 和 admin_cli 共用一套连接语义
  - `cloudfile_admin init-admin` CLI 命令：密码优先从环境变量 `CLOUDFILE_INITIAL_ADMIN_PASSWORD` 读，回落到 tty echo-off 交互输入。默认 username=admin / email=admin@localhost，可用 `--username` / `--email` 覆盖。幂等：同名 admin 已存在时静默成功；已有其他用户则拒绝
  - 静态库 `cloudfile_core`：把 domain/storage 抽成单独 library，backend 和 admin_cli 共享编译产物（不用编两遍 .cpp）
- **Phase 1a-2a 邀请管理（CLI 侧）**：
  - `domain/invite`：`invite_links` 表 CRUD。token 生成用 libsodium `randombytes_buf` 32 字节随机数，hex 编码成 64 字符；DB 里只存 BLAKE2b(token) hash，不存明文——DB 泄露不等于邀请码泄露。`create()` 一次性返回明文 token，丢了只能 revoke 重发。`mark_used()` 走单条原子 UPDATE + `WHERE status = active` 条件，避免 check-then-act 竞态；供 `/api/register` 调用。状态枚举 `Active / Used / Revoked / Expired` 按严重程度降序判定。
  - CLI 4 个新命令：
    - `invite <email>`：7 天有效期，`created_by` 自动取第一个管理员。token 打到 stdout，日志走 stderr——`admin ... | tee` 分开清晰
    - `list-users`：id/username/email/role/created_at 表格
    - `list-invites`：含计算出的 status 列
    - `revoke-invite <id>`：幂等，已 revoked 的重复调也返回 0
- **Phase 1b-3 wiki link 解析 + 反向链接**：
  - `domain/wiki_link`：纯字符串扫 `[[target]]` 和 `[[target|alias]]`，跳过 ``` 围栏代码块（v1 不处理 inline `code`，写 wiki link 教学文档时再说，CHANGELOG 记一笔）。`inner` 含 `[` 视为非法（避免 `[[[a]]]` 之类），`|` 切 target/alias，前后 trim。
  - 解析规则（`resolve(target, src_path, exists_fn)`）：
    - target 含 `/` → 当 repo-relative，缺 `.md` 自动补
    - 裸名先试 `<src_user>/<name>.md`，存在则用；否则 fallback `shared/<name>.md`
    - 都不存在 → orphan，默认归 `<src_user>/` 目录（设计 D7：前端按红色虚线渲染）
  - `extract_links`：parse + resolve + dedupe + 排除自引用（避免一篇文章只引用自己造成 backlink 自环）。
  - `domain/doc::write` / `remove` 在 `Database::write_mutex` 同把锁下顺手调 `wiki_link::index_replace` / `index_delete_src`。删源文档时只清出边，入边保留——指向被删文档的链接成为 orphan，UI 渲染"已删除"（设计 D7）。`exists_fn` 闭包到 `doc::exists`，read-only FS stat，不竞写锁。
  - `api/BacklinksController`：`GET /api/backlinks/{path}` 返回所有指向 path 的源文档列表。先 `check_access` 当前用户对 dst_path 的可读权限（避免越权探测他人目录结构），再用 `check_access` 过滤可见 src_path。挂 `SessionAuthFilter`，正则路由 `/api/backlinks/(.+)` 捕获剩余段。
  - `cloudfile_admin rebuild-index` 扩展：先 FTS 全量重建，再 `wiki_link::rebuild_links_at` 全量重建出边。两次走 walk（先建 path 集再解析），≤1000 文档数量级毫秒级。整体在事务里。

- **Phase 1b-2 全文搜索 + FTS 索引维护**：
  - `domain/search`：FTS5 操作。`index_upsert(path, content)` DELETE + INSERT（FTS5 没有原生 UPSERT），`index_delete(path)`，`search(q, username, limit)` 走 `docs_fts MATCH ?` + `path LIKE 'username/%'/'shared/%'` 过滤可见性。命中里塞 `snippet(docs_fts, 2, '<mark>', '</mark>', '…', 16)` 高亮片段，按 `bm25(docs_fts)` 升序排（rank 越小越相关）。
  - 用户输入用 phrase 包装（`"<query>"`，内部 `"` 翻倍）——FTS5 `MATCH` 直接吃用户原文会被 `*` / `(` / `:` 等元字符炸；phrase 模式下所有非引号字符当字面量，配合 trigram tokenizer 自然支持中英文子串匹配。FTS5 syntax 错（理论上不应触发）log warn 返空数组，不 5xx。
  - title 提取：扫文件第一个 `# heading` 行（`#` 后必须有空格才算 heading，markdown 规范），fallback basename without `.md`。
  - `domain/doc::write` / `remove` 在 `Database::write_mutex` 同把锁下顺手调 `index_upsert` / `index_delete`——FTS 更新和 git commit 原子（架构决策 1.1）。FTS 写失败 log warn 不抛——FS+git 是真相源，drift 时 `rebuild-index` 救回。
  - `api/SearchController` `GET /api/search?q=...&limit=N`（默认 20，上限 100）→ `{query, hits:[{path, title, snippet, rank}]}`。空 q → 400。挂 `SessionAuthFilter`，每个用户只看到自己 + shared/ 的命中。
  - `cloudfile_admin rebuild-index` CLI：`scoped_lock(write_mutex)` 下 `DELETE FROM docs_fts` + 走 `recursive_directory_iterator` 扫 docs_repo（跳过 `.git/` 和 `.trash/`）+ 单条 transaction 批量 INSERT。重建场景：手动改了 docs_repo 文件、外部 git 同步、FTS 写失败积累 drift。
  - `domain/search` 进 `cloudfile_core` 不依赖 libgit2，admin_cli 直接复用同套代码，保证 backend 写入和 CLI 重建走完全一致的 title 提取逻辑。

- **Phase 1b-1 文档 CRUD + git commit 原子性**：
  - `storage/Repo` 单例：libgit2 薄壳。`Repo::init()` 在 `<data_root>/repo` 下 `git init` 或 `open`，空仓库自动 bootstrap（写 `.gitignore` + initial commit）。默认作者从 `CLOUDFILE_GIT_NAME` / `CLOUDFILE_GIT_EMAIL` 环境变量读，回落 `cloudfile` / `cloudfile@localhost`。用户提交时作者改写为 `<username> <user.email>`——git log 能看到是谁改的。
  - `commit_file(rel_path, content, ...)` / `commit_delete(rel_path, ...)`：写/删磁盘 + `git_index_add_bypath` / `git_index_remove_bypath` + `git_index_write_tree` + `git_commit_create`，整条链路走同一个 index，确保单次 commit 只含这一个文件的改动。RAII 包装 `git_repository` / `git_index` / `git_tree` / `git_commit` / `git_signature`，异常路径也不泄漏。
  - `domain/doc`：
    - `normalize()` 拒 `..` / 绝对路径 / 空段 / 控制字符 / 非 `.md` 后缀；统一 `\` → `/`。
    - `check_access(user, path)` 硬编码规则：允许 `<username>/...` 和 `shared/...`，其他 403。admin 走 CLI 不走此 API。
    - `list_for_user(user)` 扫 `docs_repo/<user>` + `docs_repo/shared`，按 `modified_at` 降序。≤10 人 × ≤1000 文档场景，FS walk 毫秒级。Phase 1b-1 不引入 `docs` 表——架构决策 1.1 说 FS + git 是唯一真相源，SQLite 是派生索引；list 走 FS 最直白，以后需要 LEFT JOIN FTS 再加。
    - `write` / `remove` 在 `Database::write_mutex` 下串行（架构决策 1.3）。失败不回滚文件——commit 写不上时，下次写同文件会自然带上；或用 `rebuild-index` CLI 修复（Phase 1b-2 实现）。
    - `ensure_user_dir(username)` 注册时调：`mkdir -p docs_repo/<username>`，幂等。空目录不 git commit，用户写第一篇文档时自然进 history。
  - `api/DocController` 4 个端点（全挂 `SessionAuthFilter`）：
    - `GET /api/docs` → `{docs: [{path, size_bytes, modified_at}...]}`，按 modified_at 降序
    - `GET /api/docs/<path>` → `{path, content}`，404 不存在
    - `PUT /api/docs/<path>` body `{content}` → 201 创建 / 200 更新
    - `DELETE /api/docs/<path>` → 200 `{status:"deleted"}` / 404
    - 通配路径用 `ADD_METHOD_VIA_REGEX("/api/docs/(.+)", ...)` 捕获剩余段；400 非法路径、403 越权、500 git 写失败
  - `main.cpp` 启动时先开 DB 再开 Repo，关停时 `Repo::shutdown_global()` 释放 libgit2 全局状态。
  - `AuthController::registerUser` 成功后调 `doc::ensure_user_dir(u.username)`——新用户登录即可往 `/api/docs/<username>/...` 写东西。

- **Phase 1a-2b 认证 HTTP API**：
  - `domain/session`：`sessions` 表 CRUD。sessions.id 列存 BLAKE2b(token)，明文 token 只从 `create()` 返回一次（写进 Set-Cookie）。`find_active_and_touch()` SELECT + UPDATE `last_seen_at` 在同一把 write_mutex 下，避免 lookup-then-update 竞态；过期的 session 自动返回 nullopt（SQL `WHERE expires_at > datetime('now')`）。默认 session 有效期 30 天。
  - `api/SessionAuthFilter`（Drogon filter）：读 `cfsession` cookie → 查 session → 把 user_id 塞进 `req->attributes()` → 放行；未认证/过期统一 401 JSON。
  - `api/AuthController` 4 个端点：
    - `POST /api/register`：body `{invite_token, username, email, password}`，校验 invite Active → 哈希密码 → 创建 user（`is_admin=false`）→ 原子消费 invite → 签发 session → Set-Cookie，返回 201 + user。409 冲突时回滚，410 Gone 表示 invite 非 Active 状态，400 表示字段缺失或格式错。
    - `POST /api/login`：body `{login, password}`，`login` 可以是 username 或 email。密码错和用户不存在都返 401 `"invalid credentials"`（防用户枚举）。
    - `POST /api/logout`：删 session + 清 cookie。幂等，无 cookie 也返 200。
    - `GET /api/me`：走 SessionAuthFilter；返回当前 user。session 指向的 user 已被删时返 401 + 清 cookie。
  - Cookie 属性：`HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`。`Secure` 属性由 `CLOUDFILE_COOKIE_SECURE=1` 环境变量控制，上 HTTPS 后打开（当前开发环境默认关闭，否则 localhost http 调试拿不到 cookie）。
  - 密码哈希用 ~100-500ms Argon2id，带来登录/注册单机天花板；10 人规模远未到。
  - `cloudfile_backend` 不需要改 main——Drogon 的 `HttpController` / `HttpFilter` 子类会通过全局构造函数自注册；`auth_controller.cpp` 和 `session_auth_filter.cpp` 在 `BACKEND_SOURCES` 里直接编进 exe（不经 static lib，避免 linker DCE）。

### Changed

- **`scripts/deploy.sh` 默认构建改走 Docker layer cache**（之前每次都 `--no-cache` + `docker rmi`）。实测改一行 .cpp 重部署从几分钟降到几十秒：只有 `cmake build` 那一层 invalidate 重跑，上面的 vcpkg install 层 hash 命中秒过。玄学 cache 问题用新加的 `--clean` flag 兜底（旧的 no-cache + rmi 行为）。改 `Dockerfile` / `vcpkg.json` 不需要 `--clean`——Docker 按层 hash 比对，自己会从改动那层往下 invalidate。
- Docker 宿主机默认端口 **8080 → 5494**。开发机上 8080 常被占（Tomcat、Jenkins、其他侧项目），5494 基本不冲突。容器内端口不变（仍为 8080）。可通过 `HOST_PORT` 环境变量或 `scripts/deploy.sh --port` 覆盖。
- `Dockerfile` 启用 BuildKit syntax `# syntax=docker/dockerfile:1.6` 并在 `cmake` 步骤挂 cache mount 到 `/opt/vcpkg/downloads` 和 `/root/.cache/vcpkg`。**效果**：首次 build 还是要 20-40 分钟编译依赖；之后任何改 C++ 代码触发的 rebuild，vcpkg 直接从 cache mount 恢复，跳过下载和编译——几十秒到几分钟。需要 Docker 20.10+ 和 BuildKit（docker compose v2 默认启用）。

### Fixed

- `scripts/deploy.sh` 在 `sh deploy.sh` 调用下崩溃（Ubuntu 的 `/bin/sh` 是 Dash，不支持 `set -o pipefail`、`[[ ]]`、数组等 bashism；shebang `#!/usr/bin/env bash` 在 `sh script.sh` 调用方式下被忽略）。修复：脚本起始加 `BASH_VERSION` 自检，非 bash 环境自动 `exec bash "$0" "$@"`；同时把 `+x` 位打进 git index，checkout 后可直接 `./deploy.sh`。
- `scripts/deploy.sh` 在只有 `docker-compose` v1 的机器上直接报错退出。修复：自动检测 `docker compose` v2（plugin）和 `docker-compose` v1，优先 v2，回落到 v1，并对 v1 打 EOL 警告但继续执行。脚本内全部 compose 调用走检测到的命令。
- `Dockerfile` 的 `useradd -r -u 1000` 在 Ubuntu 24.04 基础镜像上冲突（24.04 从 Ubuntu 23.10 起预置了 UID 1000 的 `ubuntu` 用户）。改用 UID 1500 避开默认用户，保持固定 UID 以确保 volume ownership 跨重启一致。
- `Dockerfile` 的 `VCPKG_COMMIT=2026.03.15` 和 `vcpkg.json` 的 `builtin-baseline: 2026.03.15` 是 Phase 0 commit 里的占位假值，vcpkg 对应的 tag/commit 不存在导致 `git checkout` 失败。修复：Dockerfile 改用 `VCPKG_REF=master`（shallow clone），`vcpkg.json` 移除 `builtin-baseline`（让 vcpkg 使用仓库 HEAD 作为默认 baseline）。未来需要复现性再通过 `--build-arg VCPKG_REF=<known-good-sha-or-tag>` 固定。
- `backend/CMakeLists.txt` 里 libgit2 的 vcpkg target 名写错了。vcpkg master 的真实 target 是 `find_package(libgit2)` + `libgit2::libgit2package`，不是 Phase 0 commit 里猜的 `unofficial-git2` / `unofficial::git2::git2`。修复后 CMake configure 能过。
- `backend/CMakeLists.txt` 无条件 `add_subdirectory(tests)` 在 Phase 0 阶段会失败（`tests/` 目录存在但没有 CMakeLists.txt）。改为只有 `tests/CMakeLists.txt` 实际存在时才 add_subdirectory——Phase 1 写测试时自动生效，不用再改这里。
- vcpkg 默认装的 sqlite3 不带 FTS5 模块（`sqlite3[core,json1]`），backend 启动时跑 schema 迁移创建 `docs_fts` 虚表立即崩：`no such module: fts5`。修复：`vcpkg.json` 显式声明 sqlite3 依赖并启用 `fts5` 和 `json1` features，vcpkg 会用这组 features 重新编译 sqlite3 和下游 sqlitecpp。

### Deferred to Post-0.1.0

- Wiki link 重命名时同步重写所有引用（设计决策 1.6，留到 Phase 2/3）
- MCP JSON-RPC 2.0 server（6 个工具：`list_docs` / `read_doc` / `write_doc` / `search_docs` / `backlinks_of` / `recent_edits`）—— Phase 2
- React + Milkdown 前端 —— Phase 2
- Nginx 反代 + Let's Encrypt HTTPS —— Phase 3
- pandoc 集成（Excel/docx 导入导出）—— P2

---

## 版本策略

- 遵循 [SemVer](https://semver.org/spec/v2.0.0.html)：
  - **MAJOR**：向后不兼容变更（DB schema 破坏性迁移、API 重写）
  - **MINOR**：新功能（向后兼容）
  - **PATCH**：Bug 修复、文档、内部重构

- **Tag 计划**：
  - `v0.1.0` — Phase 1 完成（认证 + 文档 CRUD + git 提交链路跑通）
  - `v0.2.0` — Phase 2 完成（Milkdown 编辑器 + wiki link + FTS + MCP server 可接 Claude Code）
  - `v0.3.0` — Phase 3 完成（HTTPS + 速率限制 + 端到端测试通过）
  - `v1.0.0` — 稳定后（自己用满一个月无 issue，可邀请第二位用户）

## 对比链接

- [Unreleased...HEAD](https://github.com/suitmob-liu/llm_study_code/compare/v0.1.0...HEAD)
- [0.1.0](https://github.com/suitmob-liu/llm_study_code/compare/d1165ac...v0.1.0)
