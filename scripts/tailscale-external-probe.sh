#!/bin/bash
# Tailscale Funnel External Probe + Auto-recovery + Alerting
#
# Validates that the funnel is reachable from the PUBLIC path (not just locally
# via MagicDNS). It resolves the hostname through a public resolver (8.8.8.8)
# and forces curl to connect to those DERP IPs, simulating an external client.
#
# Auto-recovery escalation when probes keep failing:
#   level 1 -> `tailscale funnel reset` + restart        (cheapest)
#   level 2 -> `tailscale down && tailscale up`          (re-register node)
#   level 3 -> kill + relaunch Tailscale.app             (restart GUI/IPN)
#   level 4 -> send Telegram alert, stay in "alerting" until recovered
#
# Each level fires after another FAIL_THRESHOLD consecutive failures. On any
# successful probe the level resets to 0. The current level survives script
# restarts via /tmp state file so KeepAlive=true doesn't reset escalation.
#
# Companion to tailscale-funnel-watchdog.sh:
#   - watchdog       -> checks LOCAL `tailscale funnel status` every 30s
#   - external-probe -> checks REAL external reachability every 60s

set -u

TAILSCALE="/usr/local/bin/tailscale"
HOST="joses-mac-mini.tail46a1b0.ts.net"
PORT=3001
PROBE_PATH="/health"
PUBLIC_RESOLVER="8.8.8.8"
LOG_FILE="/Users/jose/projects/lila-app/logs/tailscale-external-probe.log"
ENV_FILE="/Users/jose/projects/lila-app/.env"
STATE_DIR="/tmp"
LEVEL_FILE="${STATE_DIR}/tailscale-probe-level"
LAST_ALERT_FILE="${STATE_DIR}/tailscale-probe-last-alert"
CHECK_INTERVAL=60        # seconds between probes
PROBE_TIMEOUT=10         # per-curl timeout
FAIL_THRESHOLD=3         # consecutive failures before next escalation step
ALERT_REPEAT_SECONDS=900 # re-alert every 15 min while still down
POST_ACTION_COOLDOWN=15  # wait this long after a recovery action before counting again

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ---- env loading -----------------------------------------------------------

