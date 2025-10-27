#!/bin/bash

echo "🔄 === REINICIO COMPLETO DEL BACKEND ==="

# 1. Matar procesos existentes
echo "1️⃣ Matando procesos del backend..."
./kill-backend.sh

# 2. Esperar un poco más para asegurar que todo se cierre
echo "⏳ Esperando que los procesos terminen completamente..."
sleep 3

# 3. Verificar que no hay procesos corriendo
echo "🔍 Verificando procesos..."
if pgrep -f "node.*backend" > /dev/null; then
    echo "⚠️ Aún hay procesos del backend ejecutándose. Forzando cierre..."
    pkill -9 -f "node.*backend"
    sleep 2
fi

# 4. Limpiar logs anteriores (opcional)
echo "🧹 Limpiando logs anteriores..."
if [ -f "backend/logs/combined.log" ]; then
    > backend/logs/combined.log
fi
if [ -f "backend/logs/error.log" ]; then
    > backend/logs/error.log
fi
if [ -f "backend/logs/whatsapp.log" ]; then
    > backend/logs/whatsapp.log
fi

# 5. Iniciar el backend
echo "🚀 Iniciando backend..."
cd backend

# Verificar que las dependencias estén instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
fi

# Iniciar en modo desarrollo
echo "🎯 Iniciando servidor en modo desarrollo..."
echo "📍 El servidor se iniciará en http://localhost:3001"
echo "📊 Los logs se mostrarán a continuación..."
echo "🔗 Para detener el servidor, presiona Ctrl+C"
echo ""
echo "🔄 Iniciando con restauración automática de sesiones WhatsApp..."
echo "================================"

npm run dev
