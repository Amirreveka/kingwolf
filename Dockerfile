FROM node:20-slim

WORKDIR /app

COPY artifacts/api-server/package*.json ./
RUN npm install --legacy-peer-deps --omit=dev

COPY artifacts/api-server/ ./

COPY artifacts/kingwolf/dist/public/ ../kingwolf/dist/public/

RUN mkdir -p data uploads/avatars uploads/media

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server.js"]
