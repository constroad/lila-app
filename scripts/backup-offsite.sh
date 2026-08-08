#!/bin/bash
# Réplica OFFSITE de los repositorios restic → Backblaze B2.
#
# QUÉ CIERRA ESTO: hasta acá los backups eran una sola copia local, en el mismo
# edificio, con el disco siempre conectado. Eso no cubre robo, incendio ni
# ransomware — un cifrador que alcance el volumen montado se lleva original y
# copia. Esta fase completa la regla 3-2-1-1-0: la copia offsite y la
# resistencia a borrado malicioso.
#
# POR QUÉ `restic copy` Y NO UN SEGUNDO BACKUP DESDE EL ORIGEN:
#   - Se replica EXACTAMENTE lo que ya se verificó localmente (misma cadena de
#     snapshots), en vez de generar una copia distinta que nadie probó.
#   - No se vuelve a leer el origen: 10.600 archivos del disco interno se leen
#     una sola vez por noche, no dos.
#   - Los repos destino se inicializan con `--copy-chunker-params` para que la
#     deduplicación sea compatible; sin eso, `copy` re-trocea todo y transfiere
#     de más.
#
# INMUTABILIDAD — LA PARTE NO OBVIA:
#   NO se usa Object Lock con retención por defecto: entra en conflicto con
#   restic, que necesita poder borrar bloques que ningún snapshot usa ya
#   (`prune`). Un bucket con retención forzada rompe el mantenimiento del repo.
#   La forma correcta es una APPLICATION KEY SIN PERMISO DE BORRADO
#   (`deleteFiles` excluido). restic no necesita borrar: cuando descarta algo
#   escribe un marcador de ocultamiento, que es una versión nueva y no destruye
#   la anterior. Las lifecycle rules del bucket retienen las versiones previas.
#   Efecto: quien comprometa esta máquina Y esta clave NO puede vaciar el
#   bucket. Es el "+1" (copia inmutable) de 3-2-1-1-0.
#
# EL PRUNE NO CORRE ACÁ: `prune` toma un lock exclusivo y no debe solaparse con
#   un `copy`. La retención remota se resuelve con las lifecycle rules de B2,
#   no ejecutando prune contra el bucket.

set -uo pipefail

# Config y utilidades compartidas: deriva rutas y descubre binarios, para que
# esto siga funcionando al migrar de máquina (ver backup-common.sh).
source "$(dirname "${BASH_SOURCE[0]}")/backup-common.sh"

# ---- configuración ---------------------------------------------------------

MEDIA_REPO_LOCAL="$MEDIA_REPO"
DB_REPO_LOCAL="$DB_REPO"
PASSWORD_FILE="$BACKUP_PASSWORD_FILE"
ENV_FILE="$BACKUP_ENV_FILE"
LOG_FILE="${OFFSITE_LOG_FILE:-${BACKUP_LOG_DIR}/backup-offsite.log}"
HEARTBEAT_FILE="${OFFSITE_HEARTBEAT_FILE:-${BACKUP_CONFIG_DIR}/last-offsite}"

LOCK_FILE="/tmp/constroad-backup-offsite.lock"

PROBLEMAS=()

# ---- utilidades ------------------------------------------------------------

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"; }

load_env() {
  TELEGRAM_BOT_TOKEN=""; TELEGRAM_ERRORS_CHAT_ID=""
  B2_ACCOUNT_ID=""; B2_ACCOUNT_KEY=""; B2_BUCKET=""
  if [ -r "$ENV_FILE" ]; then
    local get; get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }
    TELEGRAM_BOT_TOKEN=$(get TELEGRAM_BOT_TOKEN)
    TELEGRAM_ERRORS_CHAT_ID=$(get TELEGRAM_ERRORS_CHAT_ID)
    B2_ACCOUNT_ID=$(get B2_ACCOUNT_ID)
    B2_ACCOUNT_KEY=$(get B2_ACCOUNT_KEY)
    B2_BUCKET=$(get B2_BUCKET)
  fi
}

notify() {
  [ -z "${TELEGRAM_BOT_TOKEN:-}" ] && return 0
  /usr/bin/curl -sS -o /dev/null --max-time 15 \
    -d "chat_id=${TELEGRAM_ERRORS_CHAT_ID}" --data-urlencode "text=$1" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" 2>/dev/null || true
}

cleanup() { rm -f "$LOCK_FILE"; }

fail() {
  log "ERROR: $1"
  backup_notify_failure offsite "🔴 RÉPLICA OFFSITE FALLÓ

$1

Los backups locales siguen bien, pero NO hay copia fuera del edificio."
  cleanup
  exit 1
}

# ---- réplica de un repositorio --------------------------------------------

