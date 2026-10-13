FROM python:3.12-slim

# pip 镜像源，在 .env 中配置；http 内网镜像需同时设置 PIP_TRUSTED_HOST
ARG PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
ARG PIP_TRUSTED_HOST=

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    GOLD_HOME=/data \
    TZ=Asia/Shanghai \
    PORT=8000

WORKDIR /app
COPY requirements.txt .
# 缓存挂载：构建失败重试时，已下载完的包不会重新下载；超时放宽并自动重试
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=120 --retries 10 \
      -i "$PIP_INDEX_URL" ${PIP_TRUSTED_HOST:+--trusted-host "$PIP_TRUSTED_HOST"} \
      -r requirements.txt

COPY gold ./gold
COPY web ./web
COPY main.py market_context.json ./

# 以非 root 用户运行；/data 存放数据库、模型、配置、报告（挂载为卷）
RUN useradd -m -u 1000 app && mkdir -p /data && chown -R app:app /data
USER app
VOLUME ["/data"]

EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=5)" || exit 1

CMD ["python", "main.py", "serve"]
