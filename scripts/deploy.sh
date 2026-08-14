#!/bin/bash
# Deploy con releases inmutables y rollback. Estilo capistrano.
#
#   ./deploy.sh <app> [sha]     deploya (HEAD del branch si no se pasa sha)
#   ./deploy.sh <app> --rollback   vuelve a la release anterior, SIN rebuild
#   ./deploy.sh <app> --list       lista las releases
#
# POR QUÉ EXISTE (F1 del spec TORRE): hoy deployar es correr `npm run build` a
# mano sobre el árbol de trabajo. Eso tiene dos problemas graves:
#   1. Si el build falla a mitad, producción queda con un árbol inconsistente.
#      Ya pasó en esta máquina: un build de Portal murió por OOM.
#   2. No hay vuelta atrás. Para volver a la versión anterior hay que hacer
#      checkout del commit viejo y rebuildear — minutos, con el sitio roto.
#
# LA PROPIEDAD CENTRAL: se compila en un directorio NUEVO y el symlink `current`
# se mueve SOLO si el build terminó bien. Un build fallido no toca producción.
# El rollback es mover el symlink de vuelta: segundos, sin compilar nada.
#
# Y LA QUE MÁS VALE: tras reiniciar se chequea la salud, y si no responde se
# vuelve solo a la release anterior. Un deploy malo se auto-revierte en ~1 min
# en lugar de quedar caído hasta que alguien mire.
set -uo pipefail

APP="${1:-}"
ARG="${2:-}"

# Config DECLARATIVA y versionada, nunca armada desde input externo — invariante
# de seguridad §5.4 del spec (los CVEs de Coolify fueron "campo de UI → shell").
case "$APP" in
  lila)
    REPO_DIR=/Users/jose/projects/lila-app
    BRANCH=main
    # `--include=dev` EXPLÍCITO, y no es redundante (incidente 2026-08-14):
    # `npm ci` omite las devDependencies cuando NODE_ENV=production está en el
    # entorno. Torre corre como LaunchDaemon con NODE_ENV=production en su plist,
    # y esa variable se HEREDA al proceso del deploy. Resultado: el mismo comando
    # funcionaba corriéndolo a mano y fallaba disparado por el webhook, con
    # "Cannot find package 'esbuild'" — que es devDependency y hace el build.
    # El peor tipo de bug: depende de quién lo invoca, no de lo que hace.
    BUILD_CMD="npm ci --include=dev --no-audit --no-fund && npm run build"
    # Artefacto que PRUEBA que el build sirvió. Ver el bloque de verificación.
    ARTEFACTO=dist/index.js
    SERVICE=com.constroad.lila
    HEALTH_URL=http://127.0.0.1:3001/health
    SHARED_FILES=(.env)
    ;;
  portal)
    REPO_DIR=/Users/jose/projects/Portal
    BRANCH=main
    BUILD_CMD="npm ci --include=dev --no-audit --no-fund && npm run build"
    # BUILD_ID solo existe si `next build` llegó al final. `.next` a secas no
    # sirve: se crea al empezar y queda a medias si el build muere en el medio.
    ARTEFACTO=.next/BUILD_ID
    # El build de Portal necesita ~6 GB; con el default de Node muere por OOM y
    # —peor— sale con 0. Va como variable EXPORTADA y no como prefijo del comando:
    # `VAR=x cmd1 && cmd2` solo se la pasa a cmd1, así que el prefijo llegaba al
    # `npm ci` y no al `npm run build`, que es el que la necesita.
    NODE_OPTIONS_BUILD="--max-old-space-size=6144"
    SERVICE=com.constroad.portal
    HEALTH_URL=http://127.0.0.1:3002/
    SHARED_FILES=(.env.local)
    ;;
  *)
    echo "Uso: $0 {lila|portal} [sha|--rollback|--list]"; exit 1 ;;
esac

