#!/bin/bash
# Backup HORARIO de MongoDB (Atlas) → SSD externo, con restic.
#
# POR QUÉ HORARIO Y NO DIARIO:
#   El tier de Atlas es M0 (gratuito), que NO tiene backups de ningún tipo —
#   ni snapshots ni point-in-time. La base está hoy en copia única, y encima
#   contiene las credenciales de las sesiones de WhatsApp (mongo-auth-state):
#   perderla implica re-emparejar todos los números.
#   Con 77 MB de datos, un dump tarda segundos y ocupa nada, así que un RPO de
#   1 hora es prácticamente gratis. Es la mejor relación riesgo/esfuerzo de
#   todo el plan (clasificación Tier 1; los medios son Tier 2 → diario).
#
# CONSISTENCIA — LIMITACIÓN CONOCIDA Y ACEPTADA:
#   `mongodump` sobre un cluster VIVO no es consistente punto-en-el-tiempo
#   entre colecciones: cada una se lee en un instante distinto. La solución
#   estándar (`--oplog`) requiere leer el oplog de la base `local`, que Atlas
#   NO expone en M0. Se acepta el skew porque el dump completo tarda segundos
#   sobre 77 MB, así que la ventana de inconsistencia es de esos segundos.
#   SI SE MIGRA A UN TIER PAGO: agregar `--oplog` y usar `--oplogReplay` al
#   restaurar, que sí da consistencia real.
#
# EL DUMP INTERMEDIO ES TEXTO PLANO: se escribe en un directorio 700 y se
#   borra siempre (trap EXIT), incluso si el script falla. Lo que queda en el
#   disco externo es el repositorio restic, que sí está cifrado.

set -uo pipefail

# Config y utilidades compartidas: deriva rutas y descubre binarios, para que
# esto siga funcionando al migrar de máquina (ver backup-common.sh).
source "$(dirname "${BASH_SOURCE[0]}")/backup-common.sh"

# ---- configuración ---------------------------------------------------------

REPO="$DB_REPO"
# Misma clave que el repo de medios: un solo secreto que proteger fuera de la
# máquina, en vez de dos que recordar.
PASSWORD_FILE="$BACKUP_PASSWORD_FILE"
ENV_FILE="$BACKUP_ENV_FILE"
LOG_FILE="${DB_BACKUP_LOG_FILE:-${BACKUP_LOG_DIR}/backup-db.log}"
HEARTBEAT_FILE="${DB_HEARTBEAT_FILE:-${BACKUP_CONFIG_DIR}/last-db-backup}"


LOCK_FILE="/tmp/constroad-backup-db.lock"

# Bases a respaldar. Se listan explícitamente en vez de volcar TODO: `admin`,
# `local` y `config` son de Atlas y no nos pertenecen.
DATABASES=("constroad_db" "constroad" "shared_db" "test_db")

# Retención: 24 horarios (1 día de granularidad fina) + 7 diarios + 4 semanales.
KEEP_HOURLY="${DB_KEEP_HOURLY:-24}"
KEEP_DAILY="${DB_KEEP_DAILY:-7}"
KEEP_WEEKLY="${DB_KEEP_WEEKLY:-4}"

WORK_DIR=""

# ---- utilidades ------------------------------------------------------------

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"
}

