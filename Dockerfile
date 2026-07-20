# ═══════════════════════════════════════════════════════════════════════════════
# GAB School — Production Dockerfile
#
# Multi-stage build:
#   builder  — installs all deps, builds web (Vite) + api-server (esbuild)
#   runner   — lean image with only what's needed at runtime
#
# NOTE: uses node:22-slim (Debian) not Alpine — rollup v4 native bindings
#       require glibc which Alpine (musl) does not provide.
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/web/package.json         ./artifacts/web/
COPY lib/db/package.json                ./lib/db/
COPY lib/api-zod/package.json           ./lib/api-zod/
COPY lib/api-spec/package.json          ./lib/api-spec/
COPY lib/api-client-react/package.json  ./lib/api-client-react/
COPY lib/object-storage-web/package.json ./lib/object-storage-web/

RUN pnpm install --frozen-lockfile

# Copy all source
COPY . .

# Build web frontend (Vite SPA → dist/public/)
ENV NODE_ENV=production BASE_PATH=/
RUN pnpm --filter @workspace/web build

# Build API server (esbuild bundles everything → dist/index.cjs)
# v2: fixed Express 5 wildcard route (*path instead of *)
RUN pnpm --filter @workspace/api-server build

# ── Stage 2: Production image ───────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

# wget is needed for the Docker healthcheck
# ffmpeg is needed for the background 720p transcode worker (driveTranscode.ts)
RUN apt-get update && apt-get install -y wget ffmpeg --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy workspace manifests for production dependency installation
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json               ./lib/db/
COPY lib/api-zod/package.json          ./lib/api-zod/
COPY lib/api-spec/package.json         ./lib/api-spec/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/object-storage-web/package.json ./lib/object-storage-web/

# Install production dependencies only (workspace deps are bundled in index.cjs)
RUN pnpm install --prod --frozen-lockfile

# Copy built server bundle
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Copy web static files
COPY --from=builder /app/artifacts/web/dist/public ./public

# Data directory (mounted as Docker volume — files persist between restarts)
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/artifacts/api-server
CMD ["node", "dist/index.cjs"]
