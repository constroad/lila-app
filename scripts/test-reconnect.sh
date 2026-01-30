#!/bin/bash

# 🧪 Script de Testing - WhatsApp Reconnect Fix
# Test the new auto-reconnect and backup system

set -e

PHONE_NUMBER="${1:-51902049935}"
BASE_URL="${2:-http://localhost:3001}"

echo "🧪 Testing WhatsApp Reconnect System"
echo "📱 Phone: $PHONE_NUMBER"
echo "🌐 API: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
success() {
  echo -e "${GREEN}✅ $1${NC}"
}

error() {
  echo -e "${RED}❌ $1${NC}"
}

warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

info() {
  echo "ℹ️  $1"
}

# Test 1: Check API is running
echo "Test 1: Verificando que lila-app está corriendo..."
if curl -s "$BASE_URL/health" > /dev/null; then
  success "lila-app está corriendo"
else
  error "lila-app NO está corriendo. Ejecutar: npm start"
  exit 1
fi

# Test 2: Check session directory structure
echo ""
echo "Test 2: Verificando estructura de directorios..."
SESSION_DIR="data/sessions/$PHONE_NUMBER"
BACKUP_DIR="data/sessions/backups/$PHONE_NUMBER"

if [ ! -d "data/sessions" ]; then
  warning "Creando directorio data/sessions"
  mkdir -p data/sessions
fi

if [ -d "$SESSION_DIR" ]; then
  info "Sesión activa encontrada: $SESSION_DIR"

  if [ -f "$SESSION_DIR/creds.json" ]; then
    success "Credenciales encontradas: $SESSION_DIR/creds.json"
  else
    warning "No hay credenciales en la sesión activa"
  fi
else
  info "No hay sesión activa para $PHONE_NUMBER"
fi

if [ -d "$BACKUP_DIR" ]; then
  BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/creds-*.json 2>/dev/null | wc -l)
  if [ "$BACKUP_COUNT" -gt 0 ]; then
    success "Backups encontrados: $BACKUP_COUNT en $BACKUP_DIR"
    echo "   Últimos backups:"
    ls -lt "$BACKUP_DIR"/creds-*.json | head -3 | awk '{print "   - " $9}'
  else
    info "No hay backups aún"
  fi
else
  info "No hay directorio de backups aún"
fi

# Test 3: Get session status
echo ""
echo "Test 3: Obteniendo estado de sesión..."
STATUS_RESPONSE=$(curl -s "$BASE_URL/api/sessions/$PHONE_NUMBER/status" || echo '{"error":"failed"}')

if echo "$STATUS_RESPONSE" | grep -q "success"; then
  SESSION_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  IS_CONNECTED=$(echo "$STATUS_RESPONSE" | grep -o '"isConnected":[^,}]*' | cut -d':' -f2)

  if [ "$IS_CONNECTED" = "true" ]; then
    success "Sesión conectada (status: $SESSION_STATUS)"
  else
    warning "Sesión NO conectada (status: $SESSION_STATUS)"
  fi
else
  warning "No hay información de sesión en memoria"
fi

# Test 4: List all sessions
echo ""
echo "Test 4: Listando todas las sesiones activas..."
SESSIONS_RESPONSE=$(curl -s "$BASE_URL/api/sessions" || echo '{"error":"failed"}')

if echo "$SESSIONS_RESPONSE" | grep -q "success"; then
  TOTAL=$(echo "$SESSIONS_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
  success "Total de sesiones en memoria: $TOTAL"

  if [ "$TOTAL" -gt 0 ]; then
    echo "   Sesiones:"
    echo "$SESSIONS_RESPONSE" | grep -o '"phoneNumber":"[^"]*"' | cut -d'"' -f4 | while read phone; do
      echo "   - $phone"
    done
  fi
else
  error "Error al obtener lista de sesiones"
fi

# Test 5: Check logs for reconnect attempts
echo ""
echo "Test 5: Verificando logs de reconexión..."
if [ -f "logs/combined.log" ]; then
  RECONNECT_COUNT=$(grep -c "Reconnectable disconnect\|preserving credentials" logs/combined.log 2>/dev/null || echo "0")
  BACKUP_COUNT=$(grep -c "Backed up credentials" logs/combined.log 2>/dev/null || echo "0")

  if [ "$RECONNECT_COUNT" -gt 0 ]; then
    success "Reconexiones detectadas: $RECONNECT_COUNT"
  else
    info "No hay reconexiones registradas aún"
  fi

  if [ "$BACKUP_COUNT" -gt 0 ]; then
    success "Backups creados: $BACKUP_COUNT"
  else
    info "No hay backups registrados aún"
  fi

  # Show last 5 relevant log lines
  echo ""
  info "Últimas 5 líneas relevantes del log:"
  grep -E "Connection closed|preserving|backup|Reconnectable" logs/combined.log | tail -5 | while read line; do
    echo "   $line"
  done
else
  warning "No se encontró archivo de logs: logs/combined.log"
fi

# Test 6: Test restore API (optional)
echo ""
read -p "¿Deseas probar el endpoint de restauración? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  if [ -d "$BACKUP_DIR" ] && [ "$(ls -1 "$BACKUP_DIR"/creds-*.json 2>/dev/null | wc -l)" -gt 0 ]; then
    echo ""
    echo "Test 6: Probando endpoint de restauración..."

    RESTORE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/sessions/$PHONE_NUMBER/restore" \
      -H "Content-Type: application/json" || echo '{"error":"failed"}')

    if echo "$RESTORE_RESPONSE" | grep -q "success"; then
      success "Restauración iniciada correctamente"
      echo "   Respuesta: $RESTORE_RESPONSE"
    else
      error "Error al restaurar sesión"
      echo "   Respuesta: $RESTORE_RESPONSE"
    fi
  else
    warning "No hay backups disponibles para restaurar"
  fi
else
  info "Omitiendo test de restauración"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESUMEN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if session has credentials
if [ -f "$SESSION_DIR/creds.json" ]; then
  success "Sesión tiene credenciales guardadas"
else
  warning "Sesión NO tiene credenciales guardadas"
fi

# Check if backups exist
if [ -d "$BACKUP_DIR" ] && [ "$(ls -1 "$BACKUP_DIR"/creds-*.json 2>/dev/null | wc -l)" -gt 0 ]; then
  success "Sistema de backups funcionando"
else
  info "No hay backups aún (se crearán automáticamente)"
fi

# Check if new code is working
if grep -q "preserving credentials\|backupAndResetAuthState" logs/combined.log 2>/dev/null; then
  success "Nuevo código de reconexión está activo"
else
  warning "Nuevo código aún no se ha ejecutado (esperar desconexión)"
fi

echo ""
echo "✨ Testing completado!"
echo ""
echo "📖 Para más información, ver: SOLUCIÓN-WHATSAPP-RECONNECT.md"
