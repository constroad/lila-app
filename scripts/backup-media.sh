#!/bin/bash
# Backup diario de medios multi-tenant → SSD externo, con restic.
#
# POR QUÉ RESTIC Y NO UN ZIP/RSYNC (medido sobre estos datos, ago-2026):
#   - Comprimir no sirve: los medios ya son jpg/mp4/webm. Medido sobre 400
#     archivos reales: 1.8% de ahorro con gzip. Un tar.gz diario serían 7GB
#     nuevos cada noche para respaldar datos que casi no cambian.
#   - rsync es un ESPEJO, no un backup: si algo borra o cifra el origen, la
#     corrida siguiente replica el daño. Sin versiones no hay recuperación.
#   - restic hace incremental-forever con deduplicación por contenido: solo
#     guarda bloques nuevos (~40MB/noche al ritmo actual), cifra, versiona, y
#     mover/renombrar archivos cuesta ~0 porque deduplica por contenido.
#
# CONSISTENCIA (decisión explícita, ver §Riesgo asumido abajo):
#   Lo correcto sería respaldar desde un snapshot APFS (equivalente a VSS en
#   Windows). `tmutil localsnapshot` funciona sin sudo, PERO `mount_apfs` para
#   leer del snapshot exige root, lo que obligaría a correr esto como
#   LaunchDaemon. Se decidió NO hacerlo todavía porque el riesgo real es chico
#   y medible (ver abajo), y este script INSTRUMENTA ese riesgo: si restic
#   detecta archivos que cambiaron durante la lectura, lo reporta. Si eso
#   aparece, escalamos a snapshot + root con evidencia, no por precaución.
#
# RIESGO ASUMIDO: los medios son write-once — medido, el 100% de los archivos
#   deja de modificarse ≤47s tras su creación (es el pipeline de ingesta:
#   linearizar PDF, faststart mp4, normalizar imagen). La única exposición es
#   respaldar un archivo dentro de esa ventana de 47s. Se auto-corrige en el
#   snapshot siguiente. Por eso el horario va en la franja más tranquila
#   (00:00-01:00, medida sobre 2 meses de subidas).
#
# FALLA RUIDOSO: el modo de fallo clásico de un backup es "terminó bien" sin
#   haber respaldado nada (disco desmontado, permisos, repo corrupto). Todos
#   los preflight de acá alertan por Telegram y salen con código ≠ 0.

set -uo pipefail

# Config y utilidades compartidas: deriva rutas y descubre binarios, para que
# esto siga funcionando al migrar de máquina (ver backup-common.sh).
source "$(dirname "${BASH_SOURCE[0]}")/backup-common.sh"

# ---- configuración ---------------------------------------------------------

REPO="$MEDIA_REPO"
SOURCE="$(resolver_source)"
PASSWORD_FILE="$BACKUP_PASSWORD_FILE"
ENV_FILE="$BACKUP_ENV_FILE"
LOG_FILE="${BACKUP_LOG_FILE:-${BACKUP_LOG_DIR}/backup-media.log}"
HEARTBEAT_FILE="${MEDIA_HEARTBEAT_FILE:-${BACKUP_CONFIG_DIR}/last-media-backup}"

LOCK_FILE="/tmp/constroad-backup-media.lock"

# Retención: 7 diarios / 4 semanales / 6 mensuales. A ~1.3-4 GB/mes de
# crecimiento y 954 GB libres, la retención no es una restricción de espacio
# sino de cuánto atrás querés poder volver.
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-6}"

# `.thumbs` se EXCLUYE a propósito: son 468MB en 7.914 archivos (43% de los
# archivos, 6% del peso) y `thumbnail.service.ts` los regenera on-demand si
# faltan. Excluirlos casi parte a la mitad el conteo de archivos, que es lo que
# domina el tiempo de escaneo. `temp/` es descartable por definición.
EXCLUDES=(
  --exclude ".thumbs"
  --exclude ".DS_Store"
  --exclude "._*"
  --exclude ".fseventsd"
  --exclude ".Spotlight-V100"
)

# ---- utilidades ------------------------------------------------------------

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"
}

