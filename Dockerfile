# ─── Stage 1: Build Frontend ────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build
COPY artifacts/kingwolf/package.json artifacts/kingwolf/package-lock.json* ./
RUN npm ci
COPY artifacts/kingwolf/ ./
RUN npm run build

# ─── Stage 2: Production ────────────────────────────────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/api-server

COPY artifacts/api-server/package.json artifacts/api-server/package-lock.json* ./
RUN npm ci --omit=dev

COPY artifacts/api-server/server.js artifacts/api-server/db.js ./

# Backend expects frontend at: path.join(__dirname, '..', 'kingwolf', 'dist', 'public')
# __dirname = /app/api-server → resolved path = /app/kingwolf/dist/public
COPY --from=frontend-builder /build/dist/public /app/kingwolf/dist/public

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["node", "server.js"]
