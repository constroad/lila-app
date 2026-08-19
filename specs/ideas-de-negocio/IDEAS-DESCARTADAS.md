# Ideas de negocio evaluadas y DESCARTADAS

> Documentar los "no" vale tanto como los "sí": evita re-evaluar dentro de tres
> meses lo mismo que ya se estudió, y deja explícito bajo qué condición el "no"
> podría cambiar.

## Filtro que se aplica a toda idea nueva

Tres preguntas. Si falla una, se descarta o se pospone:

1. **¿Puedo cobrar en semanas?** (la restricción real es caja, no ambición)
2. **¿Compito contra gratis?** (si el líder tiene free tier en español, el precio
   ya no es palanca)
3. **¿Necesito permiso de una plataforma para operar?** (aprobaciones = meses sin
   ingreso)

El bot de WhatsApp por verticales pasa las tres. Lo de abajo, no.

---

## 1. App de gestión de publicidad en redes sociales (IG/FB/TikTok)

**Fecha:** 30/07/2026. **Origen:** sugerencia de un conocido.
**Idea:** dashboard para programar y publicar en Instagram, Facebook y TikTok,
más generación de imágenes/videos publicitarios con IA.

**Veredicto: NO como producto propio.**

### Por qué

**a) El mercado está saturado y el competidor es gratis.** El prospecto peruano
compararía contra un free tier en español:

| Producto | Precio | Qué hace |
|---|---|---|
| Metricool | **Gratis** (1 marca, 20 posts/mes) → $22–25/mes | Publicar IG/FB/TikTok, inbox, analítica, reportes de ads. Fuerte en LATAM |
| Buffer | Gratis → ~$20/mes | Programación multi-red, estándar para solopreneurs |
| Publer / Later / SocialPilot | $20–100/mes | Mismo espacio pyme |
| Predis.ai | $19/mes | Un brief → Reel 9:16 + carrusel 1:1 + corte 16:9, con IA |
| AdCreative.ai | $39–599/mes | Creativos de ads con scoring de CTR predicho |
| WASK | $15/mes | Creativos + gestión de ads, low-cost |

La parte "innovadora" (generar creativos con IA) ya la venden una docena de
players desde $15–19/mes.

**b) Las APIs bloquean la entrada durante meses.** Para publicar en cuentas de
terceros:
- **Meta (IG/FB):** App Review obligatorio, **2–4 semanas por permiso**, cada uno
  con su screencast, más **Business Verification** para Advanced Access. Solo
  funciona con cuentas Professional vinculadas a una página de Facebook.
- **TikTok:** aprobación manual **2–6 semanas**, caso de uso documentado y demo
  funcionando; cada rechazo suma 1–2 semanas.

Total: **2–3 meses antes de poder publicar en la cuenta de un cliente**, antes de
escribir el dashboard. Es exactamente lo contrario a la restricción de caja.

### Lo que SÍ se rescató de la idea

El diagnóstico de fondo era correcto: los negocios chicos sufren con sus redes.
Pero su problema no es *gestionar* publicaciones — es que **no tienen contenido
ni tiempo para crearlo**. Y nuestro bot tiene algo que Metricool no: **conoce el
negocio por dentro** (catálogo, precios, qué se vendió, horas pico).

**Feature futura (post-F6), no producto:** cada jueves el bot manda al dueño por
WhatsApp una imagen promocional lista (su plato top de la semana, con sus colores
y precios reales) + caption + hashtags. El dueño responde "✓" y la publica él en
30 segundos.

Ventajas: **cero APIs de Meta/TikTok** (publica el dueño desde su teléfono; la
distribución es WhatsApp, que ya tenemos), cero dashboard nuevo, contenido con
datos reales que Predis/Canva no pueden tener, y una razón más cada semana para
no cancelar. Se cobra como add-on (+S/49/mes) o se incluye en un plan superior.

### Bajo qué condición cambiaría el "no"

Si con 50+ clientes activos la mayoría pide auto-publicación, *ahí* se solicita
el API de Meta — con ingresos recurrentes financiando los 2–3 meses de espera.
Nunca antes.

---

## 2. Apps RN tipo Google Drive / streaming (mención suelta)

**Fecha:** consultado el 19/08/2026. Nunca hubo un análisis: se buscó en todos
los transcripts y no existe tal conversación documentada. Lo que sí existe y
probablemente se confundió:

- **LilaStore** (`../../../lilastore` + `../../../lilastore-app`): tienda privada
  de apps Android, Expo/RN. Es "como Google **Play**", no Drive. Fase 4 sin
  empezar.
- **Drive de lila-app**: drive multi-tenant con thumbnails, preview y render de
  PDF, ya en producción. Las menciones a "como Google Drive" en sesiones previas
  se referían a imitar su UX en el visor de PDF de Portal.
- **`../../../STREAMING-THUMBNAILS-LILA-APP.spec.md`**: streaming de video y
  thumbnails en lila + Portal (marzo 2026, sin implementar).
- **`../../../portable-screen-recorder`**: ScreenRecorderKit + LessonPlayerKit
  (grabar pantalla + reproductor estilo YouTube). Lo más cercano a "streaming"
  que ya está construido.

**Estado:** sin evaluar como negocio. Si se retoma, pasar por el filtro de arriba
antes de escribir una línea de código.
