FROM node:20-slim

WORKDIR /app/api-server
COPY artifacts/api-server/package*.json ./
RUN npm install --legacy-peer-deps --omit=dev

COPY artifacts/api-server/ ./

WORKDIR /app
COPY artifacts/kingwolf/dist/public/ kingwolf/dist/public/

RUN mkdir -p /app/api-server/data /app/api-server/uploads/avatars /app/api-server/uploads/media

ENV NODE_ENV=production
EXPOSE 3001

WORKDIR /app/api-server
CMD ["node", "server.js"]
