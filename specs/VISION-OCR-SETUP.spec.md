# Lectura de tickets de balanza por LLM (Flota §11.3-11)

> **Estado: implementado y APAGADO.** El código está listo; falta la API key.
> Mientras no exista `VISION_API_KEY`, el endpoint responde 503 y el flujo actual
> —el peso se ingresa a mano— sigue exactamente igual. Nada se rompe por no
> activarlo.

## Por qué existe

El ticket de balanza es papel térmico fotografiado en la cancha: sol, doblado, a
veces mojado. De esos pesos sale la factura (merma penalizada, peso facturable,
flete por tonelada), así que el diseño tiene dos límites que **no se negocian**:

1. **El LLM solo TRANSCRIBE.** No interpreta ni corrige pesos. Si "corrigiera" un
   dígito, el ticket físico y el sistema dejarían de coincidir y nadie podría
   auditar la diferencia. La validación (`bruto − tara = neto`), la conversión a
   toneladas y el cotejo de placa los hace `weighNoteParser.ts` en Portal
   (13 tests), y **el peso lo confirma una persona** — nunca se escribe solo.
2. **Agnóstico al proveedor.** El precio y los límites de los LLM cambian cada
   pocos meses; cambiar de proveedor debe ser cambiar dos variables de entorno, no
   tocar código.

## Por qué Gemini y no otro (análisis del 29/07/2026)

| Opción | Veredicto |
| --- | --- |
| **Gemini Flash-Lite** | ✅ Elegido. Tiene free tier sin tarjeta, y pagando cuesta **~$0.0002 por ticket** ($0.10 / 1M tokens de entrada). Cero RAM en la Mac mini. |
| DeepSeek | ❌ Es **solo texto** en 2026: no acepta imágenes. Barato pero inservible acá. |
| Claude / OpenAI | ⚠️ Funcionan (el adaptador los soporta) pero cuestan más por la misma tarea. |
| Modelo local (Ollama/llava) | ❌ Ocupa 5–6 GB **residentes** en la Mac mini, que ya corre lila + Mongo + Puppeteer. Es cómo se repite el incidente de swap agotado, y esta vez tumbando producción. |

**Límite del free tier de Gemini:** Google lo recortó en diciembre de 2025 (lo
confirmó Logan Kilpatrick en su foro oficial) y **dejó de publicar la tabla en la
documentación** — ahora solo se ve dentro de AI Studio con la cuenta propia. Los
usuarios reportan **~20 requests por día**. Alcanza para probar la feature con
tickets reales; no alcanza para producción. Cuando quede corto, habilitar billing
cuesta centavos al mes con este volumen.

## Step by step para activarlo

1. **Conseguir la key (gratis, sin tarjeta).** Entrar a
   [Google AI Studio](https://aistudio.google.com/apikey) con la cuenta de Google
   de la empresa → *Create API key* → copiar el valor (empieza con `AIza…`).
2. **Ver el límite real del proyecto** en
   [AI Studio → Rate limits](https://aistudio.google.com/rate-limit): Google
   muestra ahí el RPD/RPM vigente para esa cuenta, que es el número que manda.
3. **Ponerla en el `.env` de lila** (la Mac mini, donde corre producción):
   ```bash
   VISION_API_KEY=AIza...          # la key del paso 1
   VISION_PROVIDER=gemini          # opcional: es el default
   VISION_MODEL=                   # opcional: vacío = gemini-2.5-flash-lite
   ```
4. **Reiniciar el proceso de lila.** El `.env` se lee al arrancar: sin reiniciar, el
   endpoint sigue respondiendo 503 (mismo gotcha que `CRON_SECRET`).
5. **Verificar que quedó activo:**
   ```bash
   curl -i -X POST http://localhost:3001/api/vision/weigh-note \
     -H "Authorization: Bearer <JWT de Portal>" \
     -H "Content-Type: application/json" \
     -d '{"base64":"<foto en base64>","mimeType":"image/jpeg"}'
   ```
   - `503 vision-not-configured` → la key no se leyó (¿reiniciaste?).
   - `200 { ok: true, text: "..." }` → funcionando.
   - `429 vision-daily-cap` → se alcanzó el tope propio de 60/día por empresa.
6. **Cablear el botón en Portal** (pendiente de desarrollo, no operativo): subir la
   foto del ticket → llamar a este endpoint → pasar el texto por
   `weighNoteParser` → mostrar la propuesta con «Usar este peso». Hasta entonces la
   feature no es visible para el usuario.

## Cambiar de proveedor después

Sin tocar código:

```bash
# Claude
VISION_PROVIDER=anthropic
VISION_API_KEY=sk-ant-...
VISION_MODEL=claude-sonnet-4-20250514

# Cualquier API compatible con OpenAI (Groq, OpenAI, un DeepSeek con visión el día
# que exista, un modelo propio)
VISION_PROVIDER=openai-compatible
VISION_API_KEY=...
VISION_BASE_URL=https://api.groq.com/openai/v1
VISION_MODEL=llama-vision
```

## Protecciones de costo que ya están en el código

Porque esto pega a una API que se paga por uso:

- **Sin credencial → 503**, no 500: la feature no existe hasta configurarla, y
  ninguna pantalla se cae por eso.
- **Tope de 60 imágenes por empresa y por día** (contador en memoria del proceso).
  Es un freno de mano contra bucles de reintento, no una cuota contable: la cuota
  real la impone el proveedor.
- **Tope de 4 MB por imagen** y `temperature: 0`. Una foto de 12 MP son tokens
  pagados de más sin leer mejor un ticket.
- **Timeout de 25 s** y ruta **solo admin** (`requireTenant` + rate limiter
  estricto por empresa). Un endpoint de visión abierto es una factura abierta.
- **El detalle del error del proveedor va al log, nunca al cliente**: puede traer
  la cuota, el modelo o parte de la credencial.

## Superficie

- `src/services/vision-ocr.service.ts` — adaptador agnóstico (12 tests):
  `resolveVisionProvider`, `buildVisionRequest`, `extractVisionText`,
  `WEIGH_NOTE_PROMPT`.
- `src/api/controllers/vision.controller.ts` + `src/api/routes/vision.routes.ts` —
  `POST /api/vision/weigh-note`.
- `src/config/environment.ts` → `config.vision`.
- Portal: `src/server/fleet/weighNoteParser.ts` (13 tests) consume el texto.