BASE=/Users/jose/deploys/$APP
RELEASES=$BASE/releases
SHARED=$BASE/shared
CURRENT=$BASE/current
LOG=$BASE/deploy.log
LOCK=/tmp/constroad-deploy-$APP.lock
CONSERVAR=5

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
fatal() { log "✗ $*"; exit 1; }

mkdir -p "$RELEASES" "$SHARED" "$(dirname "$LOG")"

# Serializar: dos deploys simultáneos de la misma app se pisarían el symlink.
exec 9>"$LOCK"
flock -n 9 2>/dev/null || {
  # macOS no trae flock; se emula con un directorio, que es atómico.
  if ! mkdir "$LOCK.d" 2>/dev/null; then
    fatal "Ya hay un deploy de $APP en curso (si no es cierto: rm -rf $LOCK.d)"
  fi
  trap 'rmdir "$LOCK.d" 2>/dev/null' EXIT
}

listar() {
  echo "Releases de $APP (actual marcada con →):"
  local actual; actual=$(readlink "$CURRENT" 2>/dev/null | xargs basename 2>/dev/null)
  for r in $(ls -1 "$RELEASES" 2>/dev/null | sort -r); do
    [ "$r" = "$actual" ] && echo "  → $r" || echo "    $r"
  done
}

salud_ok() {
  local i
  for i in $(seq 1 20); do
    local code
    code=$(/usr/bin/curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null)
    [[ "$code" =~ ^[23] ]] && return 0
    sleep 3
  done
  return 1
}

activar() {   # $1 = ruta de la release a activar
  # SWAP ATÓMICO, y en macOS cuesta más de lo que parece:
  #   · `mv -T` (la forma GNU) NO existe en BSD/macOS — probado, falla.
  #   · `mv -f tmp current` con `current` apuntando a un DIRECTORIO mueve el
  #     symlink DENTRO del directorio en vez de reemplazarlo.
  #   · `rm current && ln -sfn` funciona pero deja una ventana —milisegundos— en
  #     la que `current` no existe. Si el servicio arranca justo ahí, no encuentra
  #     nada.
  # `os.rename` de Python es `rename(2)` puro: reemplaza en una sola operación
  # atómica y no tiene ninguno de esos problemas.
  ln -sfn "$1" "$CURRENT.tmp" || return 1
  /usr/bin/python3 -c 'import os,sys; os.rename(sys.argv[1], sys.argv[2])' \
    "$CURRENT.tmp" "$CURRENT" || { rm -f "$CURRENT.tmp"; return 1; }
  log "current → $(basename "$1")"
  # kickstart necesita root porque son LaunchDaemons; sin sudo se avisa y sigue.
  if sudo -n launchctl kickstart -k "system/$SERVICE" 2>/dev/null; then
    log "Servicio $SERVICE reiniciado"
  else
    log "⚠️  No pude reiniciar $SERVICE (necesita sudo). Corré:"
    log "    sudo launchctl kickstart -k system/$SERVICE"
    return 2
  fi
}

case "$ARG" in
  --list) listar; exit 0 ;;
  --rollback)
    actual=$(readlink "$CURRENT" 2>/dev/null | xargs basename 2>/dev/null)
    anterior=$(ls -1 "$RELEASES" | sort -r | grep -v "^${actual}$" | head -1)
    [ -z "$anterior" ] && fatal "No hay release anterior a la que volver"
    log "ROLLBACK: $actual → $anterior (sin rebuild)"
    activar "$RELEASES/$anterior"
    salud_ok && log "✓ Rollback OK, $APP responde" || log "⚠️  $APP no responde tras el rollback"
    exit 0 ;;
esac

# ---- deploy -----------------------------------------------------------------
SHA="${ARG:-}"
cd "$REPO_DIR" || fatal "No existe $REPO_DIR"
git fetch origin "$BRANCH" --quiet || fatal "git fetch falló"
[ -z "$SHA" ] && SHA=$(git rev-parse "origin/$BRANCH")
SHORT=$(git rev-parse --short "$SHA") || fatal "SHA inválido: $SHA"

