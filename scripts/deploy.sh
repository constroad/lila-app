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
    # MEDIDO: lila tarda ~85 s en responder. Abre el puerto AL FINAL, después de
    # conectar Mongo y restaurar las sesiones de WhatsApp. Con el default de 60 s
    # el health check daba por muerto un deploy sano y disparaba un auto-rollback
    # innecesario — que además "fallaba" también, por la misma razón, y dejaba el
    # log gritando que ni la release anterior servía. 240 s dan margen para un día
    # con más sesiones o Mongo lento.
    SALUD_TIMEOUT=240
    SHARED_FILES=(.env)
    ;;
  portal)
    REPO_DIR=/Users/jose/projects/Portal
    BRANCH=main
    BUILD_CMD="npm ci --include=dev --no-audit --no-fund && npm run build"
    # BUILD_ID solo existe si `next build` llegó al final. `.next` a secas no
    # sirve: se crea al empezar y queda a medias si el build muere en el medio.
    ARTEFACTO=.next/BUILD_ID
    # MEDIDO (14/08/2026), no estimado: el build pico en **2.260 MB** y el heap
    # por defecto de Node EN ESTA MÁQUINA es **2.096 MB**. Se pasa por 164 MB.
    #
    # Node deriva ese default de la RAM del sistema: 8 GB → ~2 GB de heap; en una
    # máquina de 16 GB daría ~4 GB y el MISMO build pasaría sin bandera. Por eso
    # "en mi máquina compila bien" es literalmente cierto y no había nada roto.
    #
    # 3072 y no 6144: el primer intento fue una sobrecorrección: 6 GB en una
    # máquina de 8 GB compite con lila, Portal y Torre, y puede empujar a swap
    # justo mientras se sirve tráfico. 3 GB dan 35% de margen sobre el pico real.
    #
    # Va EXPORTADA y no como prefijo: `VAR=x cmd1 && cmd2` solo se la pasa a cmd1,
    # así que llegaba al `npm ci` en vez del `npm run build`, que la necesita.
    NODE_OPTIONS_BUILD="--max-old-space-size=3072"
    SERVICE=com.constroad.portal
    HEALTH_URL=http://127.0.0.1:3002/
    # Portal arranca en segundos: `next start` sirve apenas bindea.
    SALUD_TIMEOUT=90
    SHARED_FILES=(.env.local)
    ;;
  torre)
    REPO_DIR=/Users/jose/projects/torre
    BRANCH=main
    BUILD_CMD="npm ci --include=dev --no-audit --no-fund && npm run build"
    ARTEFACTO=.next/BUILD_ID
    SERVICE=com.constroad.torre
    # `/api/health` y NO `/`: la raíz está detrás del Basic Auth del middleware y
    # devuelve 401, que el chequeo leería como "no arrancó" y dispararía un
    # auto-rollback de un deploy sano. `/api/health` está exento a propósito.
    HEALTH_URL=http://127.0.0.1:4000/api/health
    SALUD_TIMEOUT=90
    # Torre lee TORRE_USER/TORRE_PASSWORD desde `middleware.ts`, que corre en el
    # runtime Edge: ahí Next **inlinea** las env vars al COMPILAR, no al arrancar.
    # Por eso este archivo tiene que estar enlazado antes del build —lo está, el
    # enlace de shared files pasa unas líneas antes que `eval "$BUILD_CMD"`—. Si
    # se invirtiera ese orden, el middleware compilaría con las credenciales en
    # `undefined` y el fail-closed devolvería 503 a todo el panel.
    SHARED_FILES=(.env.local)
    # ATENCIÓN — TORRE SE DEPLOYA A SÍ MISMA: este script reinicia el servicio que
    # muy posiblemente lo lanzó. Por eso el webhook rechaza `torre` con 409 y esto
    # se corre A MANO desde una terminal, donde el padre es la shell y no el
    # proceso que se reinicia. El riesgo que se evita no es la molestia de perder
    # el stream de logs: es que launchd se lleve el script a mitad de camino y
    # deje `current` apuntando a una release que nadie llegó a verificar, sin el
    # rollback automático que justamente cubre ese caso.
    ;;
  *)
    echo "Uso: $0 {lila|portal|torre} [sha|--rollback|--list]"; exit 1 ;;
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

