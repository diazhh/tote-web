#!/bin/bash

# Script para poblar la base de datos con la información del proveedor SRQ

cd "$(dirname "$0")"

echo "🌱 Ejecutando seed de proveedores..."
echo ""

node prisma/seed-providers.js

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Seed completado exitosamente"
    echo ""
    echo "Ahora puedes acceder a /admin/proveedores para ver y gestionar las configuraciones"
else
    echo ""
    echo "❌ Error al ejecutar el seed"
    exit 1
fi
