#!/bin/bash
# Tailscale Funnel Watchdog
# Keeps tailscale funnel 3001 alive. Runs as LaunchAgent.

TAILSCALE="/usr/local/bin/tailscale"
PORT=3001
LOG_FILE="/Users/jose/projects/lila-app/logs/tailscale-watchdog.log"
CHECK_INTERVAL=30  # seconds between health checks

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

is_funnel_active() {
  # Check if funnel config exists for our port
  "$TAILSCALE" funnel status 2>/dev/null | grep -q "$PORT"
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
  "$TAILSCALE" funnel reset >> "$LOG_FILE" 2>&1
  sleep 2
  "$TAILSCALE" funnel --bg "$PORT" >> "$LOG_FILE" 2>&1
  local retry_code=$?
  if [ $retry_code -eq 0 ]; then
    log "Funnel started successfully after reset"
  else
    log "ERROR: Funnel still failing after reset (exit $retry_code) — will retry next cycle"
  fi
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
done
