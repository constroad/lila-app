#!/bin/bash
# Verificación semanal de los backups — el "0" de 3-2-1-1-0: cero errores de
# recuperación, comprobado, no supuesto.
#
# POR QUÉ ESTO NO ES OPCIONAL:
#   Un backup que nunca se restauró no es un backup: es una carpeta con datos
#   que se asume que sirven. Los modos de fallo que SOLO se detectan probando:
#   bit rot en el SSD, un repositorio corrupto por un corte a mitad de escritura,
#   una exclusión mal puesta que dejó fuera algo importante, o una clave que ya
#   no abre el repositorio.
#
# TRES NIVELES, de barato a caro:
#   1. `restic check`            → estructura y metadata (no lee los datos).
#   2. `check --read-data-subset`→ LEE y verifica un % de los bloques reales.
#      Rotando un 10% semanal, el repositorio entero queda cubierto cada ~10
#      semanas. Es lo único que detecta bit rot.
#   3. Simulacro de restauración → restaura archivos al azar y compara SHA-256
#      contra el origen vivo. Es el único nivel que prueba el camino completo.
#
# COMPARAR CONTENIDO, NO CANTIDAD: contar archivos restaurados da falsos OK.
#   (Durante el desarrollo de esto, una comparación mal escrita reportó
#   diferencias inexistentes; una mal escrita al revés habría dado ✅ sobre un
#   backup roto.) Por eso se comparan hashes, uno por uno.
#
# ADEMÁS CRONOMETRA: el RTO objetivo es 4h. Medir cuánto tarda restaurar de
#   verdad es lo que convierte ese número en un dato en vez de un deseo.

set -uo pipefail

# ---- configuración ---------------------------------------------------------

MEDIA_REPO="${BACKUP_REPO:-/Volumes/CONSTROAD-BACKUP/restic-media}"
DB_REPO="${DB_BACKUP_REPO:-/Volumes/CONSTROAD-BACKUP/restic-db}"
SOURCE="${BACKUP_SOURCE:-/Users/jose/constroad-storage/companies}"
PASSWORD_FILE="${BACKUP_PASSWORD_FILE:-$HOME/.config/constroad-backup/restic-media.pass}"
ENV_FILE="${BACKUP_ENV_FILE:-/Users/jose/projects/lila-app/.env}"
LOG_FILE="${VERIFY_LOG_FILE:-/Users/jose/projects/lila-app/logs/verify-backups.log}"
HEARTBEAT_FILE="${VERIFY_HEARTBEAT_FILE:-$HOME/.config/constroad-backup/last-verify}"
RESTIC="${RESTIC_BIN:-/opt/homebrew/bin/restic}"

SAMPLE_SIZE="${VERIFY_SAMPLE_SIZE:-25}"      # archivos a restaurar y comparar
READ_DATA_PCT="${VERIFY_READ_DATA_PCT:-10}"  # % de bloques leídos de verdad

WORK_DIR=""
PROBLEMAS=()

# ---- utilidades ------------------------------------------------------------

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"; }

