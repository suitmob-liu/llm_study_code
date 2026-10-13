# cloudfile

自托管 AI-first 小型云文档系统。≤10 人小团队用；LLM 通过 MCP 读写搜索你的文档。

**设计文档**：
- [`DESIGN.md`](./DESIGN.md) — 产品设计、架构、工程决策、测试策略、3 周计划
- [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) — 视觉设计系统（Warm Scholar 方向）

## 当前阶段：Phase 0 — Vertical Slice

能 `docker compose up` 起服务；`/api/health` 返回 200；SQLite schema 初始化到 v1。

**还没有**：认证、文档 CRUD、wiki link、FTS、MCP server、前端、HTTPS。下几个 Phase 按 `DESIGN.md` 里的 3 周计划实现。

## 快速开始

### 用 Docker（推荐）

**一键部署**（清旧容器 + 构建 + 启动 + 健康检查，默认端口 **5494**）：

```bash
scripts/deploy.sh
```

服务就绪后：`curl http://localhost:5494/api/health`。

常用参数：

```bash
scripts/deploy.sh --port 8080    # 指定其他端口
scripts/deploy.sh --no-build     # 跳过构建（容器已构建过）
scripts/deploy.sh --logs         # 部署后跟踪日志
scripts/deploy.sh --purge        # 删除数据 volume 后重部署（慎用！会丢所有文档）
```

**手动方式**（不用脚本）：

```bash
HOST_PORT=5494 docker compose up --build -d
curl http://localhost:5494/api/health
```

### 本地开发（Linux/WSL）

需要：gcc 13+、CMake 3.20+、Ninja、pkg-config、git，以及 [vcpkg](https://github.com/microsoft/vcpkg)。

```bash
export VCPKG_ROOT=/path/to/vcpkg
scripts/dev.sh build
scripts/dev.sh run
```

vcpkg 首次拉依赖可能 10-30 分钟，取决于网速。

## 技术栈

| | |
|---|---|
| 语言 | C++20 |
| Web 框架 | [Drogon](https://github.com/drogonframework/drogon) |
| 数据库 | SQLite（WAL 模式）+ [SQLiteCpp](https://github.com/SRombauts/SQLiteCpp) |
| 全文搜索 | SQLite FTS5 + `trigram` tokenizer（中文友好） |
| Git 操作 | [libgit2](https://libgit2.org/) |
| 密码哈希 | libsodium (Argon2id) |
| JSON | nlohmann/json |
| 日志 | spdlog |
| 构建 | CMake + Ninja + vcpkg |
| 测试 | GoogleTest |
| 前端 | Vite + React + Milkdown（Phase 2）|

## 目录结构

```
cloudfile/
├── CMakeLists.txt         根构建
├── vcpkg.json             依赖清单
├── Dockerfile             multi-stage build
├── docker-compose.yml
├── backend/               Drogon HTTP 后端（主要代码）
│   ├── include/cloudfile/ 公开头文件（api/ domain/ storage/）
│   ├── src/
│   └── tests/
├── mcp_server/            MCP JSON-RPC server（独立进程）
├── admin_cli/             cloudfile_admin CLI（init-admin/invite/...）
├── frontend/              React + Milkdown（Phase 2）
├── docs_repo/             运行时：git 仓库 + 用户目录（不入库）
├── attachments/           运行时：图片/PDF（不入库）
├── scripts/               开发辅助脚本
└── config/                Drogon 运行时配置
```

## 环境变量

| 名 | 默认 | 用途 |
|---|---|---|
| `CLOUDFILE_HOST` | `0.0.0.0` | 监听地址 |
| `CLOUDFILE_PORT` | `8080` | 监听端口 |
| `CLOUDFILE_DATA_ROOT` | `/var/lib/cloudfile` | SQLite + docs_repo 根目录 |
| `CLOUDFILE_DEV` | `0` | 1 = debug 日志 |
| `CLOUDFILE_INITIAL_ADMIN_PASSWORD` | — | `cloudfile_admin init-admin` 读取（Phase 1） |

## Phase 路线图

基于 `DESIGN.md § Next Steps`：

- **Phase 0 — Vertical Slice**（当前）：docker-compose + `/api/health` + SQLite schema
- **Phase 1 — 认证 + 文档 CRUD**：邀请链接、session、每用户目录、基本读写 API
- **Phase 2 — 编辑器 + 知识图谱 + MCP**：Milkdown 前端、wiki link、FTS、MCP server 6 个工具
- **Phase 3 — 部署 + 打磨**：Nginx 反代、HTTPS、速率限制、端到端测试

## License

TBD