# Historial en JSONL, una línea por deploy (spec §5.5). Es lo que alimenta la
# página de Deployments de Torre.
#
# SE ESCRIBE TAMBIÉN EN LOS FALLOS, a propósito: un historial que solo guarda los
# éxitos miente sobre la salud del pipeline, y es justo lo que uno va a mirar
# cuando algo anda mal. Ver un `fallo-build` de hace 3 minutos explica en un
# vistazo por qué producción sigue en la versión vieja.
#
# `>>` sobre un archivo de texto es atómico para líneas cortas en un solo write,
# así que dos deploys simultáneos de apps distintas no se corrompen entre sí.
HISTORIAL=/Users/jose/deploys/deploys.jsonl
registrar() {   # $1 = resultado, $2 = duración en segundos
  printf '{"ts":%s,"app":"%s","sha":"%s","release":"%s","resultado":"%s","duracionSeg":%s}\n' \
    "$(date +%s)000" "$APP" "${SHA:-}" "${NOMBRE:-}" "$1" "${2:-0}" >> "$HISTORIAL" 2>/dev/null || true
}

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

# El timeout es POR APP y no un número global: lo que tarda cada una en estar
# lista varía en un orden de magnitud, y un valor único obliga a elegir entre
# rollbacks falsos (si es corto) o tardar una eternidad en detectar una caída
# real (si es largo).
salud_ok() {
  local esperado=${SALUD_TIMEOUT:-90} transcurrido=0 code
  while [ $transcurrido -lt $esperado ]; do
    code=$(/usr/bin/curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null)
    if [[ "$code" =~ ^[23] ]]; then
      [ $transcurrido -gt 0 ] && log "  (respondió tras ${transcurrido}s)"
      return 0
    fi
    sleep 3; transcurrido=$((transcurrido + 3))
  done
  log "  (sin respuesta tras ${esperado}s)"
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
    PEDIDA="${3:-}"
    if [ -n "$PEDIDA" ]; then
      # DESTINO EXPLÍCITO — llega desde la UI de Torre, así que se valida como
      # entrada hostil aunque venga de un panel con contraseña:
      #   1. Formato estricto: <fecha>-<hora>-<sha>. Nada de `..` ni `/`.
      #   2. Tiene que EXISTIR como directorio en releases/. No se concatena una
      #      ruta con lo que llegó: se comprueba contra lo que hay en disco.
      # Sin el paso 2, un nombre con formato válido pero inexistente dejaría el
      # symlink apuntando a la nada y el servicio en crash-loop.
      case "$PEDIDA" in
        *[!a-zA-Z0-9-]*|*..*) fatal "Nombre de release inválido: $PEDIDA" ;;
      esac
      [ -d "$RELEASES/$PEDIDA" ] || fatal "La release $PEDIDA no existe en disco"
      [ "$PEDIDA" = "$actual" ] && fatal "La release $PEDIDA ya es la activa"
      anterior="$PEDIDA"
    else
      anterior=$(ls -1 "$RELEASES" | sort -r | grep -v "^${actual}$" | head -1)
    fi
    [ -z "$anterior" ] && fatal "No hay release anterior a la que volver"
    log "ROLLBACK: $actual → $anterior (sin rebuild)"
    activar "$RELEASES/$anterior"
    if salud_ok; then
      log "✓ Rollback OK, $APP responde"
      SHA=""; NOMBRE="$anterior"; registrar rollback 0
    else
      log "⚠️  $APP no responde tras el rollback"
      SHA=""; NOMBRE="$anterior"; registrar fallo-salud 0
    fi
    exit 0 ;;
esac

# ---- deploy -----------------------------------------------------------------
SHA="${ARG:-}"
cd "$REPO_DIR" || fatal "No existe $REPO_DIR"
git fetch origin "$BRANCH" --quiet || fatal "git fetch falló"
[ -z "$SHA" ] && SHA=$(git rev-parse "origin/$BRANCH")
SHORT=$(git rev-parse --short "$SHA") || fatal "SHA inválido: $SHA"

