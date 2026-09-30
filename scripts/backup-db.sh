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

# ---- el mongod propio (bóveda) --------------------------------------------
#
# LO QUE ESTO ARREGLA, y es serio: el 29/09/2026 seis bases se migraron de Atlas
# al mongod de la mini, y este script seguía respaldando SOLO Atlas — donde esos
# datos ya no viven. Estuvieron un día sin respaldo. Peor: la consola de bóveda
# mostraba «✓ Último backup: hace 38 min» leyendo el latido de ESTE respaldo,
# o sea reportando en verde el respaldo de otra cosa. Un falso verde en la única
# pregunta que importa.
#
# Se respalda acá y no en un script aparte a propósito: mismo repositorio de
# restic, mismo candado, mismas alertas, misma retención. Dos scripts de
# respaldo son dos cosas que se pueden desincronizar, y la que se rompe en
# silencio es siempre la segunda.
BOVEDA_ENV_FILE="${BOVEDA_ENV_FILE:-/Users/jose/deploys/boveda/shared/.env}"
BOVEDA_HEARTBEAT_FILE="${BOVEDA_HEARTBEAT_FILE:-${BACKUP_CONFIG_DIR}/last-boveda-backup}"


LOCK_FILE="/tmp/constroad-backup-db.lock"

# Bases a respaldar. Se listan explícitamente en vez de volcar TODO: `admin`,
# `local` y `config` son de Atlas y no nos pertenecen.
DATABASES=("constroad_db" "constroad" "shared_db" "test_db")

# Retención: 24 horarios (1 día de granularidad fina) + 7 diarios + 4 semanales.
KEEP_HOURLY="${DB_KEEP_HOURLY:-24}"
KEEP_DAILY="${DB_KEEP_DAILY:-7}"
KEEP_WEEKLY="${DB_KEEP_WEEKLY:-4}"

