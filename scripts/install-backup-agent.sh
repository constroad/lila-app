#!/bin/bash
# Instala (o reinstala) el agente launchd del backup diario de medios.
#
# POR QUÉ ESTE SCRIPT EXISTE — PORTABILIDAD:
#   El plist vive en ~/Library/LaunchAgents, FUERA del repo git. Migrar el
#   código a otra máquina NO migra el agendado: quedaría todo aparentemente
#   bien y sin backups corriendo. Este instalador es la pieza versionada que
#   reconstruye el agendado en la máquina nueva — migrar = correr esto.
#   Como red de seguridad adicional hay un dead man's switch (ver §Vigilancia).
#
# POR QUÉ launchd Y NO cron:
#   - cron está deprecado en macOS, pero el motivo real es TCC: cuando el padre
#     es cron (no una app en primer plano), macOS deniega el acceso a rutas
#     protegidas EN SILENCIO. El backup escribe en un volumen externo, que es
#     exactamente eso. Fallaría sin decir nada — el peor modo para un backup.
#   - Si la Mac está dormida a la hora programada, launchd corre el trabajo al
#     despertar (StartCalendarInterval); cron simplemente lo saltea.
#
# HORARIO: 00:30. Medido sobre 2 meses de subidas reales, la franja 00:00-01:00
#   es la más tranquila (37 y 16 subidas/hora contra 208 a las 02:00 y 324 a las
#   07:00). Menos tráfico = menos chance de leer un archivo a mitad del pipeline
#   de ingesta (ver cabecera de backup-media.sh).
#
# VIGILANCIA (dead man's switch): este agente NO se vigila a sí mismo — si no
#   corre, no hay quién avise. Esa vigilancia va en el JobExecutor de lila-app,
#   que es un mecanismo independiente: revisa la edad del último snapshot y
#   alerta si supera las 25h (24h + 1h de gracia, para no alertar por jitter).

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${REPO_DIR}/logs"
UID_NUM=$(id -u)

# Medios: diario en la franja más tranquila (00:00-01:00 medido sobre 2 meses).
# Base: HORARIA, porque Atlas M0 no tiene backups propios y son solo 77 MB
# (Tier 1 vs Tier 2 — ver cabeceras de cada script).
MEDIA_HOUR="${BACKUP_HOUR:-0}"
MEDIA_MINUTE="${BACKUP_MINUTE:-30}"
DB_MINUTE="${DB_BACKUP_MINUTE:-15}"

info() { printf '  %s\n' "$1"; }

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

# ---- instalador genérico ---------------------------------------------------
# $1 label · $2 script · $3 bloque XML de StartCalendarInterval · $4 descripción
install_agent() {
  local label="$1" script="$2" schedule_xml="$3" descripcion="$4"
  local plist="$HOME/Library/LaunchAgents/${label}.plist"
  local slug="${label##*.}"

  echo "→ ${label} (${descripcion})"
  [ -x "$script" ] || { echo "ERROR: no existe o no es ejecutable: $script"; exit 1; }

  # RunAtLoad=false a propósito: instalar el agente no debe disparar un backup
  # inmediato (sorprende y puede pisar una corrida manual). El primero sale a la
  # hora programada, o a mano con `launchctl kickstart`.
  cat > "$plist" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${script}</string>
    </array>

${schedule_xml}

    <key>RunAtLoad</key>
    <false/>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/${slug}-agent.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/${slug}-agent-err.log</string>

    <key>ProcessType</key>
    <string>Background</string>

    <!-- Nice bajo: el backup nunca debe competir con lila-app por CPU. -->
    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>
PLIST_EOF
  info "plist escrito en $plist"

  # bootout + bootstrap es la forma moderna (load/unload está deprecado). El
  # bootout inicial es idempotente: permite reinstalar sin error.
  launchctl bootout "gui/${UID_NUM}/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/${UID_NUM}" "$plist" 2>/dev/null \
    || { echo "ERROR: no se pudo cargar $label"; exit 1; }

  # `launchctl print` es autoritativo; `launchctl list` tiene una carrera con
  # bootstrap y puede no mostrar el servicio recién cargado.
  local verified=0
  for _ in 1 2 3; do
    launchctl print "gui/${UID_NUM}/${label}" >/dev/null 2>&1 && { verified=1; break; }
    sleep 1
  done
  [ "$verified" = "1" ] || { echo "ERROR: $label no quedó registrado"; exit 1; }
  info "cargado y verificado"
  echo
}

echo "Instalando agentes de backup"
echo

install_agent "com.constroad.backup-media" \
  "${REPO_DIR}/scripts/backup-media.sh" \
"    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${MEDIA_HOUR}</integer>
        <key>Minute</key>
        <integer>${MEDIA_MINUTE}</integer>
    </dict>" \
  "medios, diario"

# Sin la clave Hour, StartCalendarInterval dispara CADA hora en ese minuto.
install_agent "com.constroad.backup-db" \
  "${REPO_DIR}/scripts/backup-db.sh" \
