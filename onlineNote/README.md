# Online Notes

一个轻量级的在线笔记系统，核心使用 C++ 实现，支持手机和电脑访问。

## 功能特性

- 用户名 + 密码登录，密码 SHA256 加盐存储，用户仅可通过服务器命令行管理
- 笔记的创建、编辑、删除、搜索
- 自动保存（停止输入 1.5 秒后自动保存，也支持 Ctrl+S）
- 响应式布局，电脑端左右分栏，手机端全屏切换
- 多用户隔离，每个用户只能看到自己的笔记
- 全局存储上限 1GB
- HttpOnly Cookie 会话，有效期 7 天

## 项目结构

```
onlineNote/
├── Makefile              # 构建脚本
├── setup.sh              # 下载依赖（cpp-httplib、sqlite3）
├── src/
│   ├── sha256.h          # SHA256 哈希实现
│   ├── main.cpp          # HTTP 服务器主程序
│   └── manage_users.cpp  # 用户管理命令行工具
└── static/
    ├── index.html        # 前端页面
    ├── style.css         # 响应式样式
    └── app.js            # 前端逻辑
```

## 技术栈

| 组件 | 技术 |
|------|------|
| HTTP 服务器 | [cpp-httplib](https://github.com/yhirose/cpp-httplib)（header-only） |
| 数据库 | [SQLite3](https://www.sqlite.org/)（amalgamation 编译） |
| 前端 | 原生 HTML / CSS / JavaScript |
| 编译要求 | C++17（GCC 8+） |

## 部署指南

### 1. 环境准备

需要 Linux 服务器上安装以下工具：

```bash
# Debian / Ubuntu
sudo apt install g++ make curl unzip

# CentOS / RHEL
sudo yum install gcc-c++ make curl unzip
```

### 2. 下载依赖并编译

```bash
cd onlineNote
bash setup.sh   # 自动下载 cpp-httplib 和 sqlite3 amalgamation 到 deps/
make             # 编译生成 server 和 manage_users 两个可执行文件
```

### 3. 用户管理

用户只能通过命令行管理，不支持网页注册：

```bash
# 添加用户
./manage_users add <username> <password>

# 查看所有用户
./manage_users list

# 修改密码
./manage_users passwd <username> <new_password>

# 删除用户（同时删除该用户的所有笔记）
./manage_users delete <username>

# 指定数据目录（默认为 data/）
./manage_users -d /path/to/data add admin mypassword
```

### 4. 启动服务

```bash
./server -p 8080
```

启动参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-p PORT` | 监听端口 | 8080 |
| `-d DIR` | 数据目录（存放 notes.db） | data |
| `-s DIR` | 静态文件目录 | static |
| `-h` | 显示帮助 | - |

启动后直接访问 `http://<服务器IP>:8080` 即可使用。

### 5. Nginx 反向代理（推荐）

通过 Nginx 将域名代理到服务端口，并启用 HTTPS：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

配置完成后重载 Nginx：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 6. Systemd 服务（开机自启）

创建 `/etc/systemd/system/onlinenote.service`：

```ini
[Unit]
Description=Online Note Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/onlineNote
ExecStart=/path/to/onlineNote/server -p 8080
Restart=always
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now onlinenote

# 查看状态
sudo systemctl status onlinenote

# 查看日志
sudo journalctl -u onlinenote -f
```

## 使用说明

### 登录

浏览器访问域名或 `http://<IP>:8080`，输入管理员在服务器上创建的用户名和密码登录。

### 笔记操作

- **新建笔记** — 点击左侧 `+ New Note` 按钮
- **编辑笔记** — 点击左侧笔记列表中的条目，在右侧编辑标题和内容
- **保存** — 停止输入 1.5 秒后自动保存，或按 `Ctrl+S` 立即保存
- **删除笔记** — 编辑区点击 `Delete` 按钮，确认后删除
- **搜索笔记** — 左侧搜索框输入关键词，实时过滤标题和内容

### 手机端

在手机浏览器中访问同一地址即可。界面自动适配：
- 笔记列表全屏显示
- 点击笔记进入编辑，点击 `Back` 返回列表

## 数据存储

- 数据库文件位于 `data/notes.db`（SQLite 格式）
- 备份只需复制该文件即可
- 全局存储上限 1GB，可在 `src/main.cpp` 中修改 `MAX_STORAGE` 常量后重新编译
