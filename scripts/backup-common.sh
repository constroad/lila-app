#!/bin/bash
# Configuración y utilidades compartidas por los scripts de backup.
# Se hace `source` desde backup-media.sh, backup-db.sh, backup-offsite.sh y
# verify-backups.sh.
#
# POR QUÉ EXISTE — PORTABILIDAD (Fase 5, migración de máquina):
#   Antes cada script traía rutas absolutas (`/Users/jose/...`,
#   `/opt/homebrew/bin/restic`). En una máquina con otro usuario —o un Mac
#   Intel, donde Homebrew vive en /usr/local— los 4 scripts fallaban. Y peor:
#   fallaban DESPUÉS de migrar, cuando nadie está mirando.
#   Acá todo se DERIVA: la raíz del repo sale de la ubicación de este archivo,
#   el origen de los medios sale de FILE_STORAGE_ROOT en .env (misma fuente de
#   verdad que usa lila), y los binarios se descubren con `command -v`.
#
# REGLA: ningún script de backup debe contener una ruta absoluta a /Users o
#   /opt. Si hace falta una ruta nueva, se deriva acá.

# ---- raíces derivadas ------------------------------------------------------

BACKUP_REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-${BACKUP_REPO_DIR}/.env}"
BACKUP_LOG_DIR="${BACKUP_LOG_DIR:-${BACKUP_REPO_DIR}/logs}"
BACKUP_CONFIG_DIR="${BACKUP_CONFIG_DIR:-$HOME/.config/constroad-backup}"
BACKUP_PASSWORD_FILE="${BACKUP_PASSWORD_FILE:-${BACKUP_CONFIG_DIR}/restic-media.pass}"

# ---- descubrimiento de binarios --------------------------------------------
# `command -v` primero (respeta el PATH del usuario), y si el PATH viene pelado
# —launchd NO hereda el PATH del shell interactivo— se prueban las dos
# ubicaciones de Homebrew: Apple Silicon y Intel.
descubrir_binario() {
  local nombre="$1" ruta
  ruta=$(command -v "$nombre" 2>/dev/null) && { echo "$ruta"; return 0; }
  for base in /opt/homebrew/bin /usr/local/bin /usr/bin; do
    [ -x "${base}/${nombre}" ] && { echo "${base}/${nombre}"; return 0; }
  done
  return 1
}

RESTIC="${RESTIC_BIN:-$(descubrir_binario restic || echo '')}"
MONGODUMP="${MONGODUMP_BIN:-$(descubrir_binario mongodump || echo '')}"
# `node` también se descubre: bajo launchd el PATH es mínimo (/usr/bin:/bin:...)
# y no incluye Homebrew. El 2026-08-09 la verificación semanal reportó "BSON
# corrupto" cuando en realidad `node` no existía en ese PATH — una falsa alarma
# de corrupción de datos, que es de las peores porque erosiona la confianza en
# las alertas reales.
NODE="${NODE_BIN:-$(descubrir_binario node || echo '')}"

# ---- destino de los backups ------------------------------------------------

BACKUP_VOLUME="${BACKUP_VOLUME:-/Volumes/CONSTROAD-BACKUP}"
MEDIA_REPO="${BACKUP_REPO:-${BACKUP_VOLUME}/restic-media}"
DB_REPO="${DB_BACKUP_REPO:-${BACKUP_VOLUME}/restic-db}"

# ---- lectura de .env -------------------------------------------------------

env_get() {
  [ -r "$BACKUP_ENV_FILE" ] || return 0
  grep -E "^$1=" "$BACKUP_ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

# El origen de los medios sale de FILE_STORAGE_ROOT — la MISMA variable que usa
# lila para escribirlos. Si mañana cambia el storage, el backup lo sigue solo en
# vez de respaldar una ruta que ya nadie usa (fallo silencioso clásico).
resolver_source() {
  if [ -n "${BACKUP_SOURCE:-}" ]; then echo "$BACKUP_SOURCE"; return 0; fi
  local root
  root=$(env_get FILE_STORAGE_ROOT)
  [ -n "$root" ] && { echo "${root}/companies"; return 0; }
  return 1
}

# ---- utilidades ------------------------------------------------------------

backup_log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "${LOG_FILE:-/dev/null}"
}

