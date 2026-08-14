#!/bin/bash
# Crea el túnel de Cloudflare para Portal y lila, y lo deja listo para launchd.
#
# PRECONDICIÓN: `cloudflared tunnel login` completado (deja ~/.cloudflared/cert.pem).
# Ese login NO se puede hacer hasta que la zona esté ACTIVE en Cloudflare — la
# pantalla de autorización lista los dominios de la cuenta y un dominio pendiente
# no aparece. Si el script aborta en el primer chequeo, es eso.
#
# Es IDEMPOTENTE: si el túnel ya existe lo reutiliza en vez de crear uno nuevo.
set -u

CF=/opt/homebrew/bin/cloudflared
TUNNEL=constroad-mini
DOMINIO=constroad.com
DIR="$HOME/.cloudflared"
PORTAL_PORT=3002    # ver §0 del spec: el 3000 lo ocupa un nginx viejo
LILA_PORT=3001

rojo()  { printf "\033[31m%s\033[0m\n" "$1"; }
verde() { printf "\033[32m%s\033[0m\n" "$1"; }

# ── 1. Precondición ──────────────────────────────────────────────────────────
if [ ! -f "$DIR/cert.pem" ]; then
  rojo "✗ Falta $DIR/cert.pem"
  echo "  Corré primero:  $CF tunnel login"
  echo "  Y si el navegador no lista constroad.com, es que la zona aún no está Active."
  exit 1
fi
verde "✓ cert.pem presente"

# ── 2. Túnel (idempotente) ───────────────────────────────────────────────────
UUID=$("$CF" tunnel list --output json 2>/dev/null \
       | /usr/bin/python3 -c "import sys,json;print(next((t['id'] for t in json.load(sys.stdin) if t['name']=='$TUNNEL'),''))" 2>/dev/null)

if [ -z "$UUID" ]; then
  echo "Creando túnel '$TUNNEL'..."
  "$CF" tunnel create "$TUNNEL" || exit 1
  UUID=$("$CF" tunnel list --output json 2>/dev/null \
         | /usr/bin/python3 -c "import sys,json;print(next((t['id'] for t in json.load(sys.stdin) if t['name']=='$TUNNEL'),''))")
else
  echo "Túnel '$TUNNEL' ya existe, se reutiliza."
fi
[ -z "$UUID" ] && { rojo "✗ No se pudo obtener el UUID del túnel"; exit 1; }
verde "✓ Túnel $TUNNEL = $UUID"

# ── 3. config.yml ────────────────────────────────────────────────────────────
# EL ORDEN DE LAS REGLAS IMPORTA: cloudflared evalúa de arriba abajo y gana la
# PRIMERA que matchea. Por eso `lila.` va ANTES del wildcard — si el wildcard
# fuera primero se comería lila y todo el tráfico del backend iría a Portal.
#
# El apex `constroad.com` sirve Portal directo (el multi-tenant hoy es por path:
# constroad.com/login/{empresa}). El wildcard `*.constroad.com` cubre `www` y
# deja listos los subdominios por empresa para cuando se migre a ese esquema.
#
# La ÚLTIMA regla sin `hostname` es OBLIGATORIA: sin ella cloudflared no arranca
# y el mensaje de error no dice por qué. Es el error nº1 de este montaje
# (ver spec §3.4).
cat > "$DIR/config.yml" <<EOF
tunnel: $UUID
credentials-file: $DIR/$UUID.json

ingress:
  - hostname: lila.$DOMINIO
    service: http://127.0.0.1:$LILA_PORT
  - hostname: $DOMINIO
    service: http://127.0.0.1:$PORTAL_PORT
  - hostname: "*.$DOMINIO"
    service: http://127.0.0.1:$PORTAL_PORT
  - service: http_status:404
EOF
verde "✓ config.yml escrito"

# OJO con la posición de --config: va ANTES del subcomando. Puesto después,
# cloudflared imprime el usage y este bloque cantaba "validado" sin haber
# validado nada. Un chequeo que no puede fallar no es un chequeo.
"$CF" --config "$DIR/config.yml" tunnel ingress validate || { rojo "✗ ingress inválido"; exit 1; }
verde "✓ ingress validado"

# ── 4. Rutas DNS (crean los CNAME proxied dentro de la zona) ─────────────────
# --overwrite-dns es NECESARIO: el apex tiene hoy un A a Vercel (76.76.21.21) y
# `www` un CNAME a cname.vercel-dns.com. Sin la bandera, el comando falla porque
# el record ya existe y deja el despliegue a medias.
for host in "lila.$DOMINIO" "$DOMINIO" "*.$DOMINIO"; do
  echo "  → $host"
  "$CF" tunnel route dns --overwrite-dns "$TUNNEL" "$host" 2>&1 | sed 's/^/    /'
done

# ── 5. Backup de la credencial — EL MISMO DÍA ────────────────────────────────
# El JSON es LA LLAVE del túnel: si se pierde hay que rehacer túnel y DNS.
DEST="$HOME/.config/constroad-backup/tunnel-credentials"
mkdir -p "$DEST" && chmod 700 "$DEST"
cp "$DIR/$UUID.json" "$DEST/" 2>/dev/null && chmod 600 "$DEST/$UUID.json" \
  && verde "✓ Credencial copiada a $DEST (entra al repo restic con el resto)"

echo
verde "LISTO. Falta instalar el servicio (necesita tu contraseña):"
echo "  sudo $CF service install"
echo "  sudo launchctl kickstart -k system/com.cloudflare.cloudflared"
