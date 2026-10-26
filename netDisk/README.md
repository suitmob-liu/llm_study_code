# netDisk

部署在 Linux 服务器上的私人在线网盘：密码登录，总容量 2G，最多 10 台设备同时在线。手机和电脑浏览器都能用，不需要装 App。

## 功能

- **密码登录**：只有一个访问密码，在 `.env` 里配置。同一 IP 连续输错 5 次锁定 10 分钟，防止暴力破解。
- **容量上限 2G**：所有文件加起来不能超过 2G（可配置）。上传时边收边计算，多台设备同时上传也不会超出；空间不够时直接拒绝，不会留下半截文件。
- **最多 10 台设备同时在线**：每次登录算一台设备。满 10 台后，新设备登录会列出当前在线的设备，可以选择「下线最久未使用的设备并登录」。页面右上角 📱 可以查看所有在线设备（名称、IP、最近活动时间），远程下线丢失的设备，也可以给本机改名。设备 30 天不活动自动下线。修改密码后，所有设备都要重新登录。
- **文件管理**：上传文件或整个文件夹（支持拖拽，带进度条，可取消）、新建文件夹、重命名、移动、删除、按文件名搜索。
- **下载 / 预览**：单个文件直接下载（支持断点续传）；文件夹或多选时打包成 zip 下载（边打包边下载，不占服务器磁盘）。图片、视频、音频、PDF、文本可以在线预览。
- **多设备同步**：页面重新获得焦点时和每 30 秒自动刷新，其他设备上传或删除的文件会自动出现或消失。

## 技术栈

| 组件 | 技术 |
|---|---|
| 后端 | Python 3.12 + FastAPI + uvicorn |
| 会话存储 | SQLite（只存 token 的 SHA-256，不存明文） |
| 文件存储 | 直接存放在服务器文件系统（Docker 数据卷 `/data/files`） |
| 前端 | 原生 HTML / CSS / JS，无构建步骤，自适应手机和电脑，跟随系统深色模式 |
| 部署 | Docker + docker compose，`deploy.sh` 一键部署 |

## 项目结构

```
netDisk/
├── app/
│   ├── config.py      # 环境变量配置
│   ├── sessions.py    # 登录会话（设备）管理、密码校验、登录失败锁定
│   ├── storage.py     # 路径安全校验、容量配额
│   └── main.py        # HTTP 接口与页面路由
├── static/            # 前端：login.html / index.html / app.js / style.css
├── tests/test_api.py  # 接口测试
├── Dockerfile
├── docker-compose.yml
├── deploy.sh          # 一键部署脚本
└── .env.example       # 配置模板
```

## 部署（Docker，推荐）

前提：服务器已安装 Docker 和 docker compose 插件（`curl -fsSL https://get.docker.com | sh`）。

```bash
cd netDisk
bash deploy.sh                       # 首次运行会生成 .env 并提示设置登录密码
```

部署成功后访问 `http://<服务器IP>:8686`。云服务器需要在**安全组 / 防火墙放行 8686 端口**。

常用操作：

```bash
bash deploy.sh --password 新密码       # 修改密码（所有设备需要重新登录）
bash deploy.sh --port 9000             # 修改端口
bash deploy.sh --no-build              # 只改了 .env 配置，不重新构建，直接重启
bash deploy.sh --logs                  # 部署后跟踪日志
bash deploy.sh --stop                  # 停止服务（文件保留）
bash deploy.sh --purge                 # ⚠ 清空网盘所有文件后重新部署
```

### 配置项（`.env`）

| 名称 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8686` | 宿主机端口 |
| `NETDISK_PASSWORD` | — | 登录密码，必填，至少 6 位；不能包含空格、美元符、单双引号、井号、反斜杠、反引号 |
| `NETDISK_QUOTA_GB` | `2` | 网盘总容量（GB），可以写小数 |
| `NETDISK_MAX_DEVICES` | `10` | 同时在线设备数上限 |
| `NETDISK_SESSION_DAYS` | `30` | 设备多少天不活动后自动下线 |
| `NETDISK_LOGIN_MAX_FAILS` | `5` | 同一 IP 连续输错几次密码后锁定 |
| `NETDISK_LOGIN_LOCK_MINUTES` | `10` | 锁定时长（分钟） |
| `NETDISK_COOKIE_SECURE` | `0` | 配好 HTTPS 后改为 `1` |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1` | 前面有反代时，填反代的来源 IP，用来获取真实客户端 IP |

修改 `.env` 后执行 `bash deploy.sh --no-build` 生效。

### 数据备份

所有文件和会话数据库都在 Docker 数据卷 `netdisk_netdisk_data` 里：

```bash
# 备份
docker run --rm -v netdisk_netdisk_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/netdisk-backup.tgz -C /data files
# 查看数据卷在宿主机上的位置
docker volume inspect netdisk_netdisk_data -f '{{ .Mountpoint }}'
```

## 配置 HTTPS（强烈建议）

HTTP 下密码和文件都是明文传输，长期使用建议加一层 Nginx + HTTPS。Nginx 配置示例：

```nginx
server {
    listen 443 ssl http2;
    server_name pan.example.com;
    ssl_certificate     /etc/nginx/cert/pan.pem;
    ssl_certificate_key /etc/nginx/cert/pan.key;

    client_max_body_size 0;          # 不限制上传大小（容量由 netDisk 自己控制）
    proxy_request_buffering off;     # 上传直接流式转发，不在 Nginx 落盘
    proxy_buffering off;             # 下载直接流式转发
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://127.0.0.1:8686;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

然后在 `.env` 里设置：

```
NETDISK_COOKIE_SECURE=1
FORWARDED_ALLOW_IPS=172.17.0.1     # Nginx 在宿主机上时，容器看到的来源是 Docker 网关
```

用 `docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}'` 可以查到网关地址；compose 默认网络的网关可能是 `172.18.0.1` 等，以实际为准。设置 `FORWARDED_ALLOW_IPS` 后，把 `docker-compose.yml` 的端口映射改为 `"127.0.0.1:${PORT:-8686}:8000"`，只让本机的 Nginx 访问，然后执行 `bash deploy.sh --no-build`。

## 不用 Docker 部署

```bash
cd netDisk
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
NETDISK_PASSWORD='你的密码' NETDISK_DATA=/var/lib/netdisk \
  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8686
```

用 systemd 托管时，把上面的环境变量写进 `Environment=`，`ExecStart` 填 uvicorn 的完整路径。

## 本地开发与测试

```bash
cd netDisk
pip install -r requirements.txt httpx
python -m unittest discover -s tests -v            # 接口测试（登录锁定、设备上限、配额、越权路径等）

# 本地运行（Windows PowerShell 用 $env:NETDISK_PASSWORD="..." 设置环境变量）
NETDISK_PASSWORD=dev-pass NETDISK_DATA=./data uvicorn app.main:app --reload --port 8686
```

## 安全设计

- Cookie 设置 `HttpOnly` + `SameSite=Lax`；所有写接口必须带 `X-Requested-With: netdisk` 请求头（简易 CSRF 防护）。
- 所有路径都会做规范化和越权检查（拒绝 `..`、绝对路径、非法字符、指向网盘外的符号链接）。
- 在线预览只放行图片、音视频、PDF；文本类文件（包括 `.html`）一律以 `text/plain` 返回，SVG 强制下载，防止上传的网页在本站执行脚本。
- 容器以非 root 用户运行；宿主机磁盘至少保留 200MB，防止把服务器写满。
