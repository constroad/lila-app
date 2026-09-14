import type { BloqueSistema, EspecificacionHerramienta, ProveedorLlm, RespuestaLlm, TurnoChat } from './llm.types.js';

/**
 * PROVEEDOR COMPATIBLE CON OPENAI (spec §4.2): Groq, DeepSeek, OpenRouter, un
 * `llama.cpp` local con `--api`… cualquiera que hable `/v1/chat/completions`
 * con function calling. Sin SDK: un `fetch`. Se elige poniendo `LLM_BASE_URL`,
 * `LLM_API_KEY` y `LLM_MODEL` en el `.env` (la clave no puede vivir en código).
 */

export interface ConfigOpenAiCompat {
  baseUrl: string;
  apiKey: string;
  modelo: string;
}

type MensajeOpenAi =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

export const aMensajesOpenAi = (sistema: BloqueSistema[], turnos: TurnoChat[]): MensajeOpenAi[] => {
  const mensajes: MensajeOpenAi[] = [{ role: 'system', content: sistema.map((b) => b.texto).join('\n\n') }];
  for (const t of turnos) {
    if (t.rol === 'usuario') mensajes.push({ role: 'user', content: t.texto });
    else if (t.rol === 'asistente') {
      mensajes.push({
        role: 'assistant',
        content: t.texto ?? null,
        ...(t.llamadas?.length ? { tool_calls: t.llamadas.map((l) => ({ id: l.id, type: 'function' as const, function: { name: l.nombre, arguments: JSON.stringify(l.argumentos) } })) } : {}),
      });
    } else for (const r of t.resultados) mensajes.push({ role: 'tool', tool_call_id: r.id, content: r.contenido });
  }
  return mensajes;
};

const aTools = (lista: EspecificacionHerramienta[]) =>
  lista.map((h) => ({ type: 'function' as const, function: { name: h.nombre, description: h.descripcion, parameters: h.parametros } }));

const parsearArgumentos = (texto: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(texto || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export const crearProveedorOpenAiCompat = (cfg: ConfigOpenAiCompat): ProveedorLlm => ({
  nombre: `openai-compat:${cfg.modelo}`,
  async chat({ sistema, turnos, herramientas, maxTokens, timeoutMs }): Promise<RespuestaLlm> {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.modelo,
          max_tokens: maxTokens,
          temperature: 0.4,
          messages: aMensajesOpenAi(sistema, turnos),
          ...(herramientas.length ? { tools: aTools(herramientas), tool_choice: 'auto' } : {}),
        }),
        signal: controlador.signal,
      });
      if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
      };
      const eleccion = data.choices?.[0];
      const llamadas = (eleccion?.message?.tool_calls ?? []).map((c) => ({ id: c.id, nombre: c.function.name, argumentos: parsearArgumentos(c.function.arguments) }));
      const texto = String(eleccion?.message?.content || '').trim();
      return {
        texto: texto || undefined,
        llamadas: llamadas.length ? llamadas : undefined,
        uso: { entrada: data.usage?.prompt_tokens ?? 0, salida: data.usage?.completion_tokens ?? 0, cacheLeida: data.usage?.prompt_tokens_details?.cached_tokens },
        motivo: llamadas.length ? 'herramientas' : eleccion?.finish_reason === 'length' ? 'tope' : 'fin',
      };
    } finally {
      clearTimeout(timer);
    }
  },
});
