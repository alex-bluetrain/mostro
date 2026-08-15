# syntax=docker/dockerfile:1

# ---- build ----
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# `mastra build` bundlea la app y deja .mastra/output autocontenido
# (package.json propio + node_modules con las deps externas ya instaladas).
RUN pnpm build

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app

COPY --from=builder /app/.mastra/output ./

# La DuckDB de observability va a un volumen; el resto del output es inmutable.
RUN mkdir -p /data
ENV DUCKDB_PATH=/data/mastra.duckdb
ENV NODE_ENV=production
ENV PORT=4111
EXPOSE 4111

# Equivalente a `mastra start`.
CMD ["node", "index.mjs"]
