# ==================== Build Stage ====================
FROM ubuntu:22.04 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ make curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY setup.sh Makefile ./
COPY src/ src/
RUN bash setup.sh && make

# ==================== Runtime Stage ====================
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -s /bin/false appuser

WORKDIR /app
COPY --from=builder /build/server /build/manage_users ./
COPY static/ static/

RUN mkdir -p data && chown -R appuser:appuser /app/data

USER appuser
VOLUME /app/data
EXPOSE 8080

ENTRYPOINT ["./server"]
CMD ["-p", "8080"]
