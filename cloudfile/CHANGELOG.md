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

### Changed

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

- 认证（邀请链接 + session + Argon2id 密码哈希）
- 文档 CRUD API + git commit 原子性保存
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