notify() {
  local token="" chat=""
  if [ -r "$ENV_FILE" ]; then
    token=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    chat=$(grep -E '^TELEGRAM_ERRORS_CHAT_ID=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  fi
  [ -z "$token" ] && return 0
  /usr/bin/curl -sS -o /dev/null --max-time 15 \
    -d "chat_id=${chat}" --data-urlencode "text=$1" \
    "https://api.telegram.org/bot${token}/sendMessage" 2>/dev/null || true
}

cleanup() { [ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ] && rm -rf "$WORK_DIR"; }

problema() { PROBLEMAS+=("$1"); log "❌ $1"; }

# ---- verificaciones --------------------------------------------------------

# Nivel 1 y 2 sobre un repositorio.
verificar_repo() {
  local repo="$1" nombre="$2"
  export RESTIC_REPOSITORY="$repo" RESTIC_PASSWORD_FILE="$PASSWORD_FILE"

  if ! "$RESTIC" cat config >/dev/null 2>&1; then
    problema "[$nombre] el repositorio no existe o la clave no lo abre"
    return 1
  fi

  # Un lock huérfano (proceso muerto a mitad de corrida) hace fallar `check` con
  # un error que NO es corrupción. Sin esto, la alerta diría "errores de
  # estructura" ante un problema operativo trivial — y una alerta que grita por
  # cosas menores se termina ignorando justo cuando importa.
  "$RESTIC" unlock >>"$LOG_FILE" 2>&1 || true

  log "[$nombre] verificando estructura..."
  local salida
  salida=$("$RESTIC" check 2>&1)
  echo "$salida" >> "$LOG_FILE"
  if ! echo "$salida" | grep -q "no errors were found"; then
    if echo "$salida" | grep -qi "already locked\|unable to create lock"; then
      problema "[$nombre] el repositorio está bloqueado por otro proceso (¿backup corriendo?)"
    else
      problema "[$nombre] 'restic check' encontró errores de ESTRUCTURA (posible corrupción)"
    fi
    return 1
  fi

  # Este es el que detecta bit rot: lee los bloques y recalcula sus hashes.
  log "[$nombre] leyendo y verificando ${READ_DATA_PCT}% de los datos..."
  if ! "$RESTIC" check --read-data-subset="${READ_DATA_PCT}%" >>"$LOG_FILE" 2>&1; then
    problema "[$nombre] datos corruptos detectados al leer el ${READ_DATA_PCT}%"
    return 1
  fi

  local n
  n=$("$RESTIC" snapshots --json 2>/dev/null | grep -c '"short_id"' || echo 0)
  log "[$nombre] OK — ${n} snapshots"
  return 0
}

# Nivel 3: simulacro real de restauración de medios, comparando SHA-256.
simulacro_medios() {
  export RESTIC_REPOSITORY="$MEDIA_REPO" RESTIC_PASSWORD_FILE="$PASSWORD_FILE"
  log "Simulacro: restaurando ${SAMPLE_SIZE} archivos al azar..."

  # La muestra debe excluir lo creado DESPUÉS del último snapshot: esos archivos
  # legítimamente no están en el backup todavía y darían un falso positivo
  # ("faltan archivos") que enmascararía uno real. Se toma la fecha del snapshot
  # como corte.
  local corte
  corte=$("$RESTIC" snapshots --json latest 2>/dev/null \
          | grep -oE '"time":"[^"]+"' | head -1 | cut -d'"' -f4 | cut -c1-19 | tr 'T' ' ')
  if [ -z "$corte" ]; then
    problema "no se pudo leer la fecha del último snapshot de medios"
    return 1
  fi
  log "Simulacro: muestra de archivos anteriores a ${corte}"

  # Muestra ALEATORIA (no siempre los mismos archivos) tomada del origen vivo,
  # para poder comparar contra algo. Se excluye `.thumbs`, que no se respalda.
  local muestra
  muestra=$(find "$SOURCE" -type f -not -path '*/.thumbs/*' ! -newermt "$corte" 2>/dev/null \
            | sort -R | head -n "$SAMPLE_SIZE")
  [ -z "$muestra" ] && { problema "no se pudo tomar una muestra de $SOURCE"; return 1; }

  local incluye=()
  while IFS= read -r f; do incluye+=(--include "$f"); done <<< "$muestra"

  local inicio
  inicio=$(date +%s)
  if ! "$RESTIC" restore latest --target "$WORK_DIR" "${incluye[@]}" >>"$LOG_FILE" 2>&1; then
    problema "la restauración de medios falló"
    return 1
  fi
  local dur=$(( $(date +%s) - inicio ))

  # Comparación por CONTENIDO, archivo por archivo.
  local ok=0 mal=0 faltan=0
  while IFS= read -r origen; do
    local restaurado="${WORK_DIR}${origen}"
    if [ ! -f "$restaurado" ]; then
      faltan=$((faltan + 1)); continue
    fi
    if [ "$(shasum -a 256 "$origen" | cut -d' ' -f1)" = "$(shasum -a 256 "$restaurado" | cut -d' ' -f1)" ]; then
      ok=$((ok + 1))
    else
      mal=$((mal + 1))
      log "   hash distinto: $origen"
    fi
  done <<< "$muestra"

  log "Simulacro medios: ${ok} idénticos, ${mal} distintos, ${faltan} ausentes (${dur}s)"
  [ "$mal" -gt 0 ] && problema "${mal} archivo(s) restaurados NO coinciden con el origen"
  [ "$faltan" -gt 0 ] && problema "${faltan} archivo(s) de la muestra no estaban en el backup"
  MEDIA_DUR="$dur"; MEDIA_OK="$ok"
  return 0
}

# Nivel 3 para la base: restaurar el dump y comprobar que el BSON se parsea.
simulacro_db() {
  export RESTIC_REPOSITORY="$DB_REPO" RESTIC_PASSWORD_FILE="$PASSWORD_FILE"
  log "Simulacro: restaurando el dump de la base..."

  local destino="${WORK_DIR}/db" inicio
  mkdir -p "$destino"
  inicio=$(date +%s)
  if ! "$RESTIC" restore latest --target "$destino" >>"$LOG_FILE" 2>&1; then
    problema "la restauración de la base falló"
    return 1
  fi
  local dur=$(( $(date +%s) - inicio ))

  # Un .bson que existe pero no se parsea es un backup inútil que se ve sano.
  local colecciones
  colecciones=$(find "$destino" -name "*.bson" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$colecciones" -lt 100 ]; then
    problema "el dump restaurado tiene solo ${colecciones} colecciones (se esperaban 200+)"
    return 1
  fi

  # Verificación real de contenido: se parsea el BSON de una colección crítica.
  local orders
  orders=$(find "$destino" -path "*constroad_db/orders.bson" | head -1)
  if [ -n "$orders" ] && [ -s "$orders" ]; then
    local docs
    docs=$(node -e "
      const fs=require('fs');
      const {BSON}=require('/Users/jose/projects/lila-app/node_modules/bson/lib/bson.cjs');
      const b=fs.readFileSync('$orders'); let o=0,n=0;
      while(o<b.length){const s=b.readInt32LE(o); if(s<=0||o+s>b.length)break; BSON.deserialize(b.subarray(o,o+s)); n++; o+=s;}
      console.log(n);
    " 2>/dev/null || echo "ERROR")
    if [ "$docs" = "ERROR" ] || [ "${docs:-0}" -lt 1 ]; then
      problema "el BSON de constroad_db/orders no se pudo parsear"
    else
      log "Simulacro DB: ${colecciones} colecciones, orders con ${docs} documentos legibles (${dur}s)"
    fi
  else
    problema "no se encontró constroad_db/orders.bson en el dump restaurado"
  fi
  DB_DUR="$dur"
  return 0
}

# ---- main ------------------------------------------------------------------

main() {
  mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$HEARTBEAT_FILE")"
  trap cleanup EXIT

  log "=== Verificación de backups: inicio ==="
  local inicio_total
  inicio_total=$(date +%s)

  local mount_point="${MEDIA_REPO%/*}"
  if [ ! -d "$mount_point" ]; then
    log "ERROR: el disco de backup NO está montado ($mount_point)"
    notify "🔴 VERIFICACIÓN DE BACKUPS FALLÓ

El disco CONSTROAD-BACKUP no está montado. No se pudo verificar nada."
    exit 1
  fi

  WORK_DIR=$(mktemp -d "/tmp/constroad-verify.XXXXXX") || exit 1
  MEDIA_DUR=0; MEDIA_OK=0; DB_DUR=0

  verificar_repo "$MEDIA_REPO" "medios"
  verificar_repo "$DB_REPO" "base"
  simulacro_medios
  simulacro_db

  local total=$(( $(date +%s) - inicio_total ))

  if [ ${#PROBLEMAS[@]} -eq 0 ]; then
    log "=== Verificación OK (${total}s) ==="
    date +%s > "$HEARTBEAT_FILE"
    notify "✅ Verificación semanal de backups OK

Integridad: ambos repositorios sin errores (leído ${READ_DATA_PCT}% de los datos)
Simulacro medios: ${MEDIA_OK}/${SAMPLE_SIZE} archivos restaurados con hash idéntico (${MEDIA_DUR}s)
Simulacro base: dump restaurado y BSON legible (${DB_DUR}s)
Total: ${total}s

Los backups restauran. Verificado, no supuesto."
  else
    log "=== Verificación CON PROBLEMAS (${total}s) ==="
    local detalle
    detalle=$(printf '• %s\n' "${PROBLEMAS[@]}")
    notify "🔴 VERIFICACIÓN DE BACKUPS FALLÓ

${detalle}

Los backups pueden NO ser recuperables. Revisar antes de necesitarlos:
  tail -50 ${LOG_FILE}"
    exit 1
  fi
}

main "$@"
