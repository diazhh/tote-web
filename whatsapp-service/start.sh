#!/bin/bash

echo "🚀 Starting WhatsApp Service for Tote..."

if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ Please edit .env file with your configuration"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🔧 Creating required directories..."
mkdir -p logs whatsapp-session

echo "✅ Starting service with PM2..."
pm2 start ecosystem.config.js

echo ""
echo "📊 Service Status:"
pm2 status

echo ""
echo "📝 View logs with: pm2 logs whatsapp-service"
echo "🔍 Check status: curl http://localhost:3002/health"
echo ""
echo "✅ WhatsApp Service is running!"
