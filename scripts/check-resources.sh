#!/bin/bash
# Vigilancia de recursos de la Mac mini + detección de compromiso.
#
# DOS PROPÓSITOS EN UNO:
#   1. Salud operativa: CPU/RAM/disco saturados degradan lila (un request lento
#      bloquea el event loop y el bot deja de responder — ver
#      PERFORMANCE-SCALABILITY.SPEC).
#   2. DETECCIÓN DE COMPROMISO: el síntoma clásico de un servidor secuestrado
#      para minar cripto es CPU al techo de forma SOSTENIDA. Por eso no se alerta
#      por un pico —un PDF pesado o un transcode legítimo saturan un rato— sino
#      por CPU alta MANTENIDA durante varios minutos, que es lo que distingue
#      "trabajando duro" de "alguien está minando con tu máquina".
#
# También busca procesos de minería por nombre y conexiones a pools conocidos:
# barato, y cubre el caso obvio antes de que el promedio de CPU lo delate.
#
# CALLA si todo está bien. Un chequeo que saluda a diario entrena a ignorarlo.

set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/backup-common.sh"

LOG_FILE="${RESOURCES_LOG_FILE:-${BACKUP_LOG_DIR}/check-resources.log}"
STATE_DIR="${BACKUP_CONFIG_DIR}"

CPU_UMBRAL="${RES_CPU_UMBRAL:-85}"        # % de uso total
RAM_UMBRAL="${RES_RAM_UMBRAL:-90}"        # % de presión de memoria
DISCO_UMBRAL="${RES_DISCO_UMBRAL:-85}"    # % usado del disco del sistema
MUESTRAS="${RES_MUESTRAS:-5}"             # lecturas consecutivas...
INTERVALO="${RES_INTERVALO:-20}"          # ...cada N segundos

PROBLEMAS=()

# ---- CPU sostenida ---------------------------------------------------------

# Un pico NO es un problema: Puppeteer, ffmpeg o un export legítimo saturan la
# máquina un rato. Lo que delata a un minero es que NO baja.
cpu_sostenida() {
  local total=0 i uso altas=0
  for ((i = 1; i <= MUESTRAS; i++)); do
    # `top -l 2` descarta la primera muestra, que siempre viene sesgada.
    uso=$(top -l 2 -n 0 -s 1 2>/dev/null | awk '/CPU usage/{u=$3+$5} END{printf "%.0f", u}')
    [ -z "$uso" ] && uso=0
    total=$((total + uso))
    [ "$uso" -ge "$CPU_UMBRAL" ] && altas=$((altas + 1))
    backup_log "  muestra ${i}/${MUESTRAS}: CPU ${uso}%"
    [ "$i" -lt "$MUESTRAS" ] && sleep "$INTERVALO"
  done
  CPU_PROMEDIO=$((total / MUESTRAS))
  CPU_ALTAS=$altas
}

# ---- señales de minería ----------------------------------------------------

buscar_mineros() {
  local sospechosos
  # Nombres de mineros conocidos (xmrig es el más usado en compromisos de
  # servidores; kdevtmpfsi/kinsing son el par típico de los kits de Docker).
  sospechosos=$(ps aux 2>/dev/null \
    | grep -iE "xmrig|minerd|cpuminer|ethminer|nicehash|cryptonight|stratum|kdevtmpfsi|kinsing|xmr-stak" \
    | grep -v grep | awk '{print $2" "$11}' | head -5)
  [ -n "$sospechosos" ] && PROBLEMAS+=("🚨 PROCESO DE MINERÍA DETECTADO:
${sospechosos}")

  # Conexiones a puertos típicos de pools de minería.
  local conexiones
  conexiones=$(lsof -iTCP -sTCP:ESTABLISHED -P -n 2>/dev/null \
    | grep -E ":(3333|4444|5555|7777|8888|9999|14444|45700)$|stratum" \
    | awk '{print $1" → "$9}' | head -5)
  [ -n "$conexiones" ] && PROBLEMAS+=("🚨 CONEXIÓN A POOL DE MINERÍA (puerto típico):
${conexiones}")
}

# ---- main ------------------------------------------------------------------

main() {
  mkdir -p "$(dirname "$LOG_FILE")" "$STATE_DIR"
  backup_log "=== Chequeo de recursos ==="

  buscar_mineros

  cpu_sostenida
  backup_log "CPU: promedio ${CPU_PROMEDIO}%, ${CPU_ALTAS}/${MUESTRAS} muestras sobre ${CPU_UMBRAL}%"

  # Solo alerta si la MAYORÍA de las muestras están altas: eso es carga
  # sostenida, no un pico de trabajo legítimo.
  if [ "$CPU_ALTAS" -gt $((MUESTRAS / 2)) ]; then
    local top3
    top3=$(ps aux | sort -rk3 | head -4 | tail -3 | awk '{printf "  %s%% %s\n", $3, substr($11,1,48)}')
    PROBLEMAS+=("⚠️ CPU SOSTENIDA: promedio ${CPU_PROMEDIO}% (${CPU_ALTAS}/${MUESTRAS} muestras sobre ${CPU_UMBRAL}%)

Procesos que más consumen:
${top3}

Si no reconocés el proceso de arriba, puede ser un compromiso del servidor.")
  fi

  # -- memoria --
  local libre_pct
  libre_pct=$(memory_pressure 2>/dev/null | grep -oE "System-wide memory free percentage: [0-9]+" | grep -oE "[0-9]+$")
  if [ -n "$libre_pct" ]; then
    local usada=$((100 - libre_pct))
    backup_log "Memoria: ${usada}% usada"
    [ "$usada" -ge "$RAM_UMBRAL" ] && PROBLEMAS+=("⚠️ MEMORIA al ${usada}% (umbral ${RAM_UMBRAL}%).
Con 8 GB, Puppeteer + ffmpeg + lila compiten; el swap degrada todo.")
  fi

  # -- disco del sistema --
  local disco_pct
  disco_pct=$(df -h / 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%')
  if [ -n "$disco_pct" ]; then
    backup_log "Disco del sistema: ${disco_pct}% usado"
    [ "$disco_pct" -ge "$DISCO_UMBRAL" ] && PROBLEMAS+=("⚠️ DISCO DEL SISTEMA al ${disco_pct}% (umbral ${DISCO_UMBRAL}%).
Sin espacio, lila no puede escribir medios ni logs.")
  fi

  if [ ${#PROBLEMAS[@]} -eq 0 ]; then
    backup_log "=== Todo en orden ==="
    exit 0
  fi

  local detalle
  detalle=$(printf '%s\n\n' "${PROBLEMAS[@]}")
  backup_notify "🖥️ RECURSOS — atención requerida

${detalle}Revisar:  ps aux | sort -rk3 | head"
  backup_log "=== ${#PROBLEMAS[@]} problema(s) notificados ==="
}

main "$@"
