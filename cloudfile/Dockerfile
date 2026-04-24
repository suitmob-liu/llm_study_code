# syntax=docker/dockerfile:1.6
# Multi-stage build: builder → runtime
# 参考架构决策 1.3（单进程 + threading.Lock）
# 依赖通过 vcpkg manifest 拉取
#
# 需要 BuildKit（Docker 20.10+ 默认启用；docker compose v2 默认启用）。
# BuildKit cache mount 用于缓存 vcpkg 的 source tarball 和 binary cache，
# 让后续 rebuild 不用再花 20-40 分钟重装依赖。

# ============================================================
# Stage 1: Builder
# ============================================================
FROM ubuntu:24.04 AS builder

# VCPKG_REF 可以是 branch 或 tag。默认 master（首次能跑起来优先于可复现）。
# 生产用法：构建时传 --build-arg VCPKG_REF=<known-good-sha 或 tag>
# 真实 release tag 列表见 https://github.com/microsoft/vcpkg/releases
ARG VCPKG_REF=master

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    ninja-build \
    git \
    curl \
    zip \
    unzip \
    tar \
    pkg-config \
    ca-certificates \
    autoconf \
    autoconf-archive \
    automake \
    libtool \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# 安装 vcpkg（shallow clone 省时间；--branch 同时接 branch 和 tag）
RUN git clone --depth 1 --branch "${VCPKG_REF}" \
        https://github.com/microsoft/vcpkg.git /opt/vcpkg \
    && cd /opt/vcpkg \
    && ./bootstrap-vcpkg.sh -disableMetrics \
    && echo "vcpkg HEAD: $(git rev-parse HEAD)"

ENV VCPKG_ROOT=/opt/vcpkg
ENV PATH=$PATH:/opt/vcpkg

WORKDIR /build
COPY vcpkg.json ./
COPY CMakeLists.txt ./
COPY backend ./backend
COPY mcp_server ./mcp_server
COPY admin_cli ./admin_cli

# 缓存 vcpkg 的 source tarball (/opt/vcpkg/downloads) 和 binary cache
# (/root/.cache/vcpkg)。即使上面 COPY 层 cache 失效导致 RUN 重跑，vcpkg
# 也会直接从 cache mount 恢复，不用重新下载+编译依赖。
RUN --mount=type=cache,target=/opt/vcpkg/downloads,sharing=locked \
    --mount=type=cache,target=/root/.cache/vcpkg,sharing=locked \
    cmake -B out -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_TOOLCHAIN_FILE=/opt/vcpkg/scripts/buildsystems/vcpkg.cmake \
    && cmake --build out --parallel

# ============================================================
# Stage 2: Runtime (minimal)
# ============================================================
FROM ubuntu:24.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    pandoc \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# 非 root 用户运行
# UID 1500 避开 Ubuntu 24.04 基础镜像预置的 ubuntu 用户 (UID 1000)。
# 固定 UID 保证 volume 挂载 ownership 在重启后保持一致。
RUN useradd -r -u 1500 -m -d /var/lib/cloudfile cloudfile

COPY --from=builder /build/out/backend/cloudfile_backend        /usr/local/bin/
COPY --from=builder /build/out/mcp_server/cloudfile_mcp          /usr/local/bin/
COPY --from=builder /build/out/admin_cli/cloudfile_admin         /usr/local/bin/

# 配置 git 提交身份（不配的话 git commit 会失败）
ENV GIT_AUTHOR_NAME=cloudfile
ENV GIT_AUTHOR_EMAIL=cloudfile@localhost
ENV GIT_COMMITTER_NAME=cloudfile
ENV GIT_COMMITTER_EMAIL=cloudfile@localhost

# cloudfile 运行时配置
ENV CLOUDFILE_HOST=0.0.0.0
ENV CLOUDFILE_PORT=8080
ENV CLOUDFILE_DATA_ROOT=/var/lib/cloudfile

USER cloudfile
WORKDIR /var/lib/cloudfile

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD curl -fsS http://localhost:8080/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/cloudfile_backend"]
