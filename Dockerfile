# ═══════════════════════════════════════════════════════════════════════════════
# GAB School — Production Dockerfile
#
# Multi-stage build:
#   builder → installs ALL deps, builds Vite SPA + esbuild API bundle
#   runner  → lean image: built artifacts + node_modules from builder
#
# node:22-slim (Debian/glibc) — rollup v4 + sharp native bindings require
# glibc; Alpine (musl) does NOT work.
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Builder ───────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

# ── Copy ALL workspace package.json files BEFORE pnpm install ─────────────────
# pnpm-lock.yaml (lockfileVersion 9) records importers for every workspace
# package. --frozen-lockfile will FAIL if any package.json is missing at
# install time. All entries in pnpm-workspace.yaml must be present here.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# artifacts/*
COPY artifacts/api-server/package.json    ./artifacts/api-server/
COPY artifacts/web/package.json           ./artifacts/web/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/

# lib/*
COPY lib/db/package.json                  ./lib/db/
COPY lib/api-zod/package.json             ./lib/api-zod/
COPY lib/api-spec/package.json            ./lib/api-spec/
COPY lib/api-client-react/package.json    ./lib/api-client-react/
COPY lib/object-storage-web/package.json  ./lib/object-storage-web/

# scripts/
COPY scripts/package.json                 ./scripts/

# Install all dependencies (dev + prod) needed for the build
RUN pnpm install --frozen-lockfile

# ── Copy source and build ──────────────────────────────────────────────────────
COPY . .

# Vite SPA → artifacts/web/dist/public/
# BASE_PATH=/ tells vite.config.ts to use the root path (required by the guard)
ENV NODE_ENV=production \
    BASE_PATH=/

RUN pnpm --filter @workspace/web build

# esbuild CJS bundle → artifacts/api-server/dist/index.cjs
RUN pnpm --filter @workspace/api-server build

# ── Stage 2: Production runner ─────────────────────────────────────────────────
FROM node:22-slim AS runner

# The production image includes the background 720p worker by default.
# A runtime environment value can still explicitly override this.
ENV ENABLE_DRIVE_TRANSCODE=true

ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown

WORKDIR /app

# System packages:
#   wget   — required by HEALTHCHECK
#   ffmpeg — required by background HLS transcode worker (driveTranscode.ts)
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# ── Copy built artifacts from builder ─────────────────────────────────────────
# API server CJS bundle
COPY --from=builder /app/artifacts/api-server/dist \
                    ./artifacts/api-server/dist

# Vite SPA static files (served by Express at /app/public)
COPY --from=builder /app/artifacts/web/dist/public \
                    ./public

# pnpm stores packages in a virtual store (node_modules/.pnpm/) and creates
# per-workspace symlinks. We must copy BOTH:
#   1. /app/node_modules       — the virtual store (.pnpm/ with actual files)
#   2. /app/artifacts/api-server/node_modules — workspace-level symlinks that
#      point into the .pnpm store (web-push, express, sharp, drizzle-orm, etc.)
# Node resolves requires from /app/artifacts/api-server upward through /app.
COPY --from=builder /app/node_modules \
                    ./node_modules
COPY --from=builder /app/artifacts/api-server/node_modules \
                    ./artifacts/api-server/node_modules

# ── Build verification (printed in Dokploy build logs) ────────────────────────
RUN echo "=== BUILD VERIFICATION ===" \
    && echo "  GIT_SHA   : ${GIT_SHA}" \
    && echo "  BUILD_DATE: ${BUILD_DATE}" \
    && echo "--- /app/public ---" \
    && ls -la /app/public/ \
    && echo "--- deploy-test.txt ---" \
    && cat /app/public/deploy-test.txt \
    && echo "--- api-server bundle ---" \
    && ls -lh /app/artifacts/api-server/dist/ \
    && echo "=== OK ==="

# Persistent storage directory (Docker volume mounted here)
RUN mkdir -p /app/data

# ── Runtime environment ────────────────────────────────────────────────────────
ENV NODE_ENV=production \
    PORT=3000

# ── Image metadata ─────────────────────────────────────────────────────────────
LABEL org.opencontainers.image.title="GAB School" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

EXPOSE 3000

# Docker Swarm uses the image HEALTHCHECK, NOT docker-compose.yml healthcheck.
# start_period=90s gives the app time to run DB migrations before first probe.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=90s \
    CMD wget -qO- http://localhost:3000/api/healthz || exit 1

WORKDIR /app/artifacts/api-server
CMD ["node", "dist/index.cjs"]
