#!/bin/bash

echo "🧪 === PRUEBA DE PERSISTENCIA WHATSAPP ==="
echo ""

# Función para verificar si el backend está corriendo
check_backend() {
    if pgrep -f "node.*backend" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Función para esperar que el backend esté listo
wait_for_backend() {
    echo "⏳ Esperando que el backend esté listo..."
    local count=0
    while [ $count -lt 30 ]; do
        if curl -s http://localhost:3001/health > /dev/null 2>&1; then
            echo "✅ Backend está respondiendo"
            return 0
        fi
        sleep 1
        count=$((count + 1))
        echo -n "."
    done
    echo ""
    echo "❌ Backend no responde después de 30 segundos"
    return 1
}

echo "1️⃣ Verificando estado inicial..."

if check_backend; then
    echo "✅ Backend está ejecutándose"
    
    # Verificar endpoint de salud
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Backend responde correctamente"
    else
        echo "⚠️ Backend ejecutándose pero no responde"
    fi
else
    echo "❌ Backend no está ejecutándose"
    echo "🚀 Iniciando backend..."
    
    cd backend
    npm run dev > ../backend-test.log 2>&1 &
    cd ..
    
    if ! wait_for_backend; then
        echo "❌ No se pudo iniciar el backend"
        exit 1
    fi
fi

echo ""
echo "2️⃣ Verificando instancias de WhatsApp..."

# Usar el script de gestión para diagnóstico
cd backend
echo "1" | node src/scripts/whatsapp-manager.js 2>/dev/null | head -20
cd ..

echo ""
echo "3️⃣ Probando reinicio del backend..."

echo "🔄 Matando backend actual..."
./kill-backend.sh > /dev/null 2>&1

sleep 3

echo "🚀 Reiniciando backend..."
cd backend
npm run dev > ../backend-restart-test.log 2>&1 &
BACKEND_PID=$!
cd ..

if ! wait_for_backend; then
    echo "❌ No se pudo reiniciar el backend"
    exit 1
fi

echo ""
echo "4️⃣ Verificando restauración de sesiones..."

# Esperar un poco más para que se complete la restauración
sleep 5

# Verificar logs de restauración
if grep -q "Restaurando sesiones de WhatsApp" backend-restart-test.log; then
    echo "✅ Proceso de restauración iniciado"
    
    # Mostrar resumen de restauración
    echo "📊 Resumen de restauración:"
    grep -E "(Encontradas|Sesiones restauradas|inicializadas|Conectadas)" backend-restart-test.log | tail -5
else
    echo "⚠️ No se encontraron logs de restauración"
fi

echo ""
echo "5️⃣ Verificando estado final..."

cd backend
echo "1" | timeout 10 node src/scripts/whatsapp-manager.js 2>/dev/null | head -15
cd ..

echo ""
echo "📊 === RESUMEN DE LA PRUEBA ==="

if check_backend; then
    echo "✅ Backend funcionando correctamente"
else
    echo "❌ Backend no está funcionando"
fi

if [ -f "backend-restart-test.log" ]; then
    if grep -q "Sesiones restauradas" backend-restart-test.log; then
        echo "✅ Restauración de sesiones funcional"
    else
        echo "⚠️ Restauración de sesiones no detectada"
    fi
    
    if grep -q "Sincronización periódica iniciada" backend-restart-test.log; then
        echo "✅ Sincronización automática activada"
    else
        echo "⚠️ Sincronización automática no detectada"
    fi
else
    echo "❌ No se generaron logs de prueba"
fi

echo ""
echo "📁 Archivos de log generados:"
echo "   - backend-test.log (inicio inicial)"
echo "   - backend-restart-test.log (reinicio)"
echo ""
echo "🔧 Para gestión manual usa:"
echo "   cd backend && node src/scripts/whatsapp-manager.js"
echo ""
echo "🔄 Para reiniciar completamente:"
echo "   ./restart-backend.sh"
echo ""
echo "✅ Prueba de persistencia completada"
