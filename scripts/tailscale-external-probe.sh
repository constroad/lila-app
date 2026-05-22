#!/bin/bash
# Tailscale Funnel External Probe
#
# Validates that the funnel is reachable from the PUBLIC path (not just locally
# via MagicDNS). It resolves the hostname through a public resolver (8.8.8.8)
# and forces curl to connect to those DERP IPs, simulating an external client.
# After N consecutive failures it runs `tailscale funnel reset` + restart,
# which is the only thing that helps when the listener is actually dead.
#
# Companion to tailscale-funnel-watchdog.sh:
#   - watchdog       -> checks LOCAL `tailscale funnel status` every 30s
#   - external-probe -> checks REAL external reachability every 60s
# Both run as independent LaunchAgents.

set -u

TAILSCALE="/usr/local/bin/tailscale"
HOST="joses-mac-mini.tail46a1b0.ts.net"
PORT=3001
PROBE_PATH="/health"
PUBLIC_RESOLVER="8.8.8.8"
LOG_FILE="/Users/jose/projects/lila-app/logs/tailscale-external-probe.log"
CHECK_INTERVAL=60       # seconds between probes
PROBE_TIMEOUT=10        # per-curl timeout
FAIL_THRESHOLD=3        # consecutive failures before reset

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Resolve the funnel hostname via a public resolver to get the DERP IPs.
# Returns up to 4 IPs (the typical fanout) on stdout, one per line.
resolve_derp_ips() {
  /usr/bin/dig "@$PUBLIC_RESOLVER" +short +time=3 +tries=1 A "$HOST" 2>/dev/null | head -4
}

# Probe the funnel by forcing curl to connect to each DERP IP in turn.
# Success if ANY IP responds with HTTP 2xx/3xx on PROBE_PATH.
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

reset_funnel() {
  log "Running 'tailscale funnel reset' + restart..."
  "$TAILSCALE" funnel reset >> "$LOG_FILE" 2>&1 || true
  sleep 2
  if "$TAILSCALE" funnel --bg "$PORT" >> "$LOG_FILE" 2>&1; then
    log "Funnel restarted via --bg $PORT"
  else
    log "ERROR: funnel restart failed; watchdog will pick it up on next cycle"
  fi
}

log "=== External probe starting (host=$HOST resolver=$PUBLIC_RESOLVER interval=${CHECK_INTERVAL}s threshold=$FAIL_THRESHOLD) ==="

fail_count=0
while true; do
  if probe_external; then
    if [ "$fail_count" -gt 0 ]; then
      log "Recovered after $fail_count failed probe(s)"
    fi
    fail_count=0
  else
    fail_count=$((fail_count + 1))
    log "External probe FAILED ($fail_count/$FAIL_THRESHOLD)"
    if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
      reset_funnel
      # Give the daemon a moment to re-register before resuming the loop.
      sleep 10
      fail_count=0
    fi
  fi
  sleep "$CHECK_INTERVAL"
done
