#!/bin/bash

echo "🔄 Matando procesos del backend..."

# Matar procesos de Node.js que contengan 'backend' o 'dev' en su comando
pkill -f "node.*backend"
pkill -f "npm.*run.*dev"
pkill -f "nodemon"

# Matar procesos específicos del proyecto tote
pkill -f "tote.*backend"
pkill -f "src/index.js"

# Esperar un poco para que los procesos terminen
sleep 2

echo "✅ Procesos del backend terminados"

# Mostrar procesos restantes relacionados con Node.js
echo "📊 Procesos Node.js restantes:"
ps aux | grep node | grep -v grep || echo "No hay procesos Node.js ejecutándose"

echo ""
echo "🚀 Ahora puedes reiniciar el backend con:"
echo "   cd backend && npm run dev"