# Fire-and-forget con timeout: una alerta que no responde no debe colgar el job.
backup_notify() {
  local token chat
  token=$(env_get TELEGRAM_BOT_TOKEN)
  chat=$(env_get TELEGRAM_ERRORS_CHAT_ID)
  [ -z "$token" ] && return 0
  /usr/bin/curl -sS -o /dev/null --max-time 15 \
    -d "chat_id=${chat}" --data-urlencode "text=$1" \
    "https://api.telegram.org/bot${token}/sendMessage" 2>/dev/null || true
}

# ---- alertas con dedupe ----------------------------------------------------
# El backup de la base corre CADA HORA: sin dedupe, un fallo persistente —el
# disco desconectado un fin de semana, o un permiso que falta— dispara 24
# alertas por día. Una alerta que suena cada hora por lo mismo entrena a
# ignorarlas, y entonces la que importa pasa desapercibida.
#
# Reglas: se alerta SIEMPRE ante un fallo NUEVO o distinto al anterior; si el
# mismo fallo persiste, se repite cada ALERT_REPEAT_SECONDS; y se avisa cuando
# se RECUPERA, para cerrar el ciclo (si no, quedás sin saber si sigue roto).
ALERT_REPEAT_SECONDS="${BACKUP_ALERT_REPEAT_SECONDS:-21600}" # 6h

# $1 = clave del job (media|db|offsite|verify) · $2 = mensaje
backup_notify_failure() {
  local job="$1" mensaje="$2"
  local estado="${BACKUP_CONFIG_DIR}/alert-state-${job}"
  local firma ahora previa_firma previa_ts
  # Firma = primera línea del detalle: distingue "disco desconectado" de
  # "clave ilegible" para no silenciar un problema nuevo por culpa del viejo.
  firma=$(printf '%s' "$mensaje" | head -3 | shasum -a 256 | cut -c1-16)
  ahora=$(date +%s)

  if [ -r "$estado" ]; then
    previa_firma=$(cut -d' ' -f1 < "$estado" 2>/dev/null)
    previa_ts=$(cut -d' ' -f2 < "$estado" 2>/dev/null)
    if [ "$firma" = "$previa_firma" ] && [ -n "$previa_ts" ] \
       && [ $((ahora - previa_ts)) -lt "$ALERT_REPEAT_SECONDS" ]; then
      backup_log "Alerta silenciada (mismo fallo, próxima en $(( (ALERT_REPEAT_SECONDS - (ahora - previa_ts)) / 60 )) min)"
      return 0
    fi
  fi

  mkdir -p "$BACKUP_CONFIG_DIR"
  echo "$firma $ahora" > "$estado"
  backup_notify "$mensaje"
}

# Se llama tras un éxito: si veníamos de un fallo, avisa que se recuperó y
# limpia el estado.
backup_notify_recovery() {
  local job="$1" mensaje="$2"
  local estado="${BACKUP_CONFIG_DIR}/alert-state-${job}"
  [ -r "$estado" ] || return 0
  rm -f "$estado"
  backup_notify "$mensaje"
}

# Preflight común: sin esto, el modo de fallo es "terminó bien sin respaldar".
verificar_binarios() {
  [ -n "$RESTIC" ] && [ -x "$RESTIC" ] || {
    echo "restic no encontrado. Instalar con: brew install restic"; return 1; }
  return 0
}

verificar_volumen() {
  [ -d "$BACKUP_VOLUME" ] || {
    echo "El disco de backup NO está montado (falta $BACKUP_VOLUME).
¿Está conectado el SSD CONSTROAD-BACKUP?"; return 1; }
  local probe="${BACKUP_VOLUME}/.write-test.$$"
  touch "$probe" 2>/dev/null || {
    echo "El disco está montado pero NO se puede escribir en $BACKUP_VOLUME.
Causa más probable: falta 'Acceso total al disco' para el proceso del backup
(Ajustes → Privacidad y Seguridad → Acceso total al disco → /bin/bash)."; return 1; }
  rm -f "$probe"
  return 0
}
