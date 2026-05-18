FROM node:20-slim

WORKDIR /app

COPY api-server/package.json ./api-server/package.json

RUN cd api-server && npm install --omit=dev

COPY api-server ./api-server
COPY kingwolf/dist ./kingwolf/dist

EXPOSE 3001

CMD ["node", "api-server/server.js"]
