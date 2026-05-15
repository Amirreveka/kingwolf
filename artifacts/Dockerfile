FROM node:20-alpine

WORKDIR /app

# Copy api-server (includes pre-built frontend in ../kingwolf/dist/public)
COPY api-server/package*.json ./
RUN npm install --omit=dev

COPY api-server/ ./
COPY kingwolf/dist/public/ ./kingwolf/dist/public/

RUN mkdir -p data uploads/avatars uploads/media

EXPOSE 3001
EXPOSE 3443

ENV NODE_ENV=production
ENV PORT=3001
ENV HTTPS_PORT=3443

CMD ["node", "server.js"]
