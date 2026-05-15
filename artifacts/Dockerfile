# ── Stage 1: Build frontend ────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY kingwolf/package*.json ./
RUN npm install --prefer-offline 2>/dev/null || npm install
COPY kingwolf/ ./
RUN npm run build

# ── Stage 2: Production server ────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install backend dependencies
COPY api-server/package*.json ./
RUN npm install --omit=dev --prefer-offline 2>/dev/null || npm install --omit=dev

# Copy backend source
COPY api-server/ ./

# Copy pre-built frontend from stage 1
COPY --from=frontend-builder /frontend/dist/public/ ./kingwolf/dist/public/

RUN mkdir -p data uploads/avatars uploads/media

EXPOSE 3001
EXPOSE 3443

ENV NODE_ENV=production
ENV PORT=3001
ENV HTTPS_PORT=3443

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
