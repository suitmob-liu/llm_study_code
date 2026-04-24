# Changelog

All notable changes to **cloudfile** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

> Phase 0 骨架阶段。所有变更待 Phase 1（认证 + 文档 CRUD）完成后合并进 `0.1.0`。

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

### Not Yet Implemented (Phase 1+)

- Wiki link 解析 + 反向链接索引
- FTS5 全文搜索 API
- MCP JSON-RPC 2.0 server（6 个工具：`list_docs` / `read_doc` / `write_doc` / `search_docs` / `backlinks_of` / `recent_edits`）
- React + Milkdown 前端
- Nginx 反代 + Let's Encrypt HTTPS
- pandoc 集成（Excel/docx 导入导出，P2）

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

- [Unreleased...HEAD](https://github.com/suitmob-liu/llm_study_code/compare/d1165ac...HEAD)
