# 黄金金价走势分析工具

采集近两年黄金行情与国际宏观因子 → 复盘近一年走势 → 训练集成预测模型 → 给出**未来 5 小时 / 1 天 / 7 天**预测并存档 → 到期后自动对比实际价格、归因偏差、调整模型并记录历史。

> 仅供研究学习，不构成投资建议。

## 网页版（Docker 部署到 Linux）

```bash
# 把整个目录拷到服务器后
cp .env.example .env        # 按需修改端口、刷新间隔、管理口令、代理、pip 镜像
bash deploy.sh              # 等价于 docker compose up -d --build
# 浏览器打开 http://服务器IP:1012
```

首次启动会自动下载近两年的行情（约 10~30 秒）并训练模型，之后后台会持续运行：

| 后台任务 | 频率 | 说明 |
|---|---|---|
| 刷新行情 | 每 `REFRESH_MINUTES` 分钟（默认 5） | 增量拉取最近 5 天小时线和 1 个月日线，写入 SQLite |
| 回测到期预测 | 每次刷新后 | 对比实际价格、逐条归因、自动调整模型参数 |
| 自动预测 | 每 `PREDICT_INTERVAL_HOURS` 小时（默认 5，设为 0 关闭） | 只在交易时段生成，周末/休市不预测 |
| 重新训练 | 模型超过 7 天未训练时 | 用最新数据重训，已校准的参数保留 |

网页功能：

- **总览**：实时金价（美元/盎司、人民币/克），美元指数、10 年美债、VIX、白银、原油、汇率，最新 5h/1d/7d 预测卡片，近 5 日价格叠加预测点和区间。页面每 30 秒自动刷新。
- **走势**：1 日、5 日、1 月、3 月、6 月、1 年、2 年，以及自定义区间；可切换折线/K 线、美元/人民币，叠加 MA 均线；可与美元指数、美债、白银等对比（以起点 = 100 归一化）；附近一年复盘、月度涨跌、因子相关性。
- **历史查询**：按**日/周/月**查任意时段的开高低收、涨跌、振幅、高低点出现时刻、人民币价，同期国际因子变化，以及该时段内做过的预测；周/月可下钻到每日，日可下钻到每小时；"近一年列表"可一览每日/每周/每月的涨跌，点击即可查看明细。
- **预测与回测**：累计准确率与"价格不变"基准对比、预测价与实际价对比图、全部预测记录及偏差原因、模型变更历史；可一键预测、回测、重训。
- **国际情景**：在网页上调整各基本面因子的利多/利空和权重，保存后下一次预测立即生效。
- **系统**：后台任务状态、最近事件、各品种数据量与最新时间。

数据持久化在 Docker 卷 `gold_data`（容器内 `/data`）里，内容包括 SQLite 数据库（行情和预测记录）、模型、配置、国际情景、报告和变更日志。升级时重新执行 `bash deploy.sh` 即可，数据不会丢失。

常用运维命令：

```bash
docker compose logs -f                                   # 查看日志
docker compose exec gold python main.py history          # 在容器内使用命令行
docker compose exec gold python main.py train            # 手动重训
docker run --rm -v claude_g_gold_data:/data -v $PWD:/backup busybox tar czf /backup/gold_backup.tgz -C /data .   # 备份
```

> 卷的实际名称是 `<目录名>_gold_data`，可以用 `docker volume ls` 查看。
> 如果服务器无法直连 Yahoo Finance，请在 `.env` 中配置 `HTTPS_PROXY`；如果网页对公网开放，建议设置 `ADMIN_TOKEN`，防止他人修改情景或触发训练。

本地不用 Docker 时，直接运行 `pip install -r requirements.txt && python main.py serve` 即可。

## 命令行

```bash
pip install -r requirements.txt
python main.py analyze              # 近一年走势复盘 → reports/analysis_YYYYMMDD.md
python main.py predict              # 预测并存档（首次运行自动训练模型）
python main.py evaluate             # 验证已到期的预测 → 归因 → 调参 → reports/evaluation_*.md
python main.py history              # 累计准确率、最近预测、模型变更历史
```

其他命令：`train`（手动重训）、`run`（evaluate + predict，适合定时执行）、`context`（查看国际情景打分）。
加 `--offline` 只用本地缓存，不联网。

## 数据

来源：Yahoo Finance chart 接口，存储在 SQLite `data/gold.db` 的 `prices` 表中。首次全量下载（小时线 730 天、日线 2 年），之后增量更新，所以时间越久历史越长。

