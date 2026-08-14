#!/bin/bash
# Vigila el túnel de Cloudflare y avisa por Telegram. Corre como LaunchDaemon.
#
# POR QUÉ EXISTE: el funnel de Tailscale tenía watchdog y probe externo desde el
# primer día; el túnel de Cloudflare —que ahora sirve constroad.com, www y lila—
# no tenía NADA. Si cloudflared muere, hoy nos enteramos cuando alguien no puede
# entrar. Además ya nos mordió una variante silenciosa: el daemon "corriendo"
# pero sin config, sirviendo cero (ver install-cloudflared-daemon.sh).
#
# TRES ESTADOS, NO DOS. La lección más cara de este proyecto es distinguir
# "está roto" de "no pude chequear" (specs/OBSERVABILITY-ALERTING.spec.md):
#   OK          → el sitio responde por el dominio público
#   ROTO        → hay internet, pero el sitio no responde
#   NO EVALUABLE→ esta máquina no tiene internet: no se puede culpar al túnel
# Alertar en el tercer caso sería mentir, y entrena a ignorar las alertas.
#
# NO REINICIA NADA a ciegas. launchd ya tiene KeepAlive sobre cloudflared; si el
# proceso muere, lo revive él. Este script solo verifica el resultado de punta a
# punta y avisa. Un watchdog que además actúa duplica la lógica de recuperación
# y puede pelearse con launchd.
set -u

DOMINIO="${CF_WATCHDOG_HOST:-constroad.com}"
INTERVALO="${CF_WATCHDOG_INTERVAL:-120}"
FALLOS_PARA_ALERTAR="${CF_WATCHDOG_THRESHOLD:-3}"   # 3 × 120s = ~6 min de caída real
LOG=/Users/jose/projects/lila-app/logs/cloudflare-watchdog.log
ENV_FILE=/Users/jose/projects/lila-app/.env
ESTADO=/Users/jose/projects/lila-app/logs/.cf-watchdog-state

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

telegram() {
  local msg="$1"
  local token chat
  token=$(/usr/bin/sed -n 's/^TELEGRAM_BOT_TOKEN=//p' "$ENV_FILE" 2>/dev/null | head -1)
  chat=$(/usr/bin/sed -n 's/^TELEGRAM_ERRORS_CHAT_ID=//p' "$ENV_FILE" 2>/dev/null | head -1)
  [ -z "$token" ] || [ -z "$chat" ] && { log "Telegram sin configurar"; return 1; }
  /usr/bin/curl -sS -o /dev/null --max-time 8 \
    -d "chat_id=${chat}" --data-urlencode "text=${msg}" \
    "https://api.telegram.org/bot${token}/sendMessage" 2>/dev/null
}

# ¿Hay internet? Dos destinos distintos para no depender de un solo proveedor:
# si uno está caído por su cuenta, no queremos declarar "sin internet".
hay_internet() {
  /usr/bin/curl -s -o /dev/null --max-time 8 https://www.google.com 2>/dev/null && return 0
  /usr/bin/curl -s -o /dev/null --max-time 8 https://api.github.com 2>/dev/null
}

sitio_responde() {
  local code
  code=$(/usr/bin/curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://${DOMINIO}/" 2>/dev/null)
  [[ "$code" =~ ^[23] ]]
}

proceso_vivo() {
  /bin/launchctl print system/com.cloudflare.cloudflared 2>/dev/null | grep -q "state = running"
}

log "=== Watchdog del túnel Cloudflare arrancando (host=$DOMINIO cada ${INTERVALO}s, umbral=$FALLOS_PARA_ALERTAR) ==="

fallos=0
alertado=$(cat "$ESTADO" 2>/dev/null || echo 0)

while true; do
  if sitio_responde; then
    if [ "$alertado" = "1" ]; then
      log "RECUPERADO: $DOMINIO responde de nuevo"
      telegram "✅ RECUPERADO: https://${DOMINIO} vuelve a responder.

El túnel de Cloudflare está sirviendo con normalidad."
      alertado=0; echo 0 > "$ESTADO"
    fi
    [ "$fallos" -gt 0 ] && log "OK tras $fallos fallo(s)"
    fallos=0
  elif ! hay_internet; then
    # NO EVALUABLE: sin salida no se puede culpar al túnel. Se registra y no se
    # toca el contador, para que un corte de internet no dispare una alerta que
    # apunta al lugar equivocado.
    log "NO EVALUABLE: esta máquina no tiene internet; el túnel no es juzgable"
  else
    fallos=$((fallos + 1))
    proc=$(proceso_vivo && echo "vivo" || echo "CAÍDO")
    log "FALLO ($fallos/$FALLOS_PARA_ALERTAR) — $DOMINIO no responde · daemon=$proc · internet=ok"
    if [ "$fallos" -ge "$FALLOS_PARA_ALERTAR" ] && [ "$alertado" != "1" ]; then
      telegram "🚨 TÚNEL CLOUDFLARE CAÍDO

https://${DOMINIO} no responde desde hace ~$((fallos * INTERVALO / 60)) min.
Proceso cloudflared: ${proc}
Internet en la mini: OK

Portal y lila pueden estar sanos localmente: lo que falla es la vía pública.
Ruta alterna mientras tanto: el funnel de Tailscale."
      alertado=1; echo 1 > "$ESTADO"
      log "Alerta enviada a Telegram"
    fi
  fi
  sleep "$INTERVALO"
done
