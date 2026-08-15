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
    # Copia de trabajo, no mirror: acá también se programa. Si el directorio
    # desapareciera, el bootstrap la reclona como mirror — sirve para deployar,
    # pero habría que rehacer el clon normal para volver a trabajar ahí.
    REPO_URL=git@github.com:constroad/lila-app.git
    BRANCH=main
    # `--include=dev` EXPLÍCITO, y no es redundante (incidente 2026-08-14):
    # `npm ci` omite las devDependencies cuando NODE_ENV=production está en el
    # entorno. Torre corre como LaunchDaemon con NODE_ENV=production en su plist,
    # y esa variable se HEREDA al proceso del deploy. Resultado: el mismo comando
    # funcionaba corriéndolo a mano y fallaba disparado por el webhook, con
    # "Cannot find package 'esbuild'" — que es devDependency y hace el build.
    # El peor tipo de bug: depende de quién lo invoca, no de lo que hace.
    INSTALL_CMD="npm ci --include=dev --no-audit --no-fund"
    COMPILE_CMD="npm run build"
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
    # Copia de trabajo, no mirror: acá también se programa. Si el directorio
    # desapareciera, el bootstrap la reclona como mirror — sirve para deployar,
    # pero habría que rehacer el clon normal para volver a trabajar ahí.
    REPO_URL=git@github.com:constroad/Portal.git
    BRANCH=main
    INSTALL_CMD="npm ci --include=dev --no-audit --no-fund"
    COMPILE_CMD="npm run build"
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
    # MEDIDO DOS VECES, y la segunda porque la primera quedó corta:
    #   14/08 mañana → pico 2.260 MB, techo 3.072: alcanzaba.
    #   14/08 noche  → pico >2.971 MB con el mismo techo: **OOM**. El código creció
    #                  en el día (la alerta de coordinación, sus tests, su modelo).
    #   Con 4.096 → build OK en 164 s, pico real 2.746 MB.
    #
    # El techo NO es "cuánta memoria usa": es el punto donde V8 deja de intentar y
    # falla. Ponerlo apenas por encima del pico es pedir que el próximo commit lo
    # rompa, y romperlo se ve como un cuelgue de 38 minutos, no como un error.
    NODE_OPTIONS_BUILD="--max-old-space-size=4096"
    SERVICE=com.constroad.portal
    HEALTH_URL=http://127.0.0.1:3002/
    # Portal arranca en segundos: `next start` sirve apenas bindea.
    SALUD_TIMEOUT=90
    SHARED_FILES=(.env.local)
    ;;
  torre)
    REPO_DIR=/Users/jose/projects/torre
    # Copia de trabajo, no mirror: acá también se programa. Si el directorio
    # desapareciera, el bootstrap la reclona como mirror — sirve para deployar,
    # pero habría que rehacer el clon normal para volver a trabajar ahí.
    REPO_URL=git@github.com:constroad/torre.git
    BRANCH=main
    INSTALL_CMD="npm ci --include=dev --no-audit --no-fund"
    COMPILE_CMD="npm run build"
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
# Compartido por TODAS las apps: serializa la fase de compilación (ver más abajo).
GLOBAL_LOCK=/tmp/constroad-build.lock.d
CONSERVAR=5

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# Aviso por Telegram del resultado del deploy.
#
# POR QUÉ IMPORTA MÁS EN LOS FALLOS: un deploy que sale bien se nota porque el
# cambio aparece. Uno que falla NO se nota — el auto-rollback deja producción
# sirviendo la versión anterior, sana y silenciosa, y el commit que creías
# desplegado simplemente no está. Sin este aviso, esa diferencia se descubre
# cuando alguien pregunta por qué su cambio no aparece.
#
# FIRE-AND-FORGET Y CON TIMEOUT: avisar es lo último que debe poder trabar o
# tumbar un deploy. Si Telegram no responde, se pierde el mensaje y ya.
avisar_telegram() {   # $1 = emoji/estado, $2 = detalle
  local token chat env_file="$SHARED/.env"
  [ -f "$env_file" ] || env_file="/Users/jose/deploys/lila/shared/.env"
  [ -f "$env_file" ] || return 0
  token=$(grep -m1 '^TELEGRAM_BOT_TOKEN=' "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"\r')
  chat=$(grep -m1 '^TELEGRAM_ALERTS_CHAT_ID=' "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"\r')
  [ -n "$token" ] && [ -n "$chat" ] || return 0
  curl -s -o /dev/null --max-time 8 \
    "https://api.telegram.org/bot${token}/sendMessage" \
    --data-urlencode "chat_id=${chat}" \
    --data-urlencode "text=${1} *${APP}* — ${2}" \
    --data-urlencode "parse_mode=Markdown" 2>/dev/null || true
}
fatal() {
  log "✗ $*"
  # El aviso va en el fatal y no en cada punto de fallo: así ninguna causa nueva
  # se queda sin avisar por olvido.
  avisar_telegram "❌" "deploy abortado — ${1%%$'\n'*}"
  exit 1
}

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
  LOCK_APP_TOMADO=1
}

# UN SOLO trap para todos los candados. Bash admite un único EXIT: definir un
# segundo `trap ... EXIT` más abajo NO agrega, REEMPLAZA — y el candado del
# primero quedaría sin liberar hasta que alguien lo borrara a mano.
limpiar() {
  [ -n "${LOCK_APP_TOMADO:-}" ] && rmdir "$LOCK.d" 2>/dev/null
  [ -n "${LOCK_BUILD_TOMADO:-}" ] && rm -rf "$GLOBAL_LOCK" 2>/dev/null
  return 0
}
trap limpiar EXIT

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

activar_sin_reinicio() {   # $1 = ruta de la release a activar
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
}

activar() {   # $1 = ruta de la release a activar, y reinicia el servicio
  activar_sin_reinicio "$1" || return 1
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

# BOOTSTRAP: si el repo no está en esta máquina, clonarlo.
#
# EL CASO QUE ESTO RESUELVE: una app nueva la crea alguien en su laptop y la
# pushea a GitHub por primera vez. La mini no sabe nada de ese repositorio. Sin
# este paso, el primer deploy moría con "No existe /Users/jose/..." y había que
# clonar a mano — un requisito manual escondido que convertía el 0-1 en un 1-1.
#
# MIRROR Y NO COPIA DE TRABAJO: un mirror no tiene working tree que pueda quedar
# sucio ni en otra rama, y `git archive` funciona igual desde uno. Además el
# directorio de deploy deja de ser la copia donde alguien programa: borrar por
# accidente un `node_modules` mientras se deploya deja de ser posible.
#
# POR QUÉ NO SE CLONA EN CADA DEPLOY, que es lo que hacen Dokploy y Coolify: ellos
# terminan metiendo todo en una imagen, así que el clon es efímero igual. Acá no
# hay Docker; mantener el mirror y traer solo los deltas es órdenes de magnitud más
# barato en una máquina que además está sirviendo tráfico.
#
# CREDENCIAL: la clave SSH de la máquina (`~/.ssh/id_ed25519`), que ya autentica
# como `constroad` y lee los repos privados de la organización. No hace falta
# ninguna credencial nueva por app. Contrapartida conocida: es una clave de cuenta,
# no una deploy key por repo, así que da más acceso del mínimo necesario.
if [ ! -d "$REPO_DIR" ]; then
  [ -n "${REPO_URL:-}" ] || fatal "El repo no está clonado y no hay REPO_URL declarada para $APP"
  log "Repo ausente en la máquina — clonando $REPO_URL"
  mkdir -p "$(dirname "$REPO_DIR")" || fatal "No pude crear el directorio padre"
  # Timeout: un clone que pide contraseña se quedaría colgado para siempre y el
  # deploy nunca terminaría ni fallaría. `BatchMode` hace que falle en vez de pedirla.
  GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
    git clone --mirror "$REPO_URL" "$REPO_DIR" --quiet \
    || fatal "No pude clonar $REPO_URL — ¿la clave SSH de la mini tiene acceso al repo?"
  log "Clonado en $REPO_DIR"
fi

cd "$REPO_DIR" || fatal "No existe $REPO_DIR"
git fetch origin "$BRANCH" --quiet || fatal "git fetch falló"
# Resolver el HEAD del branch SIRVIENDO A LAS DOS FORMAS de repo, porque no
# nombran igual la misma rama:
#   · copia de trabajo → `origin/main` (el ref remoto vive en refs/remotes/)
#   · mirror           → `main` a secas (los refs se copian 1:1, sin namespace)
# Probado: en un mirror `git rev-parse origin/main` falla con "not a valid object
# name". Y falla de la peor manera, porque `git rev-parse` ADEMÁS escribe el
# argumento sin resolver en stdout — así que un `$(...)` descuidado captura la
# cadena "origin/main" como si fuera un SHA y el error aparece mucho más tarde,
# disfrazado de otra cosa. Por eso se usa `--verify -q`, que no imprime nada si no
# resuelve.
if [ -z "$SHA" ]; then
  SHA=$(git rev-parse --verify -q "origin/$BRANCH" || git rev-parse --verify -q "$BRANCH") \
    || fatal "No pude resolver el branch '$BRANCH' en $REPO_DIR"
fi
SHORT=$(git rev-parse --short "$SHA") || fatal "SHA inválido: $SHA"

INICIO=$(date +%s)
NOMBRE="$(date '+%Y%m%d-%H%M%S')-$SHORT"
DEST="$RELEASES/$NOMBRE"
log "=== Deploy de $APP · $SHORT → $NOMBRE ==="

# Checkout limpio del SHA en la release nueva. `git worktree` no: dejaría la
# release atada al repo y un `git gc` podría romperla. Un archive es autónomo.
mkdir -p "$DEST" || fatal "No pude crear $DEST"
git archive "$SHA" | tar -x -C "$DEST" || fatal "No pude extraer el SHA"


# LOCK GLOBAL, SOLO ALREDEDOR DEL BUILD.
#
# El lock de más arriba es POR APP: evita dos deploys de la misma, pero deja que
# dos apps distintas compilen a la vez. Con una o dos apps eso nunca pasó; con
# cada app nueva la probabilidad sube, y el resultado sería malo: el build de
# Portal pica en 2.260 MB y su techo está en 3.072. Dos builds simultáneos piden
# hasta 6 GB de heap en una máquina de 8 GB que además está sirviendo tráfico —
# swap justo cuando hay usuarios conectados, o un OOM que mata un deploy sano.
#
# ESPERA EN VEZ DE FALLAR: el lock por app usa `-n` porque un segundo deploy de la
# misma app es un error. Acá no: que otra app esté compilando es normal y transitorio,
# y rechazar el deploy por eso obligaría a reintentar a mano. Se espera con techo,
# porque colgarse para siempre es peor que fallar diciéndolo.
espera=0
while ! mkdir "$GLOBAL_LOCK" 2>/dev/null; do
  # Candado huérfano: si quedó de un proceso muerto, a los 30 min se ignora.
  if [ -d "$GLOBAL_LOCK" ] && [ -n "$(find "$GLOBAL_LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
    log "⚠️  Candado de build huérfano (>30 min) — se descarta"
    rm -rf "$GLOBAL_LOCK"; continue
  fi
  [ "$espera" -eq 0 ] && log "Otra app está compilando — esperando turno…"
  sleep 10; espera=$((espera + 10))
  [ "$espera" -ge 1800 ] && fatal "30 min esperando el candado de build; algo quedó colgado"
done
LOCK_BUILD_TOMADO=1
[ "$espera" -gt 0 ] && log "Turno tomado tras ${espera}s de espera"

# DEPENDENCIAS: almacén compartido, indexado por hash del lockfile.
#
# EL PROBLEMA QUE RESUELVE. `npm ci` tardaba 432 s reinstalando un árbol idéntico
# al de la release anterior. La primera solución fue clonar con `cp -Rc`
# (copy-on-write de APFS): bajó a 7 s en torre… y a 337 s en Portal, porque
# clonefile es POR ARCHIVO y Portal tiene 59.223 contra los 9.541 de torre. El
# tamaño no manda; manda la cantidad.
#
# LA SOLUCIÓN. Un solo árbol por lockfile en `<app>/nm-cache/<hash>`, y cada
# release lo apunta con un symlink. Instalar deja de ser copiar: es crear un
# enlace. Costo O(1) sin importar cuántos archivos tenga el árbol.
#
# POR QUÉ EL HASH DEL LOCKFILE Y NO DEL package.json: el lockfile determina el
# árbol EXACTO. Dos package.json iguales con lockfiles distintos instalan cosas
# distintas, y esa es justamente la diferencia que no se puede pasar por alto.
#
# RIESGO ASUMIDO Y POR QUÉ SE ACEPTA: varias releases comparten el mismo árbol, así
# que algo que escriba DENTRO de node_modules afecta a todas. Se acepta porque
# node_modules es de lectura después de instalar —Next escribe su caché en
# `.next/cache`, no ahí— y porque la alternativa era pagar 337 s por deploy. Si
# algún día una herramienta escribe adentro, el síntoma sería releases viejas
# cambiando solas: está anotado acá para no perder una tarde buscándolo.
NM_CACHE="$BASE/nm-cache"
mkdir -p "$NM_CACHE"

if [ -f "$DEST/package-lock.json" ]; then
  HASH_LOCK=$(shasum -a 256 "$DEST/package-lock.json" | cut -c1-16)
else
  HASH_LOCK=""
fi
# EL DIRECTORIO TIENE QUE LLAMARSE `node_modules`, y no es cosmética: al seguir el
# symlink Node resuelve la ruta REAL y desde ahí busca los paquetes hermanos
# subiendo por directorios llamados `node_modules`. Con el almacén nombrado por el
# hash, `next` quedaba en `<hash>/next` y buscaba a `styled-jsx` en
# `<hash>/node_modules/…`, que no existe. Falla con "Cannot find module", que no
# se parece en nada a "el symlink está mal armado".
ARBOL="$NM_CACHE/$HASH_LOCK/node_modules"

if [ -n "$HASH_LOCK" ] && [ -d "$ARBOL" ] && [ -f "$ARBOL/.completo" ]; then
  # `.completo` es la marca de que la instalación terminó bien. Sin ella, un
  # `npm ci` interrumpido a la mitad dejaría un árbol trunco que se reusaría para
  # siempre — y el fallo aparecería mucho después, como un módulo que "falta".
  rm -rf "$DEST/node_modules"
  ln -sfn "$ARBOL" "$DEST/node_modules"
  log "node_modules del almacén ($HASH_LOCK) — sin reinstalar"
else
  log "Lockfile nuevo ($HASH_LOCK) — instalando…"
  inicio_nm=$(date +%s)
  ( cd "$DEST" && eval "$INSTALL_CMD" ) >> "$LOG" 2>&1 \
    || fatal "Falló la instalación de dependencias"

  # Se mueve al almacén y se enlaza. `mv` dentro del mismo volumen es un rename:
  # instantáneo y atómico, así que no hay ventana en la que el árbol esté a medias
  # en su destino final.
  if [ -n "$HASH_LOCK" ] && [ -d "$DEST/node_modules" ]; then
    rm -rf "$NM_CACHE/$HASH_LOCK"
    mkdir -p "$NM_CACHE/$HASH_LOCK"
    mv "$DEST/node_modules" "$ARBOL" && touch "$ARBOL/.completo" \
      && ln -sfn "$ARBOL" "$DEST/node_modules"
  fi
  log "Dependencias instaladas y guardadas en el almacén ($(( $(date +%s) - inicio_nm ))s)"
fi

# Poda: se conservan los 3 árboles más recientes. Cada uno pesa cientos de MB y
# solo sirve mientras alguna release retenida lo apunte; guardarlos todos haría
# crecer el disco con cada cambio de dependencias.
ls -1dt "$NM_CACHE"/*/ 2>/dev/null | tail -n +4 | while read -r viejo; do
  # No se borra el que está en uso ahora mismo.
  [ "${viejo%/}" = "$NM_CACHE/$HASH_LOCK" ] && continue
  rm -rf "$viejo" && log "Árbol de dependencias viejo eliminado: $(basename "${viejo%/}")"
done

# LOS TESTS NO CORREN ACÁ, Y ES UNA DECISIÓN CORREGIDA (14/08/2026).
#
# Estuvieron un rato en este script con el argumento de que eran "21 s contra los
# 9 min de GitHub". El argumento medía lo que no era: esos 21 s se le roban a una
# máquina de 8 GB que al mismo tiempo está SIRVIENDO a los usuarios. Medido en el
# deploy real: los tests tardaron 366 s bajo contención, el `npm ci` 432 s, y
# Portal quedó tan lento que la gente lo reportó.
#
# El build sí tiene que correr acá —es lo que se sirve— y cuesta 2 s. Todo lo demás
# que se puede hacer en compute ajeno, se hace en compute ajeno.
# Los archivos compartidos (secretos) viven FUERA de las releases y se enlazan.
# Así rotar un secreto no obliga a rebuildear, y las releases no los duplican.
# `${SHARED_FILES[@]+...}` y no `${SHARED_FILES[@]}` a secas: el bash 3.2 que trae
# macOS trata un array VACÍO como variable no definida y con `set -u` aborta el
# deploy con "unbound variable". Le pasaría a la primera app que no declare
# archivos compartidos —un caso perfectamente válido— y el error no diría nada
# sobre la causa.
for f in ${SHARED_FILES[@]+"${SHARED_FILES[@]}"}; do
  if [ ! -f "$SHARED/$f" ]; then
    # Respaldo: tomarlo de la copia de trabajo. OJO — esto NO funciona cuando el
    # repo es un mirror (una app nueva bootstrapeada), porque un mirror no tiene
    # working tree del que copiar. Es correcto que no funcione: los secretos de
    # una app nueva no están en su repositorio, alguien tiene que ponerlos.
    [ -f "$REPO_DIR/$f" ] && cp "$REPO_DIR/$f" "$SHARED/$f" && chmod 600 "$SHARED/$f" \
      && log "Primer deploy: $f copiado a shared/"
  fi

  # FALLA EN VEZ DE CALLAR. Antes, si el archivo no aparecía por ningún lado, este
  # bucle simplemente no hacía nada: el build seguía adelante sin las variables y
  # sin una sola línea en el log. Ese es exactamente el modo de fallo más caro que
  # tuvimos —config ausente que no se anuncia— y en Next es peor todavía, porque
  # las env vars del middleware se inlinean al compilar: la release queda
  # permanentemente rota y hay que rebuildear para arreglarla, no basta con poner
  # el archivo y reiniciar.
  if [ ! -f "$SHARED/$f" ]; then
    fatal "Falta $SHARED/$f — la app lo declara en SHARED_FILES.
       Poné el archivo ahí (modo 600) y volvé a deployar. Si es una app nueva,
       sus secretos no vienen en el repo: hay que crearlo a mano."
  fi
  ln -sfn "$SHARED/$f" "$DEST/$f"
done

# TECHO DE TIEMPO PARA EL BUILD.
#
# EL CASO REAL (14/08/2026): el build de Portal se pasó de heap y V8 entró en
# espiral de GC —recolectando sin avanzar, al 92% de CPU, sin escribir un solo
# archivo nuevo en `.next`— durante **38 minutos**, hasta que alguien lo miró. No
# estaba colgado en el sentido de bloqueado: estaba trabajando furiosamente en
# nada, que es peor, porque parece progreso.
#
# El síntoma engaña: CPU alta, proceso vivo, log sin errores. Sin un techo, un
# build así se come la máquina hasta que un humano intervenga.
#
# 30 min, y el número tiene historia. Se probó con 12 —4x el build de Portal
# medido con la máquina libre (164 s)— y cortó un build sano: bajo contención real
# —con otra app deployando y las tres sirviendo— Portal se pasa de 12 min sin estar
# roto. El techo no está para acelerar nada: está para que un build en espiral de
# GC muera en media hora en vez de girar hasta que alguien lo mire.
BUILD_TIMEOUT=${BUILD_TIMEOUT:-1800}

log "Compilando…"
(
  cd "$DEST" || exit 1
  [ -n "${NODE_OPTIONS_BUILD:-}" ] && export NODE_OPTIONS="$NODE_OPTIONS_BUILD"
  # SIN `nice`, y la razón es empírica: se probó y el build de Portal pasó de
  # 3m15s a colgarse 38 minutos quemando un núcleo sin producir un archivo. No
  # quedó demostrado que `nice` fuera la causa —pudo ser el árbol de dependencias
  # clonado— pero tampoco aportaba nada medible, y ante la duda gana lo que se
  # sabe que funcionaba. Si el build vuelve a molestar a producción, la respuesta
  # correcta es acotar sus workers, no bajarle la prioridad al proceso entero.
  eval "$COMPILE_CMD"
) >> "$LOG" 2>&1 &
pid_build=$!

# Vigía: mata el build si se pasa del techo. Se corre en segundo plano y se
# autodestruye si el build termina antes.
(
  espera_b=0
  while kill -0 "$pid_build" 2>/dev/null; do
    sleep 10; espera_b=$((espera_b + 10))
    if [ "$espera_b" -ge "$BUILD_TIMEOUT" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⏱️  Build excedió ${BUILD_TIMEOUT}s — se aborta" >> "$LOG"
      # Al grupo, no solo al padre: los workers de Next son los que consumen.
      kill -9 -"$pid_build" 2>/dev/null || kill -9 "$pid_build" 2>/dev/null
      break
    fi
  done
) &
pid_vigia=$!

wait "$pid_build"
rc_build=$?
kill "$pid_vigia" 2>/dev/null

# SOLO EL TRAMO DE ESTE DEPLOY. El log es acumulativo, así que buscar en todo el
# archivo encontraba el OOM de un deploy de hace una hora y reportaba "sin
# memoria" un build que había fallado por otra cosa. Un diagnóstico automático que
# se equivoca es peor que no darlo: manda a subir un techo que no era el problema.
if [ $rc_build -ne 0 ] && \
   awk -v r="$NOMBRE" '$0 ~ ("→ " r) {p=1} p' "$LOG" 2>/dev/null | grep -q "heap out of memory"; then
  log "⚠️  El build se quedó SIN MEMORIA. Subí NODE_OPTIONS_BUILD para esta app."
fi

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

# Se suelta ACÁ y no al salir: lo que compite por memoria es el build, no el
# health check. Retenerlo hasta el final bloquearía 240 s a las otras apps
# —el timeout de lila— sin que nada lo justifique.
rm -rf "$GLOBAL_LOCK" 2>/dev/null; LOCK_BUILD_TOMADO=

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
# ALCANCE: cubre las últimas $CONSERVAR releases, no una sola.
#
# POR QUÉ SE COPIA DE UN SNAPSHOT Y NO DE LA RELEASE ANTERIOR A SECAS: la primera
# versión copiaba `.next/static` de la release previa, que a su vez ya tenía dentro
# la suya y la de antes. La cadena nunca se cortaba: medido, cada deploy sumaba ~9
# archivos —33 → 43 → 52 → 61 → 70 en cuatro deploys— y ninguna release volvía a
# quedar limpia. Funcionaba, y de hecho cubría MÁS generaciones de las que yo había
# documentado, pero crecía sin techo: a ese ritmo son ~180 KB por deploy que nadie
# borra nunca, porque el podado de releases viejas no alcanza a lo que ya se copió
# hacia adelante.
#
# Con el snapshot pristino cada release guarda aparte sus estáticos RECIÉN
# compilados, y la unión se arma leyendo los pristinos de las releases retenidas.
# La cobertura pasa a ser explícita ($CONSERVAR generaciones) y el tamaño deja de
# depender de cuántos deploys se hicieron en total.
if [ -d "$DEST/.next/static" ]; then
  cp -R "$DEST/.next/static" "$DEST/.next/static-pristino" 2>/dev/null || true

  copiadas=0
  for previa in $(ls -1 "$RELEASES" 2>/dev/null | sort -r | grep -v "^${NOMBRE}$" | head -"$CONSERVAR"); do
    # Las releases anteriores a este cambio no tienen pristino; se usa su `static`,
    # que para ellas es equivalente.
    ORIGEN="$RELEASES/$previa/.next/static-pristino"
    [ -d "$ORIGEN" ] || ORIGEN="$RELEASES/$previa/.next/static"
    [ -d "$ORIGEN" ] || continue
    cp -Rn "$ORIGEN/." "$DEST/.next/static/" 2>/dev/null || true
    copiadas=$((copiadas + 1))
  done

  [ "$copiadas" -gt 0 ] && \
    log "Assets de $copiadas release(s) anterior(es) conservados (las pestañas abiertas siguen andando)"
fi

ANTERIOR=$(readlink "$CURRENT" 2>/dev/null)

# PRIMER DEPLOY DE UNA APP NUEVA: el plist todavía no existe.
#
# Es el orden correcto y no se puede invertir — el plist apunta a
# `deploys/<app>/current`, así que instalarlo ANTES del primer deploy deja el
# daemon en bucle de reinicio contra un symlink que no existe.
#
# Sin este caso, el primer deploy terminaba de la peor manera posible: kickstart
# fallaba, el health check no encontraba a nadie escuchando, se disparaba el
# auto-rollback, no había release anterior a la que volver, y el log cerraba con un
# 🚨 alarmante. Todo eso describiendo un deploy que en realidad salió bien: la
# release está compilada y verificada, solo falta darle de alta el servicio.
if [ ! -f "/Library/LaunchDaemons/$SERVICE.plist" ]; then
  activar_sin_reinicio "$DEST"
  log "✓ Release lista y activada — falta dar de alta el servicio (primer deploy)"
  log "  1. Instalá el plist en /Library/LaunchDaemons/$SERVICE.plist"
  log "  2. sudo launchctl bootstrap system /Library/LaunchDaemons/$SERVICE.plist"
  log "  3. Agregá la línea de sudoers para poder reiniciarlo en los próximos deploys"
  log "  Los cuatro archivos salen de https://torre.constroad.com/setup/nueva"
  registrar ok-sin-servicio "$(( $(date +%s) - INICIO ))"
  exit 0
fi

activar "$DEST"; rc=$?
[ $rc -eq 2 ] && { log "Deploy dejado en su lugar; falta el reinicio manual"; exit 0; }

if salud_ok; then
  log "✓ Deploy OK — $APP responde en $HEALTH_URL"
  registrar ok "$(( $(date +%s) - INICIO ))"
  avisar_telegram "✅" "deploy OK · \`$SHORT\` · $(( $(date +%s) - INICIO ))s"
else
  log "✗ $APP NO responde tras el deploy"
  if [ -n "$ANTERIOR" ] && [ -d "$ANTERIOR" ]; then
    log "AUTO-ROLLBACK a $(basename "$ANTERIOR")"
    activar "$ANTERIOR"
    if salud_ok; then
      log "✓ Rollback OK: producción restaurada"
      avisar_telegram "⚠️" "deploy de \`$SHORT\` FALLÓ el health check · se volvió sola a $(basename "$ANTERIOR") · producción OK"
    else
      log "🚨 Ni la release anterior responde — revisar a mano"
      avisar_telegram "🚨" "deploy de \`$SHORT\` falló Y el rollback tampoco responde · REVISAR A MANO"
    fi
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
