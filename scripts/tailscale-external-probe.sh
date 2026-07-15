#!/bin/bash
# Tailscale Funnel External Probe + Auto-recovery + Alerting
#
# Validates that the funnel is reachable from the PUBLIC path (not just locally
# via MagicDNS). It resolves the hostname through a public resolver (8.8.8.8)
# and forces curl to connect to those DERP IPs, simulating an external client.
#
# Escalation branches on FAILURE MODE (checked at each threshold):
#
#   local_app=FAIL  (lila-app is down/crash-looping):
#     level 1/2 -> launchctl stop+start com.lila.app   (restart app)
#     level 3+  -> Telegram alert — app crash/loop, manual required
#
#   local_app=ok  (Tailscale/DERP/WAN issue):
#     level 1 -> `tailscale funnel reset` + restart
#     level 2 -> `tailscale down && tailscale up`
#     level 3 -> kill + relaunch Tailscale.app
#     level 4 -> Telegram alert — Tailscale recovery exhausted
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
HOST="cloud-constroad-s3.tail46a1b0.ts.net"
PORT=3001
PROBE_PATH="/health"
PUBLIC_RESOLVER="8.8.8.8"
LOG_FILE="/Users/jose/projects/lila-app/logs/tailscale-external-probe.log"
ENV_FILE="/Users/jose/projects/lila-app/.env"
STATE_DIR="/tmp"
LEVEL_FILE="${STATE_DIR}/tailscale-probe-level"
LAST_ALERT_FILE="${STATE_DIR}/tailscale-probe-last-alert"
DOWN_SINCE_FILE="${STATE_DIR}/tailscale-probe-down-since"
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
    local remaining=$(( ALERT_REPEAT_SECONDS - (now - last) ))
    log "Telegram alert deduped (próximo en ${remaining}s)"
    return 0
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