load_env() {
  TELEGRAM_BOT_TOKEN=""
  TELEGRAM_ERRORS_CHAT_ID=""
  if [ -r "$ENV_FILE" ]; then
    TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    TELEGRAM_ERRORS_CHAT_ID=$(grep -E '^TELEGRAM_ERRORS_CHAT_ID=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  fi
}

# ---- alerting --------------------------------------------------------------

send_telegram_alert() {
  local message="$1"
  load_env
  if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_ERRORS_CHAT_ID" ]; then
    log "Telegram alert skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_ERRORS_CHAT_ID in $ENV_FILE"
    return 1
  fi
  local now last
  now=$(date +%s)
  last=0
  [ -r "$LAST_ALERT_FILE" ] && last=$(cat "$LAST_ALERT_FILE" 2>/dev/null || echo 0)
  if [ $((now - last)) -lt "$ALERT_REPEAT_SECONDS" ]; then
    return 0  # within dedupe window, silently skip
  fi
  local http_code
  http_code=$(/usr/bin/curl -sS -o /dev/null -w '%{http_code}' \
    --max-time 5 \
    -d "chat_id=${TELEGRAM_ERRORS_CHAT_ID}" \
    --data-urlencode "text=${message}" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" 2>/dev/null || echo "000")
  if [[ "$http_code" == "200" ]]; then
    echo "$now" > "$LAST_ALERT_FILE"
    log "Telegram alert sent (HTTP $http_code)"
  else
    log "Telegram alert FAILED (HTTP $http_code)"
  fi
}

# ---- escalation state ------------------------------------------------------

get_level() {
  if [ -r "$LEVEL_FILE" ]; then
    cat "$LEVEL_FILE" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

set_level() {
  echo "$1" > "$LEVEL_FILE"
}

# ---- probe -----------------------------------------------------------------

resolve_derp_ips() {
  /usr/bin/dig "@$PUBLIC_RESOLVER" +short +time=3 +tries=1 A "$HOST" 2>/dev/null | head -4
}

probe_external() {
  local ips ip http_code
  ips=$(resolve_derp_ips)
  if [ -z "$ips" ]; then
    log "WARNING: public DNS ($PUBLIC_RESOLVER) returned no A records for $HOST"
    return 1
  fi
  while IFS= read -r ip; do
    [ -z "$ip" ] && continue
    http_code=$(/usr/bin/curl -sS -o /dev/null -w '%{http_code}' \
      --max-time "$PROBE_TIMEOUT" \
      --resolve "${HOST}:443:${ip}" \
      "https://${HOST}${PROBE_PATH}" 2>/dev/null || echo "000")
    if [[ "$http_code" =~ ^[23] ]]; then
      return 0
    fi
  done <<< "$ips"
  return 1
}

# ---- recovery actions ------------------------------------------------------

action_funnel_reset() {
  log "ESCALATION 1: 'tailscale funnel reset' + restart"
  "$TAILSCALE" funnel reset >> "$LOG_FILE" 2>&1 || true
  sleep 2
  "$TAILSCALE" funnel --bg "$PORT" >> "$LOG_FILE" 2>&1 || true
}

action_tailscale_down_up() {
  log "ESCALATION 2: 'tailscale down && tailscale up'"
  "$TAILSCALE" down >> "$LOG_FILE" 2>&1 || true
  sleep 3
  "$TAILSCALE" up >> "$LOG_FILE" 2>&1 || true
  sleep 5
  "$TAILSCALE" funnel --bg "$PORT" >> "$LOG_FILE" 2>&1 || true
}

action_relaunch_app() {
  log "ESCALATION 3: kill + relaunch Tailscale.app"
  /usr/bin/pkill -x Tailscale 2>/dev/null || true
  sleep 3
  /usr/bin/open -a Tailscale 2>/dev/null || true
  sleep 8
  "$TAILSCALE" funnel --bg "$PORT" >> "$LOG_FILE" 2>&1 || true
}

action_alert() {
  log "ESCALATION 4: sending Telegram alert"
  send_telegram_alert "🚨 lila-app funnel DOWN

Host: ${HOST}
Path: ${PROBE_PATH}
Auto-recovery exhausted (funnel reset, down/up, app relaunch).
Manual intervention required.

Check:
- tailscale funnel status
- dig +short ${HOST} @${PUBLIC_RESOLVER}
- ${LOG_FILE}"
}

run_escalation_step() {
  local level="$1"
  case "$level" in
    1) action_funnel_reset ;;
    2) action_tailscale_down_up ;;
    3) action_relaunch_app ;;
    4|*) action_alert ;;
  esac
}

# ---- main loop -------------------------------------------------------------

initial_level=$(get_level)
log "=== External probe starting (host=$HOST resolver=$PUBLIC_RESOLVER interval=${CHECK_INTERVAL}s threshold=$FAIL_THRESHOLD level=$initial_level) ==="

fail_count=0
while true; do
  if probe_external; then
    level=$(get_level)
    if [ "$fail_count" -gt 0 ] || [ "$level" -gt 0 ]; then
      log "Recovered after $fail_count failed probe(s) (was at escalation level $level)"
      set_level 0
      rm -f "$LAST_ALERT_FILE" 2>/dev/null || true
    fi
    fail_count=0
  else
    fail_count=$((fail_count + 1))
    log "External probe FAILED ($fail_count/$FAIL_THRESHOLD)"
    if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
      level=$(get_level)
      next_level=$((level + 1))
      [ "$next_level" -gt 4 ] && next_level=4
      set_level "$next_level"
      run_escalation_step "$next_level"
      fail_count=0
      sleep "$POST_ACTION_COOLDOWN"
    fi
  fi
  sleep "$CHECK_INTERVAL"
done
