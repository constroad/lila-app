/**
 * Lectura de imágenes por LLM — adaptador AGNÓSTICO al proveedor (Flota §11.3-11).
 *
 * Se usa para transcribir tickets de balanza fotografiados en la cancha: papel
 * térmico, con sol, doblado. De esos pesos sale la factura, así que el diseño tiene
 * dos límites duros:
 *
 * 1. **El LLM solo TRANSCRIBE.** No interpreta ni corrige pesos: si "corrigiera" un
 *    dígito, el ticket físico y el sistema dejarían de coincidir y nadie podría
 *    auditar la diferencia. La validación (bruto − tara = neto) la hace el parser
 *    de Portal (`weighNoteParser`, 13 tests) y la confirma una persona.
 * 2. **Sin `VISION_API_KEY` el servicio queda APAGADO** y devuelve `null`. La
 *    feature no se ofrece y el flujo de tipear el peso sigue igual — nunca se cae
 *    una pantalla por no tener credencial.
 *
 * El proveedor se elige por entorno (`VISION_PROVIDER`), porque el precio y los
 * límites de los proveedores cambian cada pocos meses. Hoy conviene Gemini
 * Flash-Lite: tiene free tier y, pagando, la lectura de un ticket cuesta ~$0.0002.
 * Cambiar de proveedor es cambiar dos variables, no tocar código.
 */

export type VisionProviderName = 'gemini' | 'anthropic' | 'openai-compatible';

export type VisionConfig = {
  provider: VisionProviderName;
  model: string;
  apiKey: string;
  /** Solo para `openai-compatible` (DeepSeek, Groq, OpenAI, cualquier clon). */
  baseUrl?: string;
};

export type VisionImage = { base64: string; mimeType: string };

/** Modelo por defecto de cada proveedor: el más barato que lee imágenes. */
const DEFAULT_MODELS: Record<VisionProviderName, string> = {
  gemini: 'gemini-2.5-flash-lite',
  anthropic: 'claude-sonnet-4-20250514',
  'openai-compatible': 'gpt-4o-mini',
};

const ANTHROPIC_VERSION = '2023-06-01';
const MAX_OUTPUT_TOKENS = 700;

/**
 * Transcripción literal, sin interpretación. El prompt es parte del contrato: si
 * alguien lo cambia para que el modelo "devuelva el peso neto", el sistema empieza
 * a facturar sobre el juicio de un LLM en vez de sobre el ticket.
 */
export const WEIGH_NOTE_PROMPT = [
  'Transcribe TODO el texto visible de este ticket de balanza, línea por línea,',
  'tal como aparece impreso. Conserva los números exactamente como están',
  '(incluyendo comas y puntos) y las etiquetas en su idioma original.',
  'No interpretes, no corrijas ni completes valores: si un dígito no se lee,',
  'escribe un signo de interrogación en su lugar. No agregues comentarios.',
].join(' ');

/**
 * Configuración efectiva, o `null` si no hay credencial / el proveedor no se
 * reconoce. Nunca lanza: la ausencia de configuración es un estado válido.
 */
export function resolveVisionProvider(env: {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): VisionConfig | null {
  const apiKey = String(env.apiKey ?? '').trim();
  if (!apiKey) return null;

  const provider = (String(env.provider ?? 'gemini').trim() || 'gemini') as VisionProviderName;
  if (!(provider in DEFAULT_MODELS)) return null;

  return {
    provider,
    model: String(env.model ?? '').trim() || DEFAULT_MODELS[provider],
    apiKey,
    baseUrl: env.baseUrl?.trim() || undefined,
  };
}

export type VisionRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

/** Arma el HTTP de cada proveedor: es lo único que difiere entre ellos. */
export function buildVisionRequest(config: VisionConfig, image: VisionImage): VisionRequest {
  if (config.provider === 'gemini') {
    return {
      // Gemini lleva la credencial en la query string (así lo define su API).
      url: `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: WEIGH_NOTE_PROMPT },
              { inline_data: { mime_type: image.mimeType, data: image.base64 } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0 },
      }),
    };
  }

  if (config.provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: image.mimeType, data: image.base64 },
              },
              { type: 'text', text: WEIGH_NOTE_PROMPT },
            ],
          },
        ],
      }),
    };
  }

  const baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  return {
    url: `${baseUrl}/chat/completions`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: WEIGH_NOTE_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
            },
          ],
        },
      ],
    }),
  };
}

/**
 * Texto de la respuesta, o `null` si vino con otra forma (error del proveedor,
 * cambio de API, cuota agotada). Se prefiere "no se pudo leer" a un texto vacío
 * que el parser trataría como un ticket ilegible.
 */
export function extractVisionText(provider: VisionProviderName, payload: unknown): string | null {
  const data = payload as Record<string, any>;
  if (!data || typeof data !== 'object') return null;

  const raw =
    provider === 'gemini'
      ? data.candidates?.[0]?.content?.parts?.[0]?.text
      : provider === 'anthropic'
        ? data.content?.find?.((part: { type?: string }) => part?.type === 'text')?.text
        : data.choices?.[0]?.message?.content;

  const text = typeof raw === 'string' ? raw.trim() : '';
  return text.length > 0 ? text : null;
}
