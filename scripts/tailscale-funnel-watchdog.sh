#!/bin/bash
# Tailscale Funnel Watchdog
# Mantiene vivo el funnel de lila (443→3001) y el de Portal (8443→3002).
#
# POR QUÉ VIGILA DOS (2026-08-13): al bloquearse Vercel, Portal pasó a servirse
# desde esta misma Mac mini. El funnel admite 443, 8443 y 10000; lila ya ocupaba
# el 443, así que Portal quedó en el 8443.
#
# EL DETALLE QUE IMPORTA: `start_funnel` recurre a `tailscale funnel reset` ante
# un fallo, y ese reset borra la configuración COMPLETA del funnel, no solo la
# del puerto que falló. Cuando este watchdog solo conocía el 3001, un hipo
# cualquiera se llevaba puesta la exposición de Portal y la reponía a medias:
# lila volvía, Portal no. Y como `is_funnel_active` también miraba solo el 3001,
# el watchdog se declaraba sano con Portal caído — invisible hasta que alguien
# lo reportara. Todo lo que el reset destruye tiene que restaurarse acá.

TAILSCALE="/usr/local/bin/tailscale"
PORT=3001
LOG_FILE="/Users/jose/projects/lila-app/logs/tailscale-watchdog.log"
CHECK_INTERVAL=30  # seconds between health checks

# Portal (contingencia). PORTAL_FUNNEL_ENABLED=false lo desactiva sin editar el
# script — útil el día que Vercel vuelva y Portal deje de servirse desde acá.
PORTAL_ENABLED="${PORTAL_FUNNEL_ENABLED:-true}"
PORTAL_PORT=3002
PORTAL_FUNNEL_PORT=8443

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

is_funnel_active() {
  # Check if funnel config exists for our port
  "$TAILSCALE" funnel status 2>/dev/null | grep -q "$PORT"
}

is_portal_funnel_active() {
  [ "$PORTAL_ENABLED" != "true" ] && return 0   # desactivado = "nada que vigilar"
  "$TAILSCALE" funnel status 2>/dev/null | grep -q ":${PORTAL_FUNNEL_PORT}"
}

start_portal_funnel() {
  [ "$PORTAL_ENABLED" != "true" ] && return 0
  log "Starting tailscale funnel ${PORTAL_FUNNEL_PORT} -> ${PORTAL_PORT} (Portal)..."
  "$TAILSCALE" funnel --bg --https="$PORTAL_FUNNEL_PORT" "$PORTAL_PORT" >> "$LOG_FILE" 2>&1
  local code=$?
  if [ $code -eq 0 ]; then
    log "Funnel de Portal activo en ${PORTAL_FUNNEL_PORT}"
  else
    log "ERROR: no se pudo exponer Portal en ${PORTAL_FUNNEL_PORT} (exit $code)"
  fi
  return $code
}

is_tailscale_running() {
  "$TAILSCALE" status > /dev/null 2>&1
  return $?
}

wait_for_tailscale() {
  local attempts=0
  while ! is_tailscale_running; do
    attempts=$((attempts + 1))
    if [ $attempts -gt 10 ]; then
      log "ERROR: Tailscale not available after 50s, giving up this cycle"
      return 1
    fi
    log "Waiting for Tailscale daemon... (attempt $attempts)"
    sleep 5
  done
  return 0
}

start_funnel() {
  log "Starting tailscale funnel $PORT..."
  # --bg makes it persistent (survives terminal close)
  "$TAILSCALE" funnel --bg "$PORT" >> "$LOG_FILE" 2>&1
  local exit_code=$?
  if [ $exit_code -eq 0 ]; then
    log "Funnel started successfully on port $PORT"
    return 0
  fi

  log "ERROR: Failed to start funnel (exit $exit_code) — attempting reset"
  # Stale foreground/serve config can hold port 443. Reset and retry once.
  # OJO: `reset` borra TODA la config del funnel, incluida la de Portal en 8443.
  # Por eso abajo se repone también Portal, no solo el puerto que falló.
  "$TAILSCALE" funnel reset >> "$LOG_FILE" 2>&1
  sleep 2
  "$TAILSCALE" funnel --bg "$PORT" >> "$LOG_FILE" 2>&1
  local retry_code=$?
  if [ $retry_code -eq 0 ]; then
    log "Funnel started successfully after reset"
  else
    log "ERROR: Funnel still failing after reset (exit $retry_code) — will retry next cycle"
  fi
  # El reset se llevó puesto a Portal: restaurarlo pase lo que pase con lila.
  start_portal_funnel
  return $retry_code
}

log "=== Tailscale Funnel Watchdog starting ==="
log "Tailscale version: $($TAILSCALE version 2>/dev/null | head -1)"

# Initial wait for Tailscale to be ready
wait_for_tailscale || exit 1

# Ensure funnel is active on startup
if ! is_funnel_active; then
  log "Funnel not active on startup, starting..."
  start_funnel
  sleep 5
fi
if ! is_portal_funnel_active; then
  log "Funnel de Portal no activo al arrancar, exponiendo..."
  start_portal_funnel
  sleep 3
fi

# Main monitoring loop
while true; do
  sleep "$CHECK_INTERVAL"

  if ! is_tailscale_running; then
    log "WARNING: Tailscale daemon not running, waiting..."
    wait_for_tailscale && start_funnel
    continue
  fi

  if ! is_funnel_active; then
    log "WARNING: Funnel on port $PORT is down, restarting..."
    start_funnel
    sleep 5

    if is_funnel_active; then
      log "Funnel restored successfully"
    else
      log "ERROR: Funnel could not be restored, will retry in ${CHECK_INTERVAL}s"
    fi
  fi

  # Portal se vigila APARTE: su caída no implica la de lila (ni al revés), y con
  # un solo chequeo sobre el 3001 la exposición de Portal podía estar muerta
  # mientras el watchdog se reportaba sano.
  if ! is_portal_funnel_active; then
    log "WARNING: el funnel de Portal (${PORTAL_FUNNEL_PORT}) está caído, reponiendo..."
    start_portal_funnel
    sleep 3
  fi
done
