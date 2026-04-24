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

### Fixed

- `scripts/deploy.sh` 在 `sh deploy.sh` 调用下崩溃（Ubuntu 的 `/bin/sh` 是 Dash，不支持 `set -o pipefail`、`[[ ]]`、数组等 bashism；shebang `#!/usr/bin/env bash` 在 `sh script.sh` 调用方式下被忽略）。修复：脚本起始加 `BASH_VERSION` 自检，非 bash 环境自动 `exec bash "$0" "$@"`；同时把 `+x` 位打进 git index，checkout 后可直接 `./deploy.sh`。
- `scripts/deploy.sh` 在只有 `docker-compose` v1 的机器上直接报错退出。修复：自动检测 `docker compose` v2（plugin）和 `docker-compose` v1，优先 v2，回落到 v1，并对 v1 打 EOL 警告但继续执行。脚本内全部 compose 调用走检测到的命令。

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