| 名称 | 代码 | 用途 |
|---|---|---|
| 黄金期货 | GC=F | 预测标的（美元/盎司），按汇率折算人民币/克 |
| 美元指数 | DX-Y.NYB | 美元强弱 |
| 10 年美债收益率 | ^TNX | 持有黄金的机会成本 |
| 白银 / WTI 原油 | SI=F / CL=F | 贵金属联动、通胀交易 |
| VIX | ^VIX | 避险情绪 |
| 美元/人民币 | CNY=X | 人民币金价折算 |

## 模型

每个预测周期单独训练，由 4 个分量加权集成：

| 分量 | 含义 |
|---|---|
| ridge | 多因子岭回归：黄金收益/波动/均线偏离/RSI + 美元、美债、白银、原油、VIX 的变化 |
| momentum | 动量：近期同周期涨跌会延续 |
| meanrev | 均值回归：偏离均线后会回归 |
| randomwalk | 随机游走：价格不变（金融预测最难打败的基准） |

- 权重：在最近 20% 的样本（样本外验证集）上做网格搜索确定，训练集与验证集之间剔除重叠窗口，避免信息泄露
- **国际趋势反馈**：`market_context.json` 中的基本面因子打分（-2 ~ +2）汇总为情景分，按 `bias_coef × σ` 叠加到预测上
- 预测区间：取验证集残差的 10%/90% 分位数，再按当前波动率与历史波动率之比缩放
- 方向标签：按预测收益相对 σ 的大小分为 上涨 / 偏涨 / 震荡 / 偏跌 / 下跌，并给出上涨概率

首次训练结果（2026-10-12，验证集为 2026 年 3 月至今）：

| 周期 | 样本外方向准确率 | MAE | 价格不变基准 MAE | 选中的分量 |
|---|---|---|---|---|
| 5 小时 | 48.6% | $20.6 | $20.6 | 均值回归 0.6 + 不变 0.4 |
| 1 天 | 52.7% | $45.6 | $45.6 | 动量 0.4 + 不变 0.6 |
| 7 天 | 54.0% | $113.7 | $114.4 | 动量 1.0 |

**说明：** 短周期金价基本接近随机游走，模型只比"价格不变"略好一点，多因子回归在样本外没有带来增益（权重为 0）。所以预测的价值主要在**区间和概率**上，不在点位。请把它当作有纪律的参考，而不是信号。

## 预测 → 验证 → 调整闭环

1. `predict`：结果写入 `data/gold.db` 的 `predictions` 表，内容包括基准价、预测价、区间、各分量贡献和到期时间
2. `evaluate`：对已到期的预测取目标时刻的实际价格，计算误差、方向是否命中、是否落在区间内，并逐条归因：
   - 偏离超过 2σ：判定为突发事件或数据冲击
   - 窗口内美元指数、美债收益率、VIX、原油的变动及其方向是否与金价一致
   - 哪些分量方向判断正确、哪些错误
   - 国际情景分方向是否与实际相反
   - 窗口是否包含休市时段
3. 自动调参（基于最近 20 条预测；重叠窗口按时间跨度折算有效样本数，避免过度反应）：
   - 分量权重向近期最优组合靠拢
   - 修正系统性偏差 `bias_offset`
   - 区间覆盖率偏离 80% 时缩放区间宽度
   - 根据情景分方向的命中率调整 `bias_coef`
4. 每次调整后版本号 +1，同时记录到 `model_history` 表、`history/model_changelog.md` 和 `reports/evaluation_*.md`
5. 模型超过 7 天未训练时会自动重训（校准参数保留）

## 更新国际情景（建议每周或重大事件后更新一次）

可以在网页的"国际情景"页直接修改，也可以编辑 `market_context.json`，调整各因子的 `impact`（-2 强利空 ~ +2 强利多）、`weight` 和 `updated_at`。也可以直接让 Claude 执行："搜索最新黄金市场新闻并更新 market_context.json"。情景超过 7 天未更新时，预测时会给出提示。

## 目录

```
main.py               命令行入口（serve 启动网页）
web/app.py            网页后端（FastAPI + 后台定时任务）
web/static/           网页前端（ECharts 已内置，不依赖外网 CDN）
gold/data.py          行情抓取与 SQLite 存储
gold/periods.py       按日/周/月查询
gold/features.py      特征工程
gold/model.py         训练与预测
gold/service.py       训练/预测/回测流程（命令行与网页共用）
gold/context.py       国际情景打分
gold/evaluate.py      验证、归因与调参
gold/analysis.py      近一年复盘
gold/store.py         数据库表结构与读写
Dockerfile / docker-compose.yml / deploy.sh / .env.example   部署相关

以下为运行状态，位于 GOLD_HOME（本地默认是项目目录，Docker 中为 /data）：
config.json           可调参数（会被反馈环节自动修改）
market_context.json   国际基本面因子
models/model.json     训练好的模型
data/gold.db          行情、预测记录、模型历史
reports/              分析报告与回测报告
history/              模型变更日志
```
