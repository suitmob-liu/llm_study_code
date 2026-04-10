# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

LLM 辅助生成的在线笔记系统（onlineNote），C++ 后端 + 原生 JavaScript 前端，SQLite 存储，支持 Docker 部署。

## 构建与运行

所有构建命令在 `onlineNote/` 目录下执行：

```bash
# 下载依赖（cpp-httplib、SQLite3 源码）
bash setup.sh

# 编译（生成 server 和 manage_users 两个可执行文件）
make

# 运行服务（默认端口 8080）
./server -p 8080

# 用户管理
./manage_users add <username> <password>
./manage_users delete <username>
./manage_users passwd <username> <new_password>
./manage_users list
```

### Docker 部署

```bash
# 一键部署（构建镜像 + 启动容器，映射到主机 5493 端口）
bash deploy.sh

# 容器内管理用户
docker exec onlinenote ./manage_users add <username> <password>
```

## 架构

```
onlineNote/
├── src/
│   ├── main.cpp          # HTTP 服务器 + REST API（核心，所有路由和数据库操作）
│   ├── manage_users.cpp  # 用户管理 CLI 工具（独立可执行文件）
│   └── sha256.h          # SHA256 哈希实现（密码加盐存储）
├── static/
│   ├── index.html        # 单页应用入口
│   ├── app.js            # 前端全部逻辑（API 调用、状态管理、i18n）
│   ├── style.css         # 响应式样式 + 暗色模式
│   ├── sw.js             # Service Worker（PWA 离线支持）
│   └── manifest.json     # PWA 配置
├── Makefile              # 构建配置（C++17, g++, -O2）
├── Dockerfile            # 多阶段构建（ubuntu:22.04）
├── deploy.sh             # Docker 一键部署脚本
└── setup.sh              # 依赖下载脚本
```

### 数据流

浏览器 → app.js（REST 调用）→ main.cpp（HTTP 路由处理）→ SQLite3（notes.db）

### 关键技术选型

- **HTTP 框架**: cpp-httplib v0.15.3（header-only）
- **数据库**: SQLite3 amalgamation，启用 WAL 模式和 FTS5 全文搜索
- **编译**: C++17 标准，SQLite 编译参数 `SQLITE_THREADSAFE=1 SQLITE_ENABLE_FTS5`
- **前端**: 零依赖，原生 HTML/CSS/JS
- **认证**: SHA256 加盐哈希 + HttpOnly Cookie 会话（7 天过期）

### 数据库表

users, notes, folders, tags, note_versions, attachments, login_attempts

## 开发约定

### Git 提交格式

```
[type|component|description]
```

示例：`[feat|note|需求]创建日报条目自动生成创建时间信息`

type: feat / fix  
component: note / all  

### 代码规范

- 每个函数必须有注释说明其功能、入参、返回值及错误码
- 函数圈复杂度不超过 15，超过时需拆分

### 注意事项

- main.cpp 是单文件后端，所有路由和数据库操作都在其中，修改前需通读理解
- 前端 app.js 同样是单文件架构，包含全部业务逻辑
- 没有自动化测试，修改后需手动验证功能
- 依赖通过 setup.sh 下载到 `deps/` 目录，不在版本控制中