send_telegram_recovery() {
  local dur="$1" level="$2"
  load_env
  if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_ERRORS_CHAT_ID" ]; then
    return 0
  fi
  local http_code
  http_code=$(/usr/bin/curl -sS -o /dev/null -w '%{http_code}' \
    --max-time 5 \
    -d "chat_id=${TELEGRAM_ERRORS_CHAT_ID}" \
    --data-urlencode "text=✅ lila-app funnel RECUPERADO

Host: ${HOST}
Caída ~${dur} (escaló a nivel ${level}).
Estado ahora: $(diagnose)" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" 2>/dev/null || echo "000")
  log "Telegram recovery sent (HTTP $http_code)"
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

# ---- outage duration tracking ----------------------------------------------

mark_down() {
  # Records the start of an outage once; subsequent calls are no-ops until cleared.
  [ -r "$DOWN_SINCE_FILE" ] || date +%s > "$DOWN_SINCE_FILE"
}

clear_down() {
  rm -f "$DOWN_SINCE_FILE" 2>/dev/null || true
}

down_duration_human() {
  local since now secs
  if [ ! -r "$DOWN_SINCE_FILE" ]; then echo "desconocido"; return; fi
  since=$(cat "$DOWN_SINCE_FILE" 2>/dev/null || echo 0)
  now=$(date +%s)
  secs=$((now - since))
  echo "$((secs / 60))m $((secs % 60))s"
}

# ---- diagnostics -----------------------------------------------------------

diagnose() {
  # One-line summary of WHERE the path is broken, to tell apart the failure
  # modes: DNS/control-plane vs local app down vs WAN/DERP route down.
  local dns local_code local_app inet
  if [ -n "$(resolve_derp_ips)" ]; then dns="ok"; else dns="FAIL(no-A)"; fi
  local_code=$(/usr/bin/curl -sS -o /dev/null -w '%{http_code}' \
    --max-time 5 "http://127.0.0.1:${PORT}${PROBE_PATH}" 2>/dev/null || echo "000")
  if [[ "$local_code" =~ ^[23] ]]; then local_app="ok"; else local_app="FAIL($local_code)"; fi
  if /sbin/ping -c1 -t3 8.8.8.8 >/dev/null 2>&1; then inet="ok"; else inet="FAIL"; fi
  echo "dns=$dns local_app=$local_app internet=$inet"
}

# ---- probe -----------------------------------------------------------------

resolve_derp_ips() {
  /usr/bin/dig "@$PUBLIC_RESOLVER" +short +time=3 +tries=1 A "$HOST" 2>/dev/null | head -4
}

probe_external() {
  local ips ip http_code last_code
  PROBE_DETAIL=""
  ips=$(resolve_derp_ips)
  if [ -z "$ips" ]; then
    log "WARNING: public DNS ($PUBLIC_RESOLVER) returned no A records for $HOST"
    PROBE_DETAIL="dns=FAIL(no-A-records)"
    return 1
  fi
  last_code="000"
  while IFS= read -r ip; do
    [ -z "$ip" ] && continue
    http_code=$(/usr/bin/curl -sS -o /dev/null -w '%{http_code}' \
      --max-time "$PROBE_TIMEOUT" \
      --resolve "${HOST}:443:${ip}" \
      "https://${HOST}${PROBE_PATH}" 2>/dev/null || echo "000")
    last_code="$http_code"
    if [[ "$http_code" =~ ^[23] ]]; then
      return 0
    fi
  done <<< "$ips"
  PROBE_DETAIL="dns=ok funnel_https=FAIL(last_code=$last_code)"
  return 1
}

# ---- recovery actions — Tailscale/DERP path --------------------------------

action_funnel_reset() {
  log "ESCALATION 1 (Tailscale): 'tailscale funnel reset' + restart"
  "$TAILSCALE" funnel reset >> "$LOG_FILE" 2>&1 || true
  sleep 2
  "$TAILSCALE" funnel --bg "$PORT" >> "$LOG_FILE" 2>&1 || true
}

action_tailscale_down_up() {
  log "ESCALATION 2 (Tailscale): 'tailscale down && tailscale up'"
  "$TAILSCALE" down >> "$LOG_FILE" 2>&1 || true
  sleep 3
  "$TAILSCALE" up >> "$LOG_FILE" 2>&1 || true
  # Keep DNS decoupled from Tailscale: MagicDNS (100.100.100.100) flapping on
  # down/up was breaking the app's MongoDB SRV lookups (querySrv ECONNREFUSED).
  "$TAILSCALE" set --accept-dns=false >> "$LOG_FILE" 2>&1 || true
  sleep 5
  "$TAILSCALE" funnel --bg "$PORT" >> "$LOG_FILE" 2>&1 || true
}

action_relaunch_tailscale() {
  log "ESCALATION 3 (Tailscale): kill + relaunch Tailscale.app"
  /usr/bin/pkill -x Tailscale 2>/dev/null || true
  sleep 3
  /usr/bin/open -a Tailscale 2>/dev/null || true
  sleep 8
  "$TAILSCALE" funnel --bg "$PORT" >> "$LOG_FILE" 2>&1 || true
}

action_alert_tailscale() {
  local diag="$1"
  log "ESCALATION 4 (Tailscale): sending Telegram alert"
  send_telegram_alert "🚨 lila-app funnel DOWN (problema Tailscale/DERP)

Host: ${HOST}
Auto-recovery exhausted (funnel reset → down/up → relaunch).
Manual intervention required.

Diagnóstico: ${diag}
(local_app=ok + internet=ok ⟹ ruta WAN/DERP caída, no es la app)

Check:
- tailscale funnel status
- dig +short ${HOST} @${PUBLIC_RESOLVER}
- ${LOG_FILE}"
}

# ---- recovery actions — lila-app down path ---------------------------------

action_restart_lila_app() {
  local attempt="$1"
  log "ESCALATION ${attempt} (app down): launchctl stop+start com.lila.app"
  /bin/launchctl stop com.lila.app 2>/dev/null || true
  sleep 4
  /bin/launchctl start com.lila.app 2>/dev/null || true
}

action_alert_app_down() {
  local diag="$1"
  log "ESCALATION (app down): sending Telegram alert"
  send_telegram_alert "🚨 lila-app DOWN (app caída / crash-loop)

Host: ${HOST}
Auto-restart vía launchctl fallido (2 intentos).
Intervención manual requerida.

Diagnóstico: ${diag}
(local_app=FAIL ⟹ la app no responde en 127.0.0.1:${PORT})

Check:
- launchctl list | grep lila
- launchctl stop com.lila.app && launchctl start com.lila.app
- tail -50 ${LOG_FILE%/*}/lila-app.log"
}

# ---- escalation router — branches by failure mode --------------------------

run_escalation_step() {
  local level="$1" diag="$2"

  if [[ "$diag" =~ "local_app=FAIL" ]]; then
    # lila-app is down — Tailscale escalations are useless here
    case "$level" in
      1|2) action_restart_lila_app "$level" ;;
      3|*) action_alert_app_down "$diag" ;;
    esac
  else
    # Tailscale/DERP/WAN issue
    case "$level" in
      1) action_funnel_reset ;;
      2) action_tailscale_down_up ;;
      3) action_relaunch_tailscale ;;
      4|*) action_alert_tailscale "$diag" ;;
    esac
  fi
}

# ---- main loop -------------------------------------------------------------

initial_level=$(get_level)
log "=== External probe starting (host=$HOST resolver=$PUBLIC_RESOLVER interval=${CHECK_INTERVAL}s threshold=$FAIL_THRESHOLD level=$initial_level) ==="

fail_count=0
last_diag=""
while true; do
  if probe_external; then
    level=$(get_level)
    if [ "$fail_count" -gt 0 ] || [ "$level" -gt 0 ]; then
      dur=$(down_duration_human)
      log "Recovered after $fail_count failed probe(s) (was at escalation level $level, down ~$dur)"
      # Only notify recovery if we had actually alerted (reached level 3+ for app, 4 for Tailscale).
      if [ "$level" -ge 3 ]; then
        send_telegram_recovery "$dur" "$level"
      fi
      set_level 0
      rm -f "$LAST_ALERT_FILE" 2>/dev/null || true
      clear_down
      last_diag=""
    fi
    fail_count=0
  else
    fail_count=$((fail_count + 1))
    mark_down
    log "External probe FAILED ($fail_count/$FAIL_THRESHOLD) [${PROBE_DETAIL:-}]"
    if [ "$fail_count" -eq 1 ]; then
      last_diag=$(diagnose)
      log "Diagnosis: $last_diag"
    fi
    if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
      # Re-diagnose at escalation time (state may have changed since first failure)
      last_diag=$(diagnose)
      log "Re-diagnosis at escalation: $last_diag"
      level=$(get_level)
      next_level=$((level + 1))
      [ "$next_level" -gt 4 ] && next_level=4
      set_level "$next_level"
      run_escalation_step "$next_level" "$last_diag"
      fail_count=0
      sleep "$POST_ACTION_COOLDOWN"
    fi
  fi
  sleep "$CHECK_INTERVAL"
done
