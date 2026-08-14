#!/bin/bash
# Deja el LaunchDaemon de cloudflared sirviendo NUESTRO túnel. Correr con sudo.
#
# POR QUÉ HACE FALTA (2026-08-13): `cloudflared service install` instala el plist
# en /Library/LaunchDaemons pero lo invoca SIN argumentos —ni `tunnel run` ni
# `--config`— y escribe en /usr/local/etc/cloudflared/config.yml un archivo que
# solo tiene `logDirectory`. O sea: el servicio arranca, se ve "instalado", y no
# sirve absolutamente nada.
#
# El daemon corre como ROOT, así que no puede leer /Users/jose/.cloudflared/.
# Hay que copiar la config Y la credencial a una ruta del sistema.
#
# El síntoma sería engañoso: `launchctl` muestra el servicio corriendo y el sitio
# responde... mientras siga vivo el cloudflared del usuario. Al cerrarse esa
# sesión, el sitio cae y el servicio sigue reportándose sano.
set -eu

UUID=b197fa60-e70e-4453-884a-920fa1067bee
ORIGEN=/Users/jose/.cloudflared
DESTINO=/usr/local/etc/cloudflared

[ "$(id -u)" -eq 0 ] || { echo "Correlo con sudo"; exit 1; }
[ -f "$ORIGEN/$UUID.json" ] || { echo "Falta $ORIGEN/$UUID.json"; exit 1; }

mkdir -p "$DESTINO"
cp "$ORIGEN/$UUID.json" "$DESTINO/"
chmod 600 "$DESTINO/$UUID.json"

cat > "$DESTINO/config.yml" <<EOF
tunnel: $UUID
credentials-file: $DESTINO/$UUID.json
logDirectory: /var/log/cloudflared

# EL ORDEN IMPORTA Y NO ES COSMÉTICO: cloudflared evalúa de arriba abajo y gana
# la PRIMERA que matchea. Todo lo específico va ANTES del wildcard; si el
# wildcard quedara primero se comería lila y torre, y ambas terminarían sirviendo
# Portal — con un síntoma confuso, porque responderían 200.
#
# La última regla sin hostname es OBLIGATORIA: sin ella cloudflared no arranca y
# el error no dice por qué.
ingress:
  - hostname: lila.constroad.com
    service: http://127.0.0.1:3001
  - hostname: torre.constroad.com
    service: http://127.0.0.1:4000
  - hostname: constroad.com
    service: http://127.0.0.1:3002
  - hostname: "*.constroad.com"
    service: http://127.0.0.1:3002
  - service: http_status:404
EOF

/opt/homebrew/bin/cloudflared --config "$DESTINO/config.yml" tunnel ingress validate

# EL PLIST TAMBIÉN ESTÁ MAL, no solo la config. `cloudflared service install`
# genera ProgramArguments con SOLO el binario, sin subcomando. Así cloudflared
# arranca, imprime "use `cloudflared tunnel run` to start tunnel <uuid>" y sale
# con código 0. launchd lo reintenta para siempre: `active count = 0`,
# `state = spawn scheduled`, y el log se llena de la misma línea.
# Se reescribe el plist entero para controlar también KeepAlive.
cat > /Library/LaunchDaemons/com.cloudflare.cloudflared.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cloudflare.cloudflared</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/cloudflared</string>
        <string>--config</string>
        <string>$DESTINO/config.yml</string>
        <string>--no-autoupdate</string>
        <string>tunnel</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>/Library/Logs/com.cloudflare.cloudflared.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Library/Logs/com.cloudflare.cloudflared.err.log</string>
</dict>
</plist>
PLIST
chmod 644 /Library/LaunchDaemons/com.cloudflare.cloudflared.plist

launchctl bootout system/com.cloudflare.cloudflared 2>/dev/null || true
sleep 2
launchctl bootstrap system /Library/LaunchDaemons/com.cloudflare.cloudflared.plist

echo "✓ Daemon configurado. Verificá con:"
echo "    sudo launchctl print system/com.cloudflare.cloudflared | head -5"
