#!/bin/bash
# Instala el watchdog del túnel Cloudflare como LaunchDaemon. Correr con sudo.
#
# LaunchDaemon y no LaunchAgent, por la misma razón que el resto: un agente
# necesita sesión gráfica iniciada, así que tras un reboot sin auto-login el
# vigilante no arranca — y un vigilante que no arranca es peor que ninguno,
# porque su silencio se lee como "todo bien".
#
# Corre como `jose` (UserName) para leer el .env con el token de Telegram sin
# necesitar root.
set -eu

LABEL=com.constroad.cloudflare-watchdog
SCRIPT=/Users/jose/projects/lila-app/scripts/cloudflare-tunnel-watchdog.sh
LOGS=/Users/jose/projects/lila-app/logs

[ "$(id -u)" -eq 0 ] || { echo "Correlo con sudo"; exit 1; }
[ -x "$SCRIPT" ] || { echo "Falta $SCRIPT o no es ejecutable"; exit 1; }

cat > "/Library/LaunchDaemons/$LABEL.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>UserName</key><string>jose</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$SCRIPT</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>30</integer>
    <key>ProcessType</key><string>Background</string>
    <key>StandardOutPath</key><string>$LOGS/cloudflare-watchdog-out.log</string>
    <key>StandardErrorPath</key><string>$LOGS/cloudflare-watchdog-err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>HOME</key><string>/Users/jose</string>
    </dict>
</dict>
</plist>
PLIST
chown root:wheel "/Library/LaunchDaemons/$LABEL.plist"
chmod 644 "/Library/LaunchDaemons/$LABEL.plist"

launchctl bootout "system/$LABEL" 2>/dev/null || true
sleep 1
launchctl bootstrap system "/Library/LaunchDaemons/$LABEL.plist"

echo "✓ $LABEL instalado"
echo "  Verificá:  launchctl print system/$LABEL | grep -E 'state|pid'"
echo "  Log:       tail -f $LOGS/cloudflare-watchdog.log"