"    <key>StartCalendarInterval</key>
    <dict>
        <key>Minute</key>
        <integer>${DB_MINUTE}</integer>
    </dict>" \
  "base de datos, cada hora"

# Réplica offsite DIARIA a las 02:00: después del backup de medios (00:30) para
# replicar lo del día, y antes de la verificación semanal (03:00) para no
# solaparse con el `prune`, que toma lock exclusivo.
#
# CONDICIONAL a propósito: sin credenciales de B2 el agente fallaría cada noche
# y alertaría por Telegram. Una alerta que suena todos los días por algo que ya
# se sabe se vuelve ruido, y el ruido entrena a ignorar las alertas de verdad.
ENV_FILE_PATH="${BACKUP_ENV_FILE:-${REPO_DIR}/.env}"
if [ -r "$ENV_FILE_PATH" ] && grep -qE '^B2_ACCOUNT_ID=.+' "$ENV_FILE_PATH" 2>/dev/null; then
  install_agent "com.constroad.backup-offsite" \
    "${REPO_DIR}/scripts/backup-offsite.sh" \
"    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>" \
    "réplica offsite a B2, diaria"
else
  echo "→ com.constroad.backup-offsite (réplica offsite): OMITIDO"
  info "faltan credenciales B2 en $ENV_FILE_PATH — agregá B2_ACCOUNT_ID/B2_ACCOUNT_KEY/B2_BUCKET"
  info "y volvé a correr este script. Sin esto NO hay copia fuera del edificio."
  echo
  # El agente viejo se descarga si existía, para no dejarlo fallando en silencio
  # tras quitar las credenciales.
  launchctl bootout "gui/${UID_NUM}/com.constroad.backup-offsite" 2>/dev/null || true
fi

# Reporte DIARIO a las 08:00 (hora de mirar el teléfono): confirmación POSITIVA
# de que el sistema funciona. Sin esto solo llegaban malas noticias, y confiar en
# un backup que nunca dice nada exige un acto de fe.
install_agent "com.constroad.backup-report" \
  "${REPO_DIR}/scripts/backup-report.sh" \
"    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>" \
  "reporte diario de estado"

# Vencimientos de Tailscale, DIARIO a las 08:05 (justo después del reporte).
# Calla si todo está bien: solo avisa cuando falta poco para un vencimiento.
install_agent "com.constroad.tailscale-health" \
  "${REPO_DIR}/scripts/check-tailscale-health.sh" \
"    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>5</integer>
    </dict>" \
  "vencimientos de Tailscale, diario"

# Recursos cada 30 min: CPU/RAM/disco + detección de minería. Más frecuente que
# los demás porque el objetivo secundario es detectar un COMPROMISO, y ahí las
# horas importan. La corrida cuesta ~100s de muestreo liviano.
install_agent "com.constroad.check-resources" \
  "${REPO_DIR}/scripts/check-resources.sh" \
"    <key>StartInterval</key>
    <integer>1800</integer>" \
  "recursos + antiminería, cada 30 min"

# Verificación SEMANAL (domingos 03:00): es más cara que un backup porque LEE
# los datos y restaura de verdad. Un backup sin simulacro de restauración no
# está probado — es el "0" de 3-2-1-1-0.
install_agent "com.constroad.verify-backups" \
  "${REPO_DIR}/scripts/verify-backups.sh" \
"    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key>
        <integer>0</integer>
        <key>Hour</key>
        <integer>3</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>" \
  "verificación + simulacro de restauración, semanal"

printf -v WHEN '%02d:%02d' "$MEDIA_HOUR" "$MEDIA_MINUTE"
cat <<EOF
Agentes instalados:
  medios : diario a las ${WHEN}
  base   : cada hora en el minuto ${DB_MINUTE}

PENDIENTE Y OBLIGATORIO — permiso de disco:
  El agente corre bajo launchd, no bajo tu terminal, así que necesita su
  propio permiso para escribir en el volumen externo:

    Ajustes del Sistema → Privacidad y Seguridad → Acceso total al disco
    → agregar /bin/bash

  Sin esto el backup falla. El script lo detecta y te alerta por Telegram,
  pero mejor darlo ahora.

Comandos útiles:
  Correr medios ahora : launchctl kickstart -k gui/${UID_NUM}/com.constroad.backup-media
  Correr base ahora   : launchctl kickstart -k gui/${UID_NUM}/com.constroad.backup-db
  Ver estado          : launchctl list | grep constroad.backup
  Desinstalar         : launchctl bootout gui/${UID_NUM}/com.constroad.backup-media
                        launchctl bootout gui/${UID_NUM}/com.constroad.backup-db
  Log del backup      : tail -f ${LOG_DIR}/backup-media.log
  Snapshots           : RESTIC_REPOSITORY=/Volumes/CONSTROAD-BACKUP/restic-media \\
                        RESTIC_PASSWORD_FILE=~/.config/constroad-backup/restic-media.pass \\
                        restic snapshots

AL MIGRAR A OTRA MÁQUINA: correr este mismo script. Es lo único que
reconstruye el agendado — el repo git no lo lleva puesto.
EOF