NOMBRE="$(date '+%Y%m%d-%H%M%S')-$SHORT"
DEST="$RELEASES/$NOMBRE"
log "=== Deploy de $APP · $SHORT → $NOMBRE ==="

# Checkout limpio del SHA en la release nueva. `git worktree` no: dejaría la
# release atada al repo y un `git gc` podría romperla. Un archive es autónomo.
mkdir -p "$DEST" || fatal "No pude crear $DEST"
git archive "$SHA" | tar -x -C "$DEST" || fatal "No pude extraer el SHA"

# Los archivos compartidos (secretos) viven FUERA de las releases y se enlazan.
# Así rotar un secreto no obliga a rebuildear, y las releases no los duplican.
for f in "${SHARED_FILES[@]}"; do
  if [ ! -f "$SHARED/$f" ]; then
    [ -f "$REPO_DIR/$f" ] && cp "$REPO_DIR/$f" "$SHARED/$f" && chmod 600 "$SHARED/$f" \
      && log "Primer deploy: $f copiado a shared/"
  fi
  [ -f "$SHARED/$f" ] && ln -sfn "$SHARED/$f" "$DEST/$f"
done

log "Compilando…"
(
  cd "$DEST" || exit 1
  [ -n "${NODE_OPTIONS_BUILD:-}" ] && export NODE_OPTIONS="$NODE_OPTIONS_BUILD"
  eval "$BUILD_CMD"
) >> "$LOG" 2>&1
rc_build=$?

# NO ALCANZA CON EL CÓDIGO DE SALIDA (incidente 2026-08-14): el build de Portal
# crasheó por falta de memoria —stack trace de V8 en el log— y `npm run build`
# igual salió con 0. Next se comió el crash de un worker de generación estática y
# terminó "bien" sin producir `.next`. El script activó una release SIN BUILD.
#
# Con los plists ya apuntando a `current`, eso habría tumbado Portal: launchd
# arrancando un Next sin build, en crash-loop, con KeepAlive reintentando para
# siempre. Es la misma lección que el `tail` que enmascaró el exit code de npm:
# **verificar el artefacto, no el código de salida.** El artefacto no miente.
if [ $rc_build -ne 0 ] || [ ! -e "$DEST/$ARTEFACTO" ]; then
  if [ $rc_build -eq 0 ]; then
    log "✗ BUILD MINTIÓ: salió con 0 pero NO generó $ARTEFACTO"
  else
    log "✗ BUILD FALLÓ (código $rc_build)"
  fi
  log "  Producción NO se tocó (sigue en $(readlink "$CURRENT" 2>/dev/null | xargs basename 2>/dev/null || echo 'sin release'))"
  rm -rf "$DEST"
  exit 1
fi
log "Build OK · artefacto verificado: $ARTEFACTO"

ANTERIOR=$(readlink "$CURRENT" 2>/dev/null)
activar "$DEST"; rc=$?
[ $rc -eq 2 ] && { log "Deploy dejado en su lugar; falta el reinicio manual"; exit 0; }

if salud_ok; then
  log "✓ Deploy OK — $APP responde en $HEALTH_URL"
else
  log "✗ $APP NO responde tras el deploy"
  if [ -n "$ANTERIOR" ] && [ -d "$ANTERIOR" ]; then
    log "AUTO-ROLLBACK a $(basename "$ANTERIOR")"
    activar "$ANTERIOR"
    salud_ok && log "✓ Rollback OK: producción restaurada" || log "🚨 Ni la release anterior responde — revisar a mano"
  else
    log "🚨 No hay release anterior para volver"
  fi
  exit 1
fi

# Retención: las viejas se borran DESPUÉS de confirmar que la nueva anda.
ls -1 "$RELEASES" | sort -r | tail -n +$((CONSERVAR + 1)) | while read -r vieja; do
  rm -rf "${RELEASES:?}/$vieja" && log "Release vieja eliminada: $vieja"
done

log "=== Fin ==="
