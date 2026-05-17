FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY artifacts/api-server/package*.json ./
RUN npm install --legacy-peer-deps

# Copy source (node_modules excluded via .dockerignore)
COPY artifacts/api-server/ .

# Ensure required directories exist
RUN mkdir -p data uploads/avatars uploads/media

EXPOSE 3001

CMD ["node", "server.js"]