load_env() {
  TELEGRAM_BOT_TOKEN=""; TELEGRAM_ERRORS_CHAT_ID=""; MONGO_URI=""
  if [ -r "$ENV_FILE" ]; then
    TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    TELEGRAM_ERRORS_CHAT_ID=$(grep -E '^TELEGRAM_ERRORS_CHAT_ID=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    MONGO_URI=$(grep -E '^PORTAL_MONGO_URI=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  fi
}

notify() {
  load_env
  [ -z "$TELEGRAM_BOT_TOKEN" ] && return 0
  /usr/bin/curl -sS -o /dev/null --max-time 15 \
    -d "chat_id=${TELEGRAM_ERRORS_CHAT_ID}" \
    --data-urlencode "text=$1" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" 2>/dev/null || true
}

# El dump en claro se borra SIEMPRE, pase lo que pase.
cleanup() {
  [ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ] && rm -rf "$WORK_DIR"
  rm -f "$LOCK_FILE"
}

fail() {
  log "ERROR: $1"
  # Con dedupe: este job corre CADA HORA y un fallo persistente alertaría 24
  # veces al día (ver backup_notify_failure en backup-common.sh).
  backup_notify_failure db "🔴 BACKUP DE BASE DE DATOS FALLÓ

$1

Atlas es M0 (sin backups propios): la base quedó en copia única.
(Si el fallo persiste, esta alerta se repite cada 6h, no cada hora.)"
  cleanup
  exit 1
}

# ---- main ------------------------------------------------------------------

main() {
  mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$HEARTBEAT_FILE")"

  if [ -e "$LOCK_FILE" ]; then
    pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      log "Ya hay un backup de DB corriendo (PID $pid) — salgo"
      exit 0
    fi
  fi
  echo $$ > "$LOCK_FILE"
  trap cleanup EXIT

  log "=== Backup de DB: inicio ==="

  # -- preflight (falla ruidoso) --
  [ -x "$MONGODUMP" ] || fail "mongodump no está en $MONGODUMP"
  [ -x "$RESTIC" ]    || fail "restic no está en $RESTIC"
  [ -r "$PASSWORD_FILE" ] || fail "No se puede leer la clave del repositorio: $PASSWORD_FILE"

  local mount_point="${REPO%/*}"
  [ -d "$mount_point" ] || fail "El disco de backup NO está montado (falta $mount_point)"
  local probe="${mount_point}/.db-write-test.$$"
  touch "$probe" 2>/dev/null || fail "Disco montado pero SIN permiso de escritura en $mount_point.
Falta 'Acceso total al disco' para el proceso del backup."
  rm -f "$probe"

  load_env
  [ -n "$MONGO_URI" ] || fail "No se encontró PORTAL_MONGO_URI en $ENV_FILE"

  # -- dump --
  WORK_DIR=$(mktemp -d "/tmp/constroad-db-dump.XXXXXX") || fail "No se pudo crear el directorio temporal"
  chmod 700 "$WORK_DIR"

  local started dumped=0
  started=$(date +%s)

  # REINTENTO ante fallos transitorios (2026-08-09): un hipo de DNS resolviendo
  # el SRV de Atlas (`lookup _mongodb._tcp... read udp`) tiraba el backup de esa
  # hora entero. Con RPO de 1h, perder una corrida por un fallo de red de un
  # segundo es desproporcionado — y encima genera una alerta que parece grave.
  local intento
  for db in "${DATABASES[@]}"; do
    for intento in 1 2 3; do
      if "$MONGODUMP" --uri="$MONGO_URI" --db="$db" --out="$WORK_DIR" \
           --quiet >>"$LOG_FILE" 2>&1; then
        dumped=$((dumped + 1))
        [ "$intento" -gt 1 ] && log "'$db' OK en el intento ${intento} (fallo transitorio)"
        break
      fi
      if [ "$intento" -eq 3 ]; then
        fail "mongodump falló para la base '$db' tras 3 intentos"
      fi
      log "mongodump falló para '$db' (intento ${intento}/3) — reintentando en 10s"
      sleep 10
    done
  done

  local dump_size
  dump_size=$(du -sh "$WORK_DIR" 2>/dev/null | cut -f1)
  log "Dump OK — ${dumped} bases, ${dump_size}"

  # -- a restic --
  export RESTIC_REPOSITORY="$REPO"
  export RESTIC_PASSWORD_FILE="$PASSWORD_FILE"

  if ! "$RESTIC" cat config >/dev/null 2>&1; then
    log "Repositorio de DB no encontrado — inicializando en $REPO"
    "$RESTIC" init >>"$LOG_FILE" 2>&1 || fail "No se pudo inicializar el repositorio en $REPO"
  fi

  "$RESTIC" unlock >>"$LOG_FILE" 2>&1 || true

  local out rc
  out=$("$RESTIC" backup "$WORK_DIR" --tag db --tag automatico 2>&1)
  rc=$?
  echo "$out" >> "$LOG_FILE"
  [ $rc -eq 0 ] || fail "restic backup falló (código $rc):
$(echo "$out" | tail -4)"

  local added elapsed
  added=$(echo "$out" | grep -oE "Added to the repository: [0-9.]+ [KMGT]?i?B" | head -1 | cut -d: -f2- | xargs || echo "?")
  elapsed=$(( $(date +%s) - started ))
  log "Backup de DB OK — ${added} nuevos, ${elapsed}s"

  # -- retención --
  "$RESTIC" forget \
    --keep-hourly "$KEEP_HOURLY" \
    --keep-daily "$KEEP_DAILY" \
    --keep-weekly "$KEEP_WEEKLY" \
    --prune >>"$LOG_FILE" 2>&1 \
    || log "AVISO: la retención falló (el backup de esta hora SÍ se guardó)"

  # -- heartbeat (dead man's switch) --
  # Lo lee lila-app para alertar si los backups DEJAN de ocurrir. Un backup que
  # no corre no genera ningún error: simplemente no pasa. Sin esto, un agendado
  # perdido (p.ej. tras migrar de máquina) no se detecta hasta que se necesita
  # restaurar. Se escribe SOLO en éxito.
  date +%s > "$HEARTBEAT_FILE"

  # Cierra el ciclo: si veníamos fallando, avisa que se recuperó. Sin esto
  # quedás sin saber si el problema sigue o se arregló solo.
  backup_notify_recovery db "✅ BACKUP DE BASE DE DATOS RECUPERADO

Volvió a funcionar tras uno o más fallos. ${added} nuevos, ${elapsed}s."

  log "=== Backup de DB: fin (${elapsed}s) ==="
}

main "$@"
