#!/bin/bash
# Apunta los plists de lila y Portal a deploys/<app>/current. Correr con sudo.
#
# Es el paso que pone EN USO todo el pipeline: hasta ahora las releases se
# construían y el symlink se movía, pero launchd seguía arrancando desde el árbol
# de git. O sea que `current` cambiaba y no pasaba nada — un rollback no habría
# revertido nada.
#
# ADEMÁS instala una regla de sudoers acotada. Sin ella el pipeline queda a
# medias: `deploy.sh` mueve el symlink pero no puede reiniciar el servicio, así
# que cada deploy automático terminaría con "falta el reinicio manual" y el
# código nuevo no entraría en producción hasta que alguien fuera a la máquina.
set -eu

USUARIO=jose
BASE=/Users/jose/deploys

[ "$(id -u)" -eq 0 ] || { echo "Correlo con sudo"; exit 1; }

# ---- 1. Verificar ANTES de tocar nada ---------------------------------------
# Un plist apuntando a un symlink roto deja el servicio en crash-loop, y con
# KeepAlive eso significa reintentar para siempre. Se comprueba primero.
for app in lila portal; do
  DEST="$BASE/$app/current"
  [ -e "$DEST" ] || { echo "✗ No existe $DEST — deployá $app antes de migrar"; exit 1; }
done
[ -f "$BASE/lila/current/resilient-dev.cjs" ] || { echo "✗ Falta resilient-dev.cjs en la release de lila"; exit 1; }
[ -f "$BASE/portal/current/node_modules/next/dist/bin/next" ] || { echo "✗ Falta el binario de next en la release de portal"; exit 1; }
[ -d "$BASE/portal/current/.next" ] || { echo "✗ Falta el build (.next) en la release de portal"; exit 1; }
echo "✓ Ambas releases están completas"

escribir_plist() {
  local label=$1 wd=$2 out=$3 err=$4; shift 4
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "  <key>Label</key><string>$label</string>"
    echo "  <key>UserName</key><string>$USUARIO</string>"
    echo '  <key>ProgramArguments</key><array>'
    for a in "$@"; do echo "    <string>$a</string>"; done
    echo '  </array>'
    echo "  <key>WorkingDirectory</key><string>$wd</string>"
    echo '  <key>RunAtLoad</key><true/>'
    echo '  <key>KeepAlive</key><true/>'
    echo '  <key>ThrottleInterval</key><integer>10</integer>'
    echo '  <key>ProcessType</key><string>Background</string>'
    echo "  <key>StandardOutPath</key><string>$out</string>"
    echo "  <key>StandardErrorPath</key><string>$err</string>"
    echo '  <key>EnvironmentVariables</key><dict>'
    echo '    <key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>'
    echo "    <key>HOME</key><string>/Users/$USUARIO</string>"
    echo '    <key>NODE_ENV</key><string>production</string>'
    echo '  </dict>'
    echo '</dict></plist>'
  } > "/Library/LaunchDaemons/$label.plist"
  chown root:wheel "/Library/LaunchDaemons/$label.plist"
  chmod 644 "/Library/LaunchDaemons/$label.plist"
}

# Los logs quedan FUERA de la release: si vivieran adentro, cada deploy empezaría
# con un log vacío y se perdería el historial justo cuando hay que investigar por
# qué falló el deploy anterior.
mkdir -p /Users/jose/projects/lila-app/logs /Users/jose/projects/Portal/logs

escribir_plist com.constroad.lila "$BASE/lila/current" \
  /Users/jose/projects/lila-app/logs/lila-app.log \
  /Users/jose/projects/lila-app/logs/lila-app-err.log \
  /usr/local/bin/node "$BASE/lila/current/resilient-dev.cjs"

escribir_plist com.constroad.portal "$BASE/portal/current" \
  /Users/jose/projects/Portal/logs/portal.log \
  /Users/jose/projects/Portal/logs/portal-err.log \
  /usr/local/bin/node "$BASE/portal/current/node_modules/next/dist/bin/next" start -p 3002

# ---- 2. sudoers ACOTADO -----------------------------------------------------
# Solo `launchctl kickstart -k` sobre estos tres servicios exactos, y nada más.
# No es `NOPASSWD: ALL` ni `launchctl *`: con eso, cualquiera que ejecute código
# como jose podría cargar un LaunchDaemon propio y quedarse con root.
cat > /etc/sudoers.d/constroad-deploy <<'SUDO'
# Permite a los deploys reiniciar SOLO estos servicios, sin contraseña.
# Sin esto, cada deploy automático termina en "falta el reinicio manual".
jose ALL=(root) NOPASSWD: /bin/launchctl kickstart -k system/com.constroad.lila
jose ALL=(root) NOPASSWD: /bin/launchctl kickstart -k system/com.constroad.portal
jose ALL=(root) NOPASSWD: /bin/launchctl kickstart -k system/com.constroad.torre
SUDO
chmod 440 /etc/sudoers.d/constroad-deploy
# `visudo -c` valida ANTES de que quede activo: un sudoers con error de sintaxis
# puede dejar la máquina sin sudo, y eso se arregla solo en modo recuperación.
visudo -c -f /etc/sudoers.d/constroad-deploy || {
  rm -f /etc/sudoers.d/constroad-deploy
  echo "✗ sudoers inválido, se revirtió"; exit 1
}
echo "✓ sudoers instalado y validado"

# ---- 3. Recargar ------------------------------------------------------------
for l in com.constroad.lila com.constroad.portal; do
  launchctl bootout "system/$l" 2>/dev/null || true
done
sleep 3
for l in com.constroad.lila com.constroad.portal; do
  launchctl bootstrap system "/Library/LaunchDaemons/$l.plist"
  echo "✓ $l recargado desde current"
done

echo
echo "Verificá:  curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3001/health"
echo "           curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3002/"