WORK_DIR=""
# Los .yaml con las URIs van ACA, no en WORK_DIR — y la diferencia no es cosmética.
#
# El 30/09/2026 se sacó la URI de la línea de comandos (`ps` la mostraba con la
# contraseña en claro) poniéndola en un archivo que `mongodump --config` lee. El
# archivo se creó dentro de WORK_DIR… que es exactamente el directorio que se le
# pasa a `restic backup`. Resultado: las dos URIs, con contraseña, viajaron a 22
# snapshots. Se arregló una exposición y se abrió otra, y la segunda tardó más en
# verse porque no la muestra ningún comando: hay que listar el snapshot.
# Lo encontró el simulacro de restauración (`verify-db-restore.sh`), que es para
# lo que sirve restaurar de verdad en vez de suponer.
CONF_DIR=""

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
  # El mongod PROPIO de la mini (bóveda). Vive en otro `.env` porque es de otro
  # servicio; se lee acá para respaldar las dos fuentes en la misma corrida.
  BOVEDA_URI=""
  if [ -r "$BOVEDA_ENV_FILE" ]; then
    BOVEDA_URI=$(grep -E '^BOVEDA_MONGO_URI_RESPALDO=' "$BOVEDA_ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
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
  [ -n "$CONF_DIR" ] && [ -d "$CONF_DIR" ] && rm -rf "$CONF_DIR"
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
  CONF_DIR=$(mktemp -d "/tmp/constroad-db-conf.XXXXXX") || fail "No se pudo crear el directorio de configuración"
  chmod 700 "$CONF_DIR"

  local started dumped=0
  started=$(date +%s)

  # REINTENTO ante fallos transitorios (2026-08-09): un hipo de DNS resolviendo
  # el SRV de Atlas (`lookup _mongodb._tcp... read udp`) tiraba el backup de esa
  # hora entero. Con RPO de 1h, perder una corrida por un fallo de red de un
  # segundo es desproporcionado — y encima genera una alerta que parece grave.
  # LA URI NO VA EN LA LÍNEA DE COMANDOS. `ps` la lee cualquier usuario de la
  # máquina, y ahí viaja la contraseña de la base en claro — se vio en un `ps`
  # de rutina el 29/09/2026, con la credencial de Atlas entera a la vista.
  # `mongodump --config` lee la URI de un archivo, que se crea 600 en CONF_DIR
  # —FUERA de lo que se respalda, ver arriba— y se borra en el trap EXIT.
  local conf="$CONF_DIR/mongodump.yaml"
  ( umask 077; printf 'uri: "%s"\n' "$MONGO_URI" > "$conf" )

  local intento
  for db in "${DATABASES[@]}"; do
    for intento in 1 2 3; do
      if "$MONGODUMP" --config="$conf" --db="$db" --out="$WORK_DIR" \
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

  # ---- y ahora el mongod propio -------------------------------------------
  #
  # `--oplog` y volcado COMPLETO: es lo que da consistencia punto-en-el-tiempo,
  # y solo funciona sobre el servidor entero (por eso la URI de `respaldo` no
  # lleva base en la ruta). Atlas no lo permitía en el tier gratis; acá sí, y es
  # la mejora concreta de tener el mongod propio.
  local boveda_ok=0
  if [ -n "$BOVEDA_URI" ]; then
    local bconf="$CONF_DIR/boveda.yaml"
    ( umask 077; printf 'uri: "%s"\n' "$BOVEDA_URI" > "$bconf" )
    local bintento
    for bintento in 1 2 3; do
      if "$MONGODUMP" --config="$bconf" --oplog --out="$WORK_DIR/boveda" \
           --quiet >>"$LOG_FILE" 2>&1; then
        boveda_ok=1
        [ "$bintento" -gt 1 ] && log "bóveda OK en el intento ${bintento} (fallo transitorio)"
        break
      fi
      [ "$bintento" -eq 3 ] && fail "mongodump del mongod propio falló tras 3 intentos"
      log "mongodump de bóveda falló (intento ${bintento}/3) — reintentando en 10s"
      sleep 10
    done
  else
    # «No pude chequear» NO es «está bien»: si falta la credencial, el respaldo
    # de bóveda NO corrió, y su latido no se toca para que la consola lo diga.
    log "AVISO: sin BOVEDA_MONGO_URI_RESPALDO en $BOVEDA_ENV_FILE — el mongod propio NO se respaldó"
  fi

  local dump_size
  dump_size=$(du -sh "$WORK_DIR" 2>/dev/null | cut -f1)
  log "Dump OK — ${dumped} bases de Atlas$([ "$boveda_ok" = 1 ] && echo ' + el mongod propio (con oplog)'), ${dump_size}"

  # -- a restic --
  export RESTIC_REPOSITORY="$REPO"
  export RESTIC_PASSWORD_FILE="$PASSWORD_FILE"

  if ! "$RESTIC" cat config >/dev/null 2>&1; then
    log "Repositorio de DB no encontrado — inicializando en $REPO"
    "$RESTIC" init >>"$LOG_FILE" 2>&1 || fail "No se pudo inicializar el repositorio en $REPO"
  fi

  "$RESTIC" unlock >>"$LOG_FILE" 2>&1 || true

  local out rc
  # `--exclude` es el cinturón sobre el tirante: los .yaml ya no viven acá, pero
  # si alguien vuelve a escribir un secreto en WORK_DIR, no entra al repositorio.
  out=$("$RESTIC" backup "$WORK_DIR" --tag db --tag automatico \
          --exclude '*.yaml' --exclude '*.conf' --exclude '.env*' 2>&1)
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
  # El latido de bóveda SOLO si su dump de verdad corrió. Escribirlo siempre
  # sería reportar en verde un respaldo que no existe, que es exactamente el
  # fallo que se está arreglando.
  [ "$boveda_ok" = 1 ] && date +%s > "$BOVEDA_HEARTBEAT_FILE"

  # Cierra el ciclo: si veníamos fallando, avisa que se recuperó. Sin esto
  # quedás sin saber si el problema sigue o se arregló solo.
  backup_notify_recovery db "✅ BACKUP DE BASE DE DATOS RECUPERADO

Volvió a funcionar tras uno o más fallos. ${added} nuevos, ${elapsed}s."

  log "=== Backup de DB: fin (${elapsed}s) ==="
}

main "$@"
