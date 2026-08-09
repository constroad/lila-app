#!/bin/bash
# Vigilancia de VENCIMIENTOS de Tailscale — corre a diario, calla si todo está bien.
#
# POR QUÉ EXISTE (incidente 2026-08-08): el nodo perdió la sesión, el funnel se
# cayó y el acceso público estuvo 35 min muerto. Nadie se enteró hasta que un
# usuario vio las páginas sin imágenes. Lo que falló ahí no fue detectar la
# caída: fue no ver venir el vencimiento que la causó.
#
# La expiración de la clave del nodo ya se deshabilitó en el admin de Tailscale
# (2026-08-09), así que ese modo de fallo está cerrado. Pero quedan dos:
#   1. Que alguien reactive la expiración de clave sin querer.
#   2. El CERTIFICADO TLS del funnel, que sí vence (~90 días) y que Tailscale
#      renueva solo. Si esa renovación falla, el funnel muere por HTTPS y el
#      síntoma es idéntico: páginas públicas sin imágenes.
#
# Avisar con semanas de anticipación convierte una caída en un trámite.

set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/backup-common.sh"

TAILSCALE="${TAILSCALE_BIN:-$(descubrir_binario tailscale || echo /usr/local/bin/tailscale)}"
HOST="${TS_HOST:-cloud-constroad-s3.tail46a1b0.ts.net}"
LOG_FILE="${TS_HEALTH_LOG_FILE:-${BACKUP_LOG_DIR}/tailscale-health.log}"

# Umbrales en días. El aviso temprano da margen para actuar sin urgencia; el
# urgente es para cuando ya hay que hacer algo hoy.
DIAS_AVISO="${TS_DIAS_AVISO:-21}"
DIAS_URGENTE="${TS_DIAS_URGENTE:-7}"

PROBLEMAS=()

dias_hasta() {
  # $1 = fecha en formato de `date -j -f`. Devuelve días restantes (puede ser <0).
  local objetivo epoch ahora
  objetivo="$1"
  epoch=$(date -j -f "%b %d %T %Y %Z" "$objetivo" +%s 2>/dev/null) || return 1
  ahora=$(date +%s)
  echo $(( (epoch - ahora) / 86400 ))
}

# ---- 1. sesión del nodo ----------------------------------------------------

revisar_sesion() {
  local salida
  salida=$("$TAILSCALE" status 2>&1 | head -1)
  if echo "$salida" | grep -qi "logged out"; then
    local url
    url=$("$TAILSCALE" status 2>&1 | grep -oE "https://login\.tailscale\.com/[^ ]+" | head -1)
    PROBLEMAS+=("🔴 NODO DESLOGUEADO — el acceso público está caído.
Autenticar: ${url:-https://login.tailscale.com}
Después: tailscale funnel --bg 3001")
    return
  fi
  backup_log "sesión: activa"
}

# ---- 2. expiración de la clave del nodo ------------------------------------

revisar_clave() {
  local expiry dias
  expiry=$("$TAILSCALE" status --json 2>/dev/null \
           | python3 -c "import json,sys; print(json.load(sys.stdin).get('Self',{}).get('KeyExpiry') or '')" 2>/dev/null)

  if [ -z "$expiry" ]; then
    backup_log "clave del nodo: sin expiración (correcto para un servidor)"
    return
  fi

  # Formato ISO: 2027-02-04T20:24:39Z
  local epoch ahora
  epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "${expiry%%.*}" +%s 2>/dev/null) || {
    backup_log "AVISO: no se pudo interpretar KeyExpiry='${expiry}'"; return; }
  ahora=$(date +%s)
  dias=$(( (epoch - ahora) / 86400 ))
  backup_log "clave del nodo: expira en ${dias} días"

  # La expiración está DESHABILITADA a propósito; que reaparezca es en sí una
  # señal de que alguien la reactivó.
  if [ "$dias" -le "$DIAS_URGENTE" ]; then
    PROBLEMAS+=("🔴 La clave del nodo expira en ${dias} días (${expiry}).
Al expirar, el funnel muere y hace falta login manual.
Arreglo definitivo: admin de Tailscale → Machines → cloud-constroad-s3 → Disable key expiry")
  elif [ "$dias" -le "$DIAS_AVISO" ]; then
    PROBLEMAS+=("🟡 La clave del nodo expira en ${dias} días (${expiry}).
Se había deshabilitado la expiración: alguien la reactivó.
Admin de Tailscale → Machines → cloud-constroad-s3 → Disable key expiry")
  fi
}

# ---- 3. certificado TLS del funnel -----------------------------------------

revisar_certificado() {
  local fin dias
  fin=$(echo | openssl s_client -servername "$HOST" -connect "${HOST}:443" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -z "$fin" ]; then
    PROBLEMAS+=("🟡 No se pudo leer el certificado TLS de ${HOST}.
Puede ser que el funnel esté caído, o un problema de red.")
    return
  fi

  dias=$(dias_hasta "$fin") || { backup_log "AVISO: no se pudo interpretar la fecha '${fin}'"; return; }
  backup_log "certificado TLS: vence en ${dias} días (${fin})"

  # Tailscale lo renueva solo. Que se acerque el vencimiento significa que la
  # renovación NO está ocurriendo — y el síntoma sería idéntico al del incidente:
  # páginas públicas sin imágenes.
  if [ "$dias" -le "$DIAS_URGENTE" ]; then
    PROBLEMAS+=("🔴 El certificado TLS del funnel vence en ${dias} días (${fin}).
Tailscale debería renovarlo solo; que no lo haya hecho indica que la renovación
está fallando. Al vencer, las páginas públicas dejan de cargar imágenes.
Probar: tailscale cert ${HOST}")
  elif [ "$dias" -le "$DIAS_AVISO" ]; then
    PROBLEMAS+=("🟡 El certificado TLS del funnel vence en ${dias} días (${fin}).
Debería renovarse solo. Si en una semana sigue igual, la renovación está fallando.")
  fi
}

# ---- main ------------------------------------------------------------------

main() {
  mkdir -p "$(dirname "$LOG_FILE")"
  backup_log "=== Chequeo de vencimientos de Tailscale ==="

  [ -x "$TAILSCALE" ] || { backup_log "ERROR: no se encontró el binario de tailscale"; exit 1; }

  revisar_sesion
  revisar_clave
  revisar_certificado

  if [ ${#PROBLEMAS[@]} -eq 0 ]; then
    backup_log "=== Todo en orden ==="
    exit 0
  fi

  # Solo se notifica cuando hay algo que hacer: un chequeo que saluda todos los
  # días entrena a ignorarlo.
  local detalle
  detalle=$(printf '%s\n\n' "${PROBLEMAS[@]}")
  backup_notify "⏳ TAILSCALE — atención requerida

${detalle}
Contexto: si el funnel se cae, lila-app sigue sirviendo bien pero las páginas
PÚBLICAS quedan sin imágenes ni logo (incidente 2026-08-08)."
  backup_log "=== ${#PROBLEMAS[@]} problema(s) notificados ==="
}

main "$@"
