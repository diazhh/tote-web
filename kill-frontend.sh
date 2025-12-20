#!/bin/bash

echo "🔪 Matando procesos del frontend..."

# Matar procesos en puerto 3000 (puerto por defecto de Next.js)
if lsof -t -i:3000 >/dev/null 2>&1; then
    echo "✋ Matar proceso en puerto 3000..."
    kill -9 $(lsof -t -i:3000)
fi

# Matar procesos de Next.js
pkill -f "next dev" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true

# Matar procesos npm dev
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "npm.*dev" 2>/dev/null || true

# Limpiar procesos zombies
pkill -f "npm exec" 2>/dev/null || true

echo "✅ Frontend detenido"
