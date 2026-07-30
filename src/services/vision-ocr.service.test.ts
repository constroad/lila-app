import {
  buildVisionRequest,
  extractVisionText,
  resolveVisionProvider,
  WEIGH_NOTE_PROMPT,
} from './vision-ocr.service.js';

/**
 * Lectura de imágenes por LLM (Flota §11.3-11) — adaptador AGNÓSTICO.
 *
 * El proveedor se elige por variable de entorno: hoy Gemini en su free tier,
 * mañana el que convenga. Lo que se prueba acá es justamente lo que cambia entre
 * proveedores —el armado del request y la extracción del texto de su respuesta—
 * porque es donde un cambio de API rompe en silencio.
 *
 * Sin `VISION_API_KEY` el servicio queda APAGADO: devuelve `null` en vez de tirar,
 * para que la feature simplemente no se ofrezca y el flujo de tipear el peso a mano
 * siga intacto.
 */

describe('resolveVisionProvider', () => {
  it('sin API key queda apagado (null), no lanza', () => {
    expect(resolveVisionProvider({ provider: 'gemini', apiKey: '' })).toBeNull();
    expect(resolveVisionProvider({ provider: 'gemini', apiKey: undefined })).toBeNull();
  });

  it('por defecto usa Gemini Flash-Lite (el más barato con visión)', () => {
    const resolved = resolveVisionProvider({ apiKey: 'k' });

    expect(resolved?.provider).toBe('gemini');
    expect(resolved?.model).toContain('flash-lite');
  });

  it('respeta el proveedor y el modelo declarados por entorno', () => {
    expect(resolveVisionProvider({ provider: 'anthropic', apiKey: 'k' })?.provider).toBe(
      'anthropic'
    );
    expect(
      resolveVisionProvider({ provider: 'openai-compatible', apiKey: 'k', model: 'x-vl' })?.model
    ).toBe('x-vl');
  });

  it('un proveedor desconocido queda apagado en vez de adivinar', () => {
    expect(resolveVisionProvider({ provider: 'inventado', apiKey: 'k' })).toBeNull();
  });
});

describe('buildVisionRequest', () => {
  const image = { base64: 'QUJD', mimeType: 'image/jpeg' };

  it('Gemini: la imagen va como inline_data y la key en la URL', () => {
    const request = buildVisionRequest(
      { provider: 'gemini', model: 'gemini-2.5-flash-lite', apiKey: 'KEY' },
      image
    );

    expect(request.url).toContain('generativelanguage.googleapis.com');
    expect(request.url).toContain('gemini-2.5-flash-lite');
    expect(request.url).toContain('key=KEY');
    const body = JSON.parse(request.body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg');
    expect(body.contents[0].parts[1].inline_data.data).toBe('QUJD');
  });

  it('Anthropic: la key va en header y la imagen como source.base64', () => {
    const request = buildVisionRequest(
      { provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: 'KEY' },
      image
    );

    expect(request.headers['x-api-key']).toBe('KEY');
    expect(request.headers['anthropic-version']).toBeDefined();
    const body = JSON.parse(request.body);
    expect(body.messages[0].content[0].source.data).toBe('QUJD');
  });

  /** Cubre OpenAI, DeepSeek-VL, Groq y cualquier clon: mismo formato. */
  it('OpenAI-compatible: Bearer y la imagen como data URL', () => {
    const request = buildVisionRequest(
      {
        provider: 'openai-compatible',
        model: 'gpt-4o-mini',
        apiKey: 'KEY',
        baseUrl: 'https://api.ejemplo.com/v1',
      },
      image
    );

    expect(request.url).toBe('https://api.ejemplo.com/v1/chat/completions');
    expect(request.headers.Authorization).toBe('Bearer KEY');
    const body = JSON.parse(request.body);
    expect(body.messages[0].content[1].image_url.url).toBe('data:image/jpeg;base64,QUJD');
  });

  it('el prompt pide el texto CRUDO, sin interpretar los pesos', () => {
    // Interpretar es tarea del parser probado en Portal: si el LLM "corrige" un
    // peso, el ticket y el sistema dejan de coincidir y nadie puede auditarlo.
    expect(WEIGH_NOTE_PROMPT).toMatch(/transcribe/i);
    expect(WEIGH_NOTE_PROMPT).toMatch(/no interpretes|sin interpretar|no corrijas/i);
  });
});

describe('extractVisionText', () => {
  it('Gemini: saca el texto de candidates[0]', () => {
    const text = extractVisionText('gemini', {
      candidates: [{ content: { parts: [{ text: 'PESO NETO 21,250 KG' }] } }],
    });

    expect(text).toBe('PESO NETO 21,250 KG');
  });

  it('Anthropic: saca el texto de content[0]', () => {
    expect(extractVisionText('anthropic', { content: [{ type: 'text', text: 'TARA 11,200' }] })).toBe(
      'TARA 11,200'
    );
  });

  it('OpenAI-compatible: saca el texto de choices[0].message', () => {
    expect(
      extractVisionText('openai-compatible', {
        choices: [{ message: { content: 'BRUTO 32,450' } }],
      })
    ).toBe('BRUTO 32,450');
  });

  /**
   * Una respuesta con otra forma (cambio de API, error del proveedor) devuelve
   * `null`: mejor "no se pudo leer" que un texto vacío que el parser trataría como
   * un ticket ilegible.
   */
  it('una respuesta con forma inesperada devuelve null', () => {
    expect(extractVisionText('gemini', { error: { message: 'quota' } })).toBeNull();
    expect(extractVisionText('gemini', {})).toBeNull();
    expect(extractVisionText('anthropic', { content: [] })).toBeNull();
  });
});
