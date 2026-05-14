#!/bin/bash
# Auto setup + run for KingWolf on Replit

set -e
cd "$(dirname "$0")"

echo "🐺 KingWolf Messenger - شروع راه‌اندازی..."
echo ""

# Backend setup
cd artifacts/api-server

if [ ! -d "node_modules" ]; then
  echo "📦 نصب backend (یک‌بار، چند دقیقه طول می‌کشد)..."
  npm install --no-audit --no-fund
fi

# Clean stale DB lock from previous crash
rm -rf data/kingwolf.db.lock 2>/dev/null || true

# Seed demo data (only if not already seeded)
if [ -f "seed-rest.js" ]; then
  echo "🌱 پر کردن دیتای دمو..."
  node seed-rest.js 2>&1 || true
fi

# Start backend in background
echo "🚀 راه‌اندازی backend روی پورت 3001..."
node server.js &
BACKEND_PID=$!

# Wait a moment for backend to be ready
sleep 3

# Frontend setup
cd ../kingwolf

if [ ! -d "node_modules" ]; then
  echo ""
  echo "📦 نصب frontend (یک‌بار، چند دقیقه طول می‌کشد)..."
  npm install --no-audit --no-fund
fi

echo ""
echo "================================================================"
echo "✅ KingWolf آماده است!"
echo ""
echo "🌐 آدرس: روی webview Replit ببین"
echo ""
echo "🔑 ورود ادمین:    admin    / رمز قدیمی شما"
echo "👤 کاربر دمو:     parisa_a / demo1234"
echo "👤 کاربر دمو:     ayda_r   / demo1234"
echo "    (همه کاربران دمو رمزشان demo1234 است)"
echo "================================================================"
echo ""

# Start frontend (foreground)
PORT=5173 BASE_PATH=/ npm run dev

# Cleanup if frontend stops
kill $BACKEND_PID 2>/dev/null || true