INICIO=$(date +%s)
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
  registrar fallo-build "$(( $(date +%s) - INICIO ))"
  exit 1
fi
log "Build OK · artefacto verificado: $ARTEFACTO"

# PODA DE LA CACHÉ DE BUILD. Medido: `.next` pesa 2,04 GB por release, de los
# cuales **2,0 GB son `cache/webpack`** — caché de compilación incremental que en
# una release INMUTABLE no se reutiliza jamás (cada deploy compila en un
# directorio nuevo). Lo que sirve producción son 74 MB.
#
# Sin podar, 5 releases ocupan 10,2 GB; podando, 370 MB. Y `next start` no la
# necesita: la caché del optimizador de imágenes se regenera sola en runtime.
if [ -d "$DEST/.next/cache" ]; then
  antes=$(du -sk "$DEST/.next" | cut -f1)
  rm -rf "$DEST/.next/cache"
  despues=$(du -sk "$DEST/.next" | cut -f1)
  log "Caché de build podada: $((antes/1024)) MB → $((despues/1024)) MB"
fi

# CONSERVAR LOS ASSETS DE LA RELEASE ANTERIOR (skew de despliegue).
#
# EL PROBLEMA, medido el 14/08/2026 con el primer deploy de torre: los chunks de
# Next llevan un hash en el nombre, y los del runtime —`webpack-*`, `main-app-*`,
# `layout-*`— cambian de nombre en CUALQUIER build que toque algo. La pestaña que
# alguien ya tenía abierta sigue pidiendo los nombres viejos; tras el swap esos
# archivos ya no existen, dan 404, React no llega a arrancar y el usuario ve
# "Application error: a client-side exception has occurred". La página no está
# rota: le falta el JS con el que se cargó.
#
# POR QUÉ IMPORTA MÁS DE LO QUE PARECE: no es una molestia de quien deploya. Cada
# deploy de Portal rompe la pestaña de todos los que estén con la app abierta en
# ese momento, y se reporta como "se cayó la página" sin nada en los logs del
# servidor —que responde 200 a todo— para explicarlo.
#
# LA SOLUCIÓN: unir los estáticos de la release anterior a los de la nueva. Los
# nombres llevan hash de contenido, así que nunca colisionan con contenido
# distinto y la unión no puede pisar nada; `-n` lo garantiza igual. Cuesta unos
# pocos MB por release y hace que las pestañas viejas sigan funcionando hasta que
# se recarguen solas. Es lo mismo que hace la "skew protection" de Vercel.
#
# ALCANCE HONESTO: cubre una generación. Dos deploys seguidos y la pestaña que
# venía de antes se rompe igual — para eso está el aviso de recargar.
PREVIA=$(readlink "$CURRENT" 2>/dev/null)
if [ -n "$PREVIA" ] && [ -d "$PREVIA/.next/static" ] && [ -d "$DEST/.next/static" ]; then
  cp -Rn "$PREVIA/.next/static/." "$DEST/.next/static/" 2>/dev/null || true
  log "Assets de la release anterior conservados (pestañas abiertas siguen andando)"
fi

ANTERIOR=$(readlink "$CURRENT" 2>/dev/null)
activar "$DEST"; rc=$?
[ $rc -eq 2 ] && { log "Deploy dejado en su lugar; falta el reinicio manual"; exit 0; }

if salud_ok; then
  log "✓ Deploy OK — $APP responde en $HEALTH_URL"
  registrar ok "$(( $(date +%s) - INICIO ))"
else
  log "✗ $APP NO responde tras el deploy"
  if [ -n "$ANTERIOR" ] && [ -d "$ANTERIOR" ]; then
    log "AUTO-ROLLBACK a $(basename "$ANTERIOR")"
    activar "$ANTERIOR"
    salud_ok && log "✓ Rollback OK: producción restaurada" || log "🚨 Ni la release anterior responde — revisar a mano"
    registrar fallo-salud "$(( $(date +%s) - INICIO ))"
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
