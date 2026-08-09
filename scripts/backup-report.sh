#!/bin/bash
# Reporte DIARIO del estado de los backups → Telegram.
#
# POR QUÉ EXISTE: hasta ahora solo llegaban malas noticias. El diseño original
# era "el silencio es la señal de éxito" + dead man's switch, y eso es correcto
# para no generar ruido... pero deja sin respuesta la pregunta razonable de
# "¿esto está funcionando?". Confiar en un backup que nunca te dice nada exige
# un acto de fe, y la fe no es una estrategia de respaldo.
#
# POR QUÉ UN RESUMEN Y NO UN MENSAJE POR CORRIDA: el backup de la base corre
# CADA HORA. Notificar cada éxito serían 24 mensajes diarios que nadie lee, y
# entre ese ruido se pierde la alerta que importa. Un resumen al día da la
# confirmación positiva sin entrenar a ignorar el canal.
#
# ES INDEPENDIENTE de los backups: corre aunque todos hayan fallado, y en ese
# caso lo dice. Si dependiera de un backup exitoso, el día que todo se rompa no
# habría reporte — justo cuando más falta hace.

set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/backup-common.sh"

LOG_FILE="${REPORT_LOG_FILE:-${BACKUP_LOG_DIR}/backup-report.log}"

# ---- helpers ---------------------------------------------------------------

# Antigüedad en SEGUNDOS, o -1 si nunca hubo. La decisión ✅/🔴 se toma con este
# número, nunca con el texto: comparar la cadena humanizada ("hace 1 h") daba
# rojo a algo sano, que es justo el ruido que erosiona la confianza en el canal.
edad_segundos() {
  local ts
  ts=$(cat "${BACKUP_CONFIG_DIR}/$1" 2>/dev/null || echo "")
  [ -z "$ts" ] && { echo -1; return; }
  echo $(( $(date +%s) - ts ))
}

humanizar() {
  local delta="$1"
  [ "$delta" -lt 0 ] && { echo "NUNCA"; return; }
  if [ "$delta" -lt 3600 ]; then echo "hace $((delta / 60)) min"
  elif [ "$delta" -lt 86400 ]; then echo "hace $((delta / 3600)) h"
  else echo "hace $((delta / 86400)) d"; fi
}

# ✅ si está dentro del umbral, 🔴 si lo pasó o nunca corrió. Los umbrales son
# los MISMOS que vigila backup-watchdog.service.ts, para que el reporte y las
# alertas nunca se contradigan.
icono() {
  local delta="$1" umbral="$2"
  { [ "$delta" -lt 0 ] || [ "$delta" -gt "$umbral" ]; } && echo "🔴" || echo "✅"
}

# Corridas OK de la base en las últimas 24h, contadas desde el log.
db_ok_24h() {
  local log="${BACKUP_LOG_DIR}/backup-db.log" desde
  [ -r "$log" ] || { echo 0; return; }
  desde=$(date -v-24H '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "")
  [ -z "$desde" ] && { grep -ac "Backup de DB OK" "$log" || echo 0; return; }
  awk -v d="$desde" '$0 >= "["d && /Backup de DB OK/' "$log" 2>/dev/null | wc -l | tr -d ' '
}

db_fallos_24h() {
  local log="${BACKUP_LOG_DIR}/backup-db.log" desde
  [ -r "$log" ] || { echo 0; return; }
  desde=$(date -v-24H '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "")
  [ -z "$desde" ] && { echo 0; return; }
  awk -v d="$desde" '$0 >= "["d && /ERROR:/' "$log" 2>/dev/null | wc -l | tr -d ' '
}

snapshots_de() {
  local repo="$1"
  [ -d "$repo" ] || { echo "?"; return; }
  RESTIC_REPOSITORY="$repo" RESTIC_PASSWORD_FILE="$BACKUP_PASSWORD_FILE" \
    "$RESTIC" snapshots --json 2>/dev/null \
    | tr ',' '\n' | grep -c '"short_id"' || echo "?"
}

# ---- main ------------------------------------------------------------------

main() {
  mkdir -p "$(dirname "$LOG_FILE")"
  backup_log "=== Reporte diario ==="

  local disco_ok="✅" espacio="?" medios db verif offsite
  if [ -d "$BACKUP_VOLUME" ]; then
    espacio=$(df -h "$BACKUP_VOLUME" 2>/dev/null | tail -1 | awk '{print $4" libres de "$2}')
  else
    disco_ok="🔴 DESCONECTADO"
  fi

  local e_m e_d e_v e_o
  e_m=$(edad_segundos last-media-backup); medios=$(humanizar "$e_m")
  e_d=$(edad_segundos last-db-backup);    db=$(humanizar "$e_d")
  e_v=$(edad_segundos last-verify);       verif=$(humanizar "$e_v")
  e_o=$(edad_segundos last-offsite);      offsite=$(humanizar "$e_o")
  [ "$e_o" -lt 0 ] && offsite="sin configurar (faltan credenciales B2)"

  local ok24 fallos24 snaps_m snaps_d
  ok24=$(db_ok_24h); fallos24=$(db_fallos_24h)
  snaps_m=$(snapshots_de "$MEDIA_REPO"); snaps_d=$(snapshots_de "$DB_REPO")

  local m_ico d_ico v_ico
  m_ico=$(icono "$e_m" 90000)   # 25h, igual que el watchdog
  d_ico=$(icono "$e_d" 7200)    # 2h
  v_ico=$(icono "$e_v" 691200)  # 8 días

  local mensaje="📦 Backups — reporte diario

${m_ico} Medios      : ${medios} · ${snaps_m} snapshots
${d_ico} Base datos  : ${db} · ${ok24} OK / ${fallos24} fallos en 24h · ${snaps_d} snapshots
${v_ico} Verificación: ${verif}
📤 Offsite     : ${offsite}

💾 Disco: ${disco_ok} ${espacio}"

  backup_notify "$mensaje"
  backup_log "Reporte enviado"
}

main "$@"
