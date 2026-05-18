FROM node:20-slim

WORKDIR /app

COPY artifacts/api-server/ ./
COPY artifacts/kingwolf/dist/public/ /kingwolf/dist/public/
COPY artifacts/landing/ /landing/

# Remove SQLite deps (no longer used), install remaining deps
RUN npm install --omit=dev && mkdir -p data uploads/avatars uploads/media

VOLUME ["/app/uploads"]

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "server.js"]
