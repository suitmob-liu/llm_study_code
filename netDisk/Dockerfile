FROM python:3.12-slim

# pip 镜像源，在 .env 中配置；http 内网镜像需同时设置 PIP_TRUSTED_HOST
ARG PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
ARG PIP_TRUSTED_HOST=

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NETDISK_DATA=/data \
    TZ=Asia/Shanghai

WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=120 --retries 10 \
      -i "$PIP_INDEX_URL" ${PIP_TRUSTED_HOST:+--trusted-host "$PIP_TRUSTED_HOST"} \
      -r requirements.txt

COPY app ./app
COPY static ./static

# 以非 root 用户运行；/data 存放用户文件和会话数据库（挂载为卷）
RUN useradd -m -u 1000 app && mkdir -p /data && chown -R app:app /data
USER app
VOLUME ["/data"]

EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=5)" || exit 1

# --proxy-headers：在反代后面时从 X-Forwarded-For 取真实 IP（只信任 FORWARDED_ALLOW_IPS 里的来源）
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips \"${FORWARDED_ALLOW_IPS:-127.0.0.1}\" --timeout-keep-alive 30"]
