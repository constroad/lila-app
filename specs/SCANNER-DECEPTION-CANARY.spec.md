# Detección Activa por Deception (Canary Tokens) — lila-app

> **Objetivo:** subir la señal de detección de escaneo automatizado más allá de
> "contar volumen por IP" (ya implementado, ver §1): distinguir recon masivo de
> fondo (ruido de internet, no dirigido) de un intento REAL de usar un secreto
> filtrado (señal de intención, no solo de sondeo).
> **Estado:** PENDIENTE — no implementado. No priorizar hasta que se cumpla el
> trigger de §4; hoy el volumen/sofisticación recibido no lo justifica.
> **Origen:** incidente 2026-07-19/20 — scanners masivos (vía monitoreo de
> Certificate Transparency logs, no por fuga ni por insider) probando paths tipo
> `.env`, `wp-config.php`, `.git/config` contra el Funnel público. Ver
> `architecture-as-is.md` §Seguridad para el hardening YA implementado.

## 1. Qué ya existe (contexto, no repetir aquí)

`src/services/scanner-detection.service.ts` ya detecta por comportamiento
(volumen de 404/CORS-reject por IP en 5min, peso extra a paths de alta
confianza como `.env*`/`.git`/`wp-config.php`) y banea temporalmente. Esto
responde "¿alguien está tocando la puerta?". Esta spec responde una pregunta
distinta y más fuerte: **"¿alguien encontró algo y lo está usando?"**

## 2. El problema que esto resuelve

Hoy, cuando un scanner pide `/.env.production`, recibe un 404 genérico —
correcto, porque no hay nada ahí. Pero un 404 no diferencia:
- Ruido masivo de internet (99.9% de los casos, sin intención específica contra
  lila-app).
- Alguien que de verdad está buscando ALGO de esta empresa en particular y va a
  seguir intentando por otros medios si el primer intento no rinde.

No hay forma de distinguir esos dos casos con el detector actual. Un canary
token sí la da: si servimos un secreto FALSO pero creíble en esos paths, y ese
secreto falso nunca debería ser usado por nadie legítimo, **el momento en que
alguien intenta USARLO (no solo pedirlo) es una señal de intención real**, no
de ruido de fondo.

## 3. Diseño propuesto

### 3.1 Servir bait en vez de 404 (en paths de alta confianza)

Para los paths ya clasificados como `HIGH_CONFIDENCE_PROBE_PATTERNS` en
`scanner-detection.service.ts` (`.env*`, `wp-config.php`, `.git/config`, etc.),
en vez de caer a `notFoundHandler`, responder 200 con contenido creíble que
contenga un **canary token** embebido:

- `.env*` → variables falsas plausibles (`AWS_ACCESS_KEY_ID`,
  `MONGODB_URI` con host/credenciales falsos, `STRIPE_SECRET_KEY`) generadas
  vía [canarytokens.org](https://canarytokens.org) (gratis, sin infra propia:
  Thinkst aloja el token y te avisa por email/webhook si alguna vez se
  "consume" — p.ej. si el AWS key falso se usa para llamar a la API de AWS).
- `wp-config.php` → credenciales de MySQL falsas con un canary similar.
- `.git/config` → un remote falso apuntando a un repo con un canary token en
  la URL.

**Importante:** la respuesta HTTP debe seguir viéndose como un leak real
descubierto por accidente (200, `Content-Type` correcto, sin headers que
delaten que es un honeypot) — el valor está en que el ATACANTE no sepa que
es falso, no en que sepa que lo detectamos.

### 3.2 No tocar la clasificación de "scanner" existente

Servir el bait no debe sacar a esa IP del contador de `scanner-detection` —
sigue contando para el ban por volumen igual que hoy. El canary es una señal
ADICIONAL, de mayor confianza, no un reemplazo.

### 3.3 Alerta diferenciada

Si el canary token se dispara (webhook/email de Thinkst, o callback propio si
se auto-hostea), la alerta a Telegram debe ser de una severidad claramente
distinta a la de "escaneo detectado" — esto sí amerita revisión humana
inmediata, a diferencia del ruido de volumen.

## 4. Trigger para implementar (no hacerlo antes)

No construir esto solo porque "sería interesante". Implementar cuando se
cumpla CUALQUIERA de:
- Un mismo IP/ASN insiste con sondeos de alta confianza en más de 1 ocasión
  separada por días (indicio de seguimiento, no de un crawler que pasa una
  vez).
- Aparece cualquier indicio de sondeo DIRIGIDO (paths específicos de esta
  empresa/dominio, no del wordlist genérico de "exposures").
- El volumen de incidentes de alta confianza sube de forma sostenida
  (referencia: hoy es ~1-2 hits aislados por semana).

## 5. Explícitamente fuera de alcance

- **Responder al atacante** (banners, mensajes en el 404 "sabemos lo que
  haces", etc.): decidido en contra — ver conversación 2026-07-20. Sin valor
  contra tráfico automatizado, y si alguna vez fuera dirigido, le regala al
  atacante información sobre tu nivel de detección.
- **Hack-back / contra-escaneo activo**: fuera de alcance legal y de esta app.
- **Fake DB/servicios auto-hosteados** (en vez de Thinkst): mayor costo de
  mantenimiento por marginal ganancia de señal — no vale la pena mientras
  Thinkst cubra el caso gratis.
