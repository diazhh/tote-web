#!/bin/bash

# Script para configurar la base de datos PostgreSQL y migrar datos

set -e

echo "🚀 Iniciando configuración de base de datos..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Verificar Docker
echo -e "\n${YELLOW}1. Verificando Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker no está instalado. Instalando...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}✓ Docker instalado${NC}"
    echo -e "${YELLOW}Nota: Puede que necesites cerrar sesión y volver a entrar para usar Docker sin sudo${NC}"
else
    echo -e "${GREEN}✓ Docker ya está instalado${NC}"
fi

# 2. Verificar Docker Compose
echo -e "\n${YELLOW}2. Verificando Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Instalando Docker Compose...${NC}"
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✓ Docker Compose instalado${NC}"
else
    echo -e "${GREEN}✓ Docker Compose ya está instalado${NC}"
fi

# 3. Iniciar PostgreSQL con Docker Compose
echo -e "\n${YELLOW}3. Iniciando PostgreSQL con Docker...${NC}"
docker-compose up -d postgres

# Esperar a que PostgreSQL esté listo
echo -e "${YELLOW}Esperando a que PostgreSQL esté listo...${NC}"
sleep 5

# Verificar que el contenedor esté corriendo
if docker ps | grep -q tote_postgres; then
    echo -e "${GREEN}✓ PostgreSQL está corriendo${NC}"
else
    echo -e "${RED}✗ Error: PostgreSQL no se inició correctamente${NC}"
    exit 1
fi

# 4. Instalar dependencias del backend
echo -e "\n${YELLOW}4. Instalando dependencias del backend...${NC}"
cd backend
npm install
echo -e "${GREEN}✓ Dependencias instaladas${NC}"

# 5. Generar cliente Prisma
echo -e "\n${YELLOW}5. Generando cliente Prisma...${NC}"
npx prisma generate
echo -e "${GREEN}✓ Cliente Prisma generado${NC}"

# 6. Ejecutar migraciones de Prisma
echo -e "\n${YELLOW}6. Ejecutando migraciones de Prisma...${NC}"
npx prisma db push
echo -e "${GREEN}✓ Migraciones ejecutadas${NC}"

# 7. Migrar datos legacy desde MySQL
echo -e "\n${YELLOW}7. Migrando datos desde MySQL legacy...${NC}"
node src/scripts/migrate-legacy.js
echo -e "${GREEN}✓ Datos legacy migrados${NC}"

# 8. Crear usuarios iniciales (seed)
echo -e "\n${YELLOW}8. Creando usuarios iniciales...${NC}"
if [ -f "src/scripts/seed.js" ]; then
    node src/scripts/seed.js
    echo -e "${GREEN}✓ Usuarios iniciales creados${NC}"
else
    echo -e "${YELLOW}⚠ Script de seed no encontrado, saltando...${NC}"
fi

echo -e "\n${GREEN}✅ ¡Configuración completada exitosamente!${NC}"
echo -e "\n${YELLOW}Información de la base de datos:${NC}"
echo -e "  Host: localhost"
echo -e "  Puerto: 5432"
echo -e "  Usuario: tote_user"
echo -e "  Contraseña: tote_password_2025"
echo -e "  Base de datos: tote_db"
echo -e "\n${YELLOW}Comandos útiles:${NC}"
echo -e "  Ver logs de PostgreSQL: docker-compose logs -f postgres"
echo -e "  Detener PostgreSQL: docker-compose down"
echo -e "  Abrir Prisma Studio: cd backend && npx prisma studio"
echo -e "  Iniciar backend: cd backend && npm run dev"