load_env() {
  TELEGRAM_BOT_TOKEN=""
  TELEGRAM_ERRORS_CHAT_ID=""
  if [ -r "$ENV_FILE" ]; then
    TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    TELEGRAM_ERRORS_CHAT_ID=$(grep -E '^TELEGRAM_ERRORS_CHAT_ID=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  fi
}

# Sin dedupe: un backup fallido es siempre noticia, no ruido. Fire-and-forget
# con timeout para no colgar el job si Telegram no responde.
notify() {
  local message="$1"
  load_env
  [ -z "$TELEGRAM_BOT_TOKEN" ] && { log "Telegram omitido (sin token en $ENV_FILE)"; return 0; }
  /usr/bin/curl -sS -o /dev/null --max-time 15 \
    -d "chat_id=${TELEGRAM_ERRORS_CHAT_ID}" \
    --data-urlencode "text=${message}" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" 2>/dev/null || true
}

fail() {
  local message="$1"
  log "ERROR: $message"
  notify "🔴 BACKUP DE MEDIOS FALLÓ

$message

El backup NO se realizó. Los datos siguen en copia única."
  release_lock
  exit 1
}

acquire_lock() {
  if [ -e "$LOCK_FILE" ]; then
    local pid
    pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    # Lock huérfano (proceso muerto tras un corte): reclamarlo en vez de
    # quedar bloqueado para siempre.
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      log "Ya hay un backup corriendo (PID $pid) — salgo sin hacer nada"
      exit 0
    fi
    log "Lock huérfano de PID ${pid:-?} — lo reclamo"
  fi
  echo $$ > "$LOCK_FILE"
}

release_lock() { rm -f "$LOCK_FILE"; }

# ---- preflight (todo lo de acá falla RUIDOSO) ------------------------------

preflight() {
  [ -x "$RESTIC" ] || fail "restic no está en $RESTIC. Instalar con: brew install restic"

  [ -d "$SOURCE" ] || fail "El origen no existe: $SOURCE"

  # El modo de fallo #1: el disco no está montado y el job "termina bien".
  local mount_point="${REPO%/*}"
  mountpoint_ok=$(df "$mount_point" 2>/dev/null | tail -1 | awk '{print $NF}')
  [ -d "$mount_point" ] || fail "El disco de backup NO está montado (falta $mount_point).
¿Está conectado el SSD CONSTROAD-BACKUP?"

  # Montado pero de solo lectura, o sin permiso TCC: escribir de verdad es la
  # única prueba que vale.
  local probe="${mount_point}/.backup-write-test.$$"
  if ! touch "$probe" 2>/dev/null; then
    fail "El disco está montado pero NO se puede escribir en $mount_point.
Causa más probable: falta 'Acceso total al disco' para el proceso del backup
(Ajustes → Privacidad y Seguridad → Acceso total al disco)."
  fi
  rm -f "$probe"

  [ -r "$PASSWORD_FILE" ] || fail "No se puede leer la clave del repositorio: $PASSWORD_FILE
Sin la clave no se puede escribir NI restaurar."

  # Permisos de la clave: 600. Una clave legible por todos convierte el cifrado
  # del repositorio en decorativo.
  local perms
  perms=$(stat -f "%OLp" "$PASSWORD_FILE" 2>/dev/null || echo "???")
  [ "$perms" = "600" ] || log "AVISO: $PASSWORD_FILE tiene permisos $perms (deberían ser 600)"
}

# ---- backup ----------------------------------------------------------------

main() {
  mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$PASSWORD_FILE")" "$(dirname "$HEARTBEAT_FILE")"
  acquire_lock
  trap release_lock EXIT

  log "=== Backup de medios: inicio ==="
  preflight

  export RESTIC_REPOSITORY="$REPO"
  export RESTIC_PASSWORD_FILE="$PASSWORD_FILE"

  # Primera corrida: inicializar el repositorio.
  if ! "$RESTIC" cat config >/dev/null 2>&1; then
    log "Repositorio no encontrado — inicializando en $REPO"
    "$RESTIC" init >>"$LOG_FILE" 2>&1 || fail "No se pudo inicializar el repositorio en $REPO"
    log "Repositorio inicializado"
    notify "🆕 Repositorio de backup creado en $REPO

IMPORTANTE: guardá una clave de recuperación FUERA de esta máquina.
Si la Mac mini muere y la clave vivía solo acá, los backups son irrecuperables."
  fi

  # Un lock stale de restic (corte de luz a mitad de corrida) bloquea todo.
  "$RESTIC" unlock >>"$LOG_FILE" 2>&1 || true

  local started elapsed out rc
  started=$(date +%s)

  log "Respaldando $SOURCE"
  out=$("$RESTIC" backup "$SOURCE" "${EXCLUDES[@]}" \
        --tag medios --tag automatico \
        --exclude-caches 2>&1)
  rc=$?
  echo "$out" >> "$LOG_FILE"
  [ $rc -eq 0 ] || fail "restic backup falló (código $rc). Últimas líneas:
$(echo "$out" | tail -5)"

  elapsed=$(( $(date +%s) - started ))

  # INSTRUMENTACIÓN del riesgo de consistencia (ver cabecera): restic avisa
  # cuando un archivo cambió mientras lo leía. Si esto aparece, la ventana de
  # 47s del pipeline de ingesta SÍ nos está alcanzando y toca escalar a
  # snapshot APFS + LaunchDaemon. Mientras no aparezca, no hace falta.
  local changed
  changed=$(echo "$out" | grep -ci "changed during backup\|file changed while reading" || true)
  if [ "$changed" -gt 0 ]; then
    log "AVISO: $changed archivo(s) cambiaron durante la lectura"
    notify "🟡 Backup de medios OK, pero con $changed archivo(s) modificados durante la lectura.

Se auto-corrige en el backup siguiente, pero si se repite hay que pasar a
snapshot APFS (requiere correr como root/LaunchDaemon)."
  fi

  local added files
  added=$(echo "$out" | grep -oE "Added to the repository: [0-9.]+ [KMGT]?i?B" | head -1 | cut -d: -f2- | xargs || echo "?")
  files=$(echo "$out" | grep -oE "processed [0-9]+ files" | head -1 | awk '{print $2}' || echo "?")

  log "Backup OK — ${files} archivos, ${added} nuevos, ${elapsed}s"

  # Retención. `forget --prune` libera de verdad el espacio de los snapshots
  # expirados; sin --prune solo se borra la etiqueta y el repo no deja de crecer.
  log "Aplicando retención (${KEEP_DAILY}d/${KEEP_WEEKLY}w/${KEEP_MONTHLY}m)"
  "$RESTIC" forget \
    --keep-daily "$KEEP_DAILY" \
    --keep-weekly "$KEEP_WEEKLY" \
    --keep-monthly "$KEEP_MONTHLY" \
    --prune >>"$LOG_FILE" 2>&1 \
    || log "AVISO: la retención falló (el backup de hoy SÍ se guardó)"

  local snaps repo_size
  snaps=$("$RESTIC" snapshots --json 2>/dev/null | grep -c '"time"' || echo "?")
  repo_size=$(du -sh "$REPO" 2>/dev/null | cut -f1 || echo "?")

  # Heartbeat (dead man's switch). Lo lee lila-app para alertar si los backups
  # DEJAN de ocurrir: un backup que no corre no genera ningún error, simplemente
  # no pasa. Sin esto, un agendado perdido —p.ej. al migrar de máquina, donde el
  # plist NO viaja con el repo git— no se detecta hasta que hay que restaurar.
  # Se escribe SOLO en éxito, que es lo que hace que el silencio sea la señal.
  date +%s > "$HEARTBEAT_FILE"

  log "=== Backup de medios: fin (${elapsed}s) ==="
  release_lock
  trap - EXIT

  # Resumen solo si se pide (para no ensuciar Telegram todas las noches). El
  # silencio es la señal de éxito; el ruido se reserva para los fallos.
  if [ "${BACKUP_NOTIFY_SUCCESS:-0}" = "1" ]; then
    notify "✅ Backup de medios OK
${files} archivos · ${added} nuevos · ${elapsed}s
Repositorio: ${repo_size} · ${snaps} snapshots"
  fi
}

main "$@"
