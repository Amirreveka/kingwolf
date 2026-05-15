# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY kingwolf/package*.json ./
RUN npm install --prefer-offline 2>/dev/null || npm install
COPY kingwolf/ ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine

WORKDIR /app

COPY api-server/package*.json ./
RUN npm install --omit=dev --prefer-offline 2>/dev/null || npm install --omit=dev

COPY api-server/ ./

COPY --from=frontend-builder /frontend/dist/public/ ./kingwolf/dist/public/

RUN mkdir -p data uploads/avatars uploads/media

EXPOSE 8000

ENV NODE_ENV=production
ENV PORT=8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8000/health || exit 1

CMD ["node", "server.js"]