replicar() {
  local local_repo="$1" remoto_path="$2" nombre="$3"
  local remoto="b2:${B2_BUCKET}:${remoto_path}"

  export B2_ACCOUNT_ID B2_ACCOUNT_KEY
  export RESTIC_PASSWORD_FILE="$PASSWORD_FILE"

  # Init del destino con los MISMOS parámetros de chunker que el origen: sin
  # esto la deduplicación entre ambos no es compatible y `copy` retransfiere
  # todo en cada corrida.
  if ! RESTIC_REPOSITORY="$remoto" "$RESTIC" cat config >/dev/null 2>&1; then
    log "[$nombre] repositorio remoto no existe — inicializando"
    if ! RESTIC_REPOSITORY="$remoto" RESTIC_FROM_REPOSITORY="$local_repo" \
         RESTIC_FROM_PASSWORD_FILE="$PASSWORD_FILE" \
         "$RESTIC" init --copy-chunker-params >>"$LOG_FILE" 2>&1; then
      PROBLEMAS+=("[$nombre] no se pudo inicializar el repositorio remoto")
      return 1
    fi
    log "[$nombre] repositorio remoto inicializado"
  fi

  local antes despues inicio
  inicio=$(date +%s)
  antes=$(RESTIC_REPOSITORY="$remoto" "$RESTIC" snapshots --json 2>/dev/null | grep -c '"short_id"' || echo 0)

  log "[$nombre] replicando a ${remoto}..."
  if ! RESTIC_REPOSITORY="$remoto" RESTIC_FROM_REPOSITORY="$local_repo" \
       RESTIC_FROM_PASSWORD_FILE="$PASSWORD_FILE" \
       "$RESTIC" copy >>"$LOG_FILE" 2>&1; then
    PROBLEMAS+=("[$nombre] 'restic copy' falló")
    return 1
  fi

  despues=$(RESTIC_REPOSITORY="$remoto" "$RESTIC" snapshots --json 2>/dev/null | grep -c '"short_id"' || echo 0)
  log "[$nombre] OK — ${despues} snapshots remotos (+$((despues - antes))), $(( $(date +%s) - inicio ))s"
  return 0
}

# ---- main ------------------------------------------------------------------

main() {
  mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$HEARTBEAT_FILE")"

  if [ -e "$LOCK_FILE" ]; then
    pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      log "Ya hay una réplica corriendo (PID $pid) — salgo"
      exit 0
    fi
  fi
  echo $$ > "$LOCK_FILE"
  trap cleanup EXIT

  log "=== Réplica offsite: inicio ==="
  load_env

  # -- preflight (falla ruidoso) --
  [ -x "$RESTIC" ] || fail "restic no está en $RESTIC"
  [ -r "$PASSWORD_FILE" ] || fail "No se puede leer la clave: $PASSWORD_FILE"

  if [ -z "$B2_ACCOUNT_ID" ] || [ -z "$B2_ACCOUNT_KEY" ] || [ -z "$B2_BUCKET" ]; then
    fail "Faltan credenciales de Backblaze B2 en $ENV_FILE.
Se necesitan: B2_ACCOUNT_ID, B2_ACCOUNT_KEY, B2_BUCKET.
La application key NO debe tener permiso deleteFiles (ver cabecera del script)."
  fi

  local mount_point="${MEDIA_REPO_LOCAL%/*}"
  [ -d "$mount_point" ] || fail "El disco local no está montado ($mount_point): no hay origen que replicar"

  # Sin red no se puede replicar; distinguirlo de un fallo de credenciales
  # evita diagnósticos equivocados a las 2 de la mañana.
  if ! /sbin/ping -c1 -t5 api.backblazeb2.com >/dev/null 2>&1 \
     && ! /usr/bin/curl -sS -o /dev/null --max-time 10 https://api.backblazeb2.com >/dev/null 2>&1; then
    fail "No hay conectividad con Backblaze B2 (¿internet caído?)"
  fi

  replicar "$MEDIA_REPO_LOCAL" "medios" "medios"
  replicar "$DB_REPO_LOCAL" "base" "base"

  if [ ${#PROBLEMAS[@]} -eq 0 ]; then
    date +%s > "$HEARTBEAT_FILE"
    backup_notify_recovery offsite "✅ RÉPLICA OFFSITE RECUPERADA

Volvió a funcionar tras uno o más fallos."
    log "=== Réplica offsite OK ==="
  else
    local detalle
    detalle=$(printf '• %s\n' "${PROBLEMAS[@]}")
    log "=== Réplica offsite CON PROBLEMAS ==="
    notify "🔴 RÉPLICA OFFSITE FALLÓ

${detalle}

Los backups locales siguen bien, pero la copia fuera del edificio está desactualizada."
    exit 1
  fi
}

main "$@"
