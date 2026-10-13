FROM python:3.12-slim

# 国内服务器可在构建时指定镜像源：--build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG PIP_INDEX_URL=https://pypi.org/simple

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    GOLD_HOME=/data \
    TZ=Asia/Shanghai \
    PORT=8000

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -i "$PIP_INDEX_URL" -r requirements.txt

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
