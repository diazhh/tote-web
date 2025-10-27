#!/bin/bash

# Script para monitorear el log de WhatsApp en tiempo real

LOG_FILE="./logs/whatsapp.log"

echo "=========================================="
echo "  Monitor de WhatsApp - Tote System"
echo "=========================================="
echo ""
echo "Monitoreando: $LOG_FILE"
echo "Presiona Ctrl+C para salir"
echo ""
echo "=========================================="
echo ""

# Crear archivo si no existe
touch "$LOG_FILE"

# Seguir el log en tiempo real
tail -f "$LOG_FILE" | while read line; do
    # Colorear según el nivel
    if echo "$line" | grep -q '"level":"error"'; then
        echo -e "\033[0;31m$line\033[0m"  # Rojo
    elif echo "$line" | grep -q '"level":"warn"'; then
        echo -e "\033[0;33m$line\033[0m"  # Amarillo
    elif echo "$line" | grep -q '"level":"info"'; then
        echo -e "\033[0;32m$line\033[0m"  # Verde
    elif echo "$line" | grep -q '"level":"debug"'; then
        echo -e "\033[0;36m$line\033[0m"  # Cyan
    else
        echo "$line"
    fi
done
