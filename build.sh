#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "🔨 ساخت backend..."
cd artifacts/api-server
npm install --no-audit --no-fund

echo "🔨 ساخت frontend..."
cd ../kingwolf
npm install --no-audit --no-fund
PORT=5173 BASE_PATH=/ npm run build

echo "✅ ساخت تمام شد"
