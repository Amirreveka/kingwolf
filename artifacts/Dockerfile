FROM node:20-alpine

WORKDIR /app

# ── Isolation note ─────────────────────────────────────────────────────────────
# At RUNTIME the container makes zero external network requests:
#   • All fonts (Vazirmatn) are bundled in dist/public/assets (no Google Fonts CDN)
#   • All icons (Lucide React) are bundled in the JS chunk
#   • No external API calls from the frontend or backend
# The only outbound connection at runtime is the WebSocket to other KingWolf clients
# on the SAME server (internal), plus any user-triggered media uploads.
# ──────────────────────────────────────────────────────────────────────────────

# Copy api-server (includes pre-built frontend in ../kingwolf/dist/public)
COPY api-server/package*.json ./
RUN npm install --omit=dev --prefer-offline 2>/dev/null || npm install --omit=dev

COPY api-server/ ./
COPY kingwolf/dist/public/ ./kingwolf/dist/public/

RUN mkdir -p data uploads/avatars uploads/media

EXPOSE 3001
EXPOSE 3443

ENV NODE_ENV=production
ENV PORT=3001
ENV HTTPS_PORT=3443

# Health check for docker-compose service_healthy condition
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
