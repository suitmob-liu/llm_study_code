# Release Note

## 2026-04-10

### 4eca10c — 新增 WxPusher 免费微信推送渠道
- 新增 WxPusher 通知渠道（完全免费，2000条/天），替代 PushPlus 成为推荐渠道
- 用户在通知设置中选择 WxPusher，填入 `appToken|UID` 即可推送到个人微信
- 后端新增 `_send_wxpusher()` 发送函数，调用 wxpusher.zjiecode.com API
- 全局 fallback 优先级调整为：WxPusher > PushPlus > Server酱 > 企业微信
- 更新 `.env.example`、`docker-compose.yml` 支持 `WXPUSHER_APPTOKEN` 和 `WXPUSHER_UID`
- 前端通知设置面板新增 WxPusher 选项及获取指引

### 2c4b6d8 — 新增五套主题切换功能
- 新增五套 UI 主题：墨纸禅（深色默认）、春日笺（浅色多彩）、赛博霓虹、山林雾、落日沙
- 顶栏新增太阳图标按钮，点击打开主题选择面板
- CSS 变量驱动全部主题，切换带平滑过渡动画
- 赛博主题印章霓虹发光特效
- 浅色主题（春日笺）适配日历选择器样式
- 主题选择通过 localStorage 持久化，刷新不丢失

### d8f268b — 部署脚本改用纯 docker 命令
- `docker-deploy.sh` 完全去除 docker-compose 依赖
- 直接使用 `docker build` + `docker run`，兼容所有 Docker 版本
- 自动读取 `.env` 文件传入环境变量

### 8fc2d27 — 修复 docker compose 命令检测逻辑
- 修复旧逻辑在 docker compose 不存在时 fallback 到 docker-compose 仍报错的问题
- 改为先检测 `docker compose`，再检测 `docker-compose`，都不存在则报错退出

### 648a63e — 新增 Docker 一键部署脚本
- 新增 `docker-deploy.sh`，支持 deploy/clean/purge/stop/logs/status 六个命令
- 修改代码后一条命令即可重部署，自动清理旧容器和镜像
- purge 模式二次确认后才删除数据库

### 3f25427 — 完善 README 文档
- 补充功能分类详述、项目结构、API 概览表（16 个接口）

### 19cced1 — 新增待办事项管理系统（初始版本）
- Flask + SQLite 后端，原生 HTML/CSS/JS 前端
- 用户注册需管理员审核，最多 10 个用户
- 待办 CRUD，自动生成创建时间，可选截止日期，逾期高亮
- 微信推送通知（PushPlus/Server酱/企业微信），每用户独立配置 Token
- 定时推送（每天/每周指定日），APScheduler 后台调度
- Docker + systemd 两种部署方式
- 墨纸禅风 UI 设计：深色宣纸质感 + 朱红印章 + 书法字体
- 管理员面板：审核/拒绝/删除用户
- 用户可自行修改密码
