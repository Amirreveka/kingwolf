FROM node:20-alpine AS frontend-builder

WORKDIR /build
COPY artifacts/kingwolf/package*.json ./
RUN npm install --legacy-peer-deps
COPY artifacts/kingwolf/ ./
RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY artifacts/api-server/package*.json ./
RUN npm install --legacy-peer-deps --omit=dev

COPY artifacts/api-server/ ./

RUN mkdir -p ../kingwolf/dist/public
COPY --from=frontend-builder /build/dist/public ../kingwolf/dist/public/

RUN mkdir -p data uploads/avatars uploads/media

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server.js"]
