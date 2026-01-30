#!/bin/bash

# Script para iniciar Redis Commander UI en puerto 3002
#
# Uso: npm run redis:ui

echo "🚀 Iniciando Redis Commander UI..."
echo "📊 UI disponible en: http://localhost:3002"
echo ""

# Configuración
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
UI_PORT=3002

# Construir comando
if [ -z "$REDIS_PASSWORD" ]; then
  # Sin password (desarrollo local)
  redis-commander \
    --redis-host "$REDIS_HOST" \
    --redis-port "$REDIS_PORT" \
    --port "$UI_PORT" \
    --no-save-connections
else
  # Con password
  redis-commander \
    --redis-host "$REDIS_HOST" \
    --redis-port "$REDIS_PORT" \
    --redis-password "$REDIS_PASSWORD" \
    --port "$UI_PORT" \
    --no-save-connections
fi
