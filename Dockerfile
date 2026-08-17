# syntax=docker/dockerfile:1

# ---- CLI de Infisical ----
# Solo para copiar el binario. Instalarlo por apt en runtime arrastraba ~180MB
# entre curl, el repo y las deps transitivas; el binario estático solo son 130MB.
# Tag fijo: `latest` haría que el mismo commit produzca imágenes distintas.
FROM infisical/cli:0.43.121 AS infisical

# ---- build ----
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Cache mount de BuildKit: el store de pnpm sobrevive entre builds locales.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# `mastra build` deja .mastra/output autocontenido: bundlea el código y corre
# `npm install` de las deps de producción dentro del output (docs oficiales:
# "The output directory is self-contained. You can copy it to any server").
#
# --studio agrega el frontend de Studio al output. Servirlo desde el mismo origen
# que la API es lo que hace que el login por cookie funcione: la sesión de Studio
# es una cookie SameSite=Lax, que el browser no manda cross-site.
RUN pnpm build --studio

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app

# CLI de Infisical: inyecta los secretos como env vars al arrancar, sin .env en disco.
# El binario es estático (Go), así que el de Alpine corre igual acá.
COPY --from=infisical /bin/infisical /usr/local/bin/infisical

# node:22-slim NO trae CA certificates. Sin esto el CLI muere con
# "x509: certificate signed by unknown authority" al hablar con Infisical.
# (Node no lo necesita porque lleva su propio store compilado; el binario de Go sí.)
COPY --from=infisical /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

COPY --from=builder --chown=node:node /app/.mastra/output ./

# La DuckDB de observability va a un volumen; el resto del output es inmutable.
RUN mkdir -p /data && chown node:node /data
ENV DUCKDB_PATH=/data/mastra.duckdb
ENV NODE_ENV=production
ENV PORT=4111
# Ruta de los assets de Studio dentro del output ya copiado a /app.
# Sin esta var el server no los sirve, aunque estén en la imagen.
ENV MASTRA_STUDIO_PATH=/app/studio
ENV INFISICAL_DISABLE_UPDATE_CHECK=true
EXPOSE 4111

# Non-root: el usuario `node` (uid 1000) ya existe en node:22-slim.
USER node

# Auth en dos pasos, como documenta Infisical: `login` canjea la identidad de
# máquina por un token de vida corta y `run` lo consume vía --token (el comando
# `run` no acepta credenciales directamente).
#
# El método gcp-id-token pide un ID token al metadata server de GCE, así que la
# identidad es la service account de la VM: no hay credenciales estáticas en la
# imagen ni en el host. INFISICAL_MACHINE_IDENTITY_ID e INFISICAL_PROJECT_ID no
# son secretos y llegan por env desde el docker-compose.
#
# `exec` reemplaza al shell por infisical (PID 1), que reenvía las señales de
# Docker al proceso de node que levanta.
CMD ["sh", "-c", "set -e; \
  INFISICAL_TOKEN=$(infisical login --method=gcp-id-token --silent --plain); \
  export INFISICAL_TOKEN; \
  exec infisical run --projectId \"$INFISICAL_PROJECT_ID\" --env prod -- node index.mjs"]
