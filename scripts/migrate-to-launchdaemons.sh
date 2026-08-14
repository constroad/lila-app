#!/bin/bash
# Migra lila y Portal de LaunchAgent a LaunchDaemon. Correr con sudo.
#
# POR QUÉ (spec PUERTO §4, §0): hoy ambos viven en ~/Library/LaunchAgents, que
# **requiere sesión gráfica iniciada**. Tras un reboot sin auto-login el servidor
# queda arriba, la máquina responde a ping... y las apps no arrancaron. Es la
# misma falla que el spec le critica a pm2, y la que acabamos de arreglar en
# cloudflared. Un LaunchDaemon arranca ANTES del login.
#
# NO CORREN COMO ROOT. Un daemon por defecto sí lo haría, y eso sería un
# downgrade de seguridad grande: lila maneja claves de WhatsApp, storage y Mongo.
# Con `UserName` arrancan pre-login pero con los privilegios de siempre, que es
# exactamente lo que se busca.
#
# HOME va explícito: los daemons no heredan el entorno del usuario, y sin HOME
# las rutas ~/... se resuelven contra un home vacío.
set -eu

USUARIO=jose
HOME_USR=/Users/jose
LILA=/Users/jose/projects/lila-app
PORTAL=/Users/jose/projects/Portal

[ "$(id -u)" -eq 0 ] || { echo "Correlo con sudo"; exit 1; }

crear_plist() {
  local label=$1 wd=$2 out=$3 err=$4; shift 4
  local args=("$@")
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "  <key>Label</key><string>$label</string>"
    echo "  <key>UserName</key><string>$USUARIO</string>"
    echo '  <key>ProgramArguments</key><array>'
    for a in "${args[@]}"; do echo "    <string>$a</string>"; done
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
    echo "    <key>HOME</key><string>$HOME_USR</string>"
    echo '    <key>NODE_ENV</key><string>production</string>'
    echo '  </dict>'
    echo '</dict></plist>'
  } > "/Library/LaunchDaemons/$label.plist"
  chown root:wheel "/Library/LaunchDaemons/$label.plist"
  chmod 644 "/Library/LaunchDaemons/$label.plist"
}

crear_plist com.constroad.lila "$LILA" "$LILA/logs/lila-app.log" "$LILA/logs/lila-app-err.log" \
  /usr/local/bin/node
  # tsx DIRECTO, sin `resilient-dev.cjs`: ese wrapper reinicia al hijo por su
  # cuenta, así que launchd nunca ve la caída y su KeepAlive —que hace
  # exactamente lo mismo— no llega a entrar nunca. Dos supervisores para un
  # proceso, y el de abajo tapando al de arriba.
  "$LILA/node_modules/tsx/dist/cli.mjs"
  "$LILA/src/index.ts"

crear_plist com.constroad.portal "$PORTAL" "$PORTAL/logs/portal.log" "$PORTAL/logs/portal-err.log" \
  /usr/local/bin/node "$PORTAL/node_modules/next/dist/bin/next" start -p 3002

# Bajar los AGENTES ANTES de levantar los daemons: si conviven, quedan dos
# instancias de lila peleando por las mismas sesiones de WhatsApp (el lease de
# Mongo lo detectaría, pero es una guerra 440 evitable).
UID_USR=$(id -u "$USUARIO")
for l in com.lila.app com.portal.app; do
  launchctl bootout "gui/$UID_USR/$l" 2>/dev/null || true
  [ -f "$HOME_USR/Library/LaunchAgents/$l.plist" ] && \
    mv "$HOME_USR/Library/LaunchAgents/$l.plist" "$HOME_USR/Library/LaunchAgents/$l.plist.disabled"
done
sleep 3

for l in com.constroad.lila com.constroad.portal; do
  launchctl bootout "system/$l" 2>/dev/null || true
  launchctl bootstrap system "/Library/LaunchDaemons/$l.plist"
  echo "✓ $l"
done

echo
echo "Verificá:  launchctl print system/com.constroad.lila | grep -E 'state|pid'"
