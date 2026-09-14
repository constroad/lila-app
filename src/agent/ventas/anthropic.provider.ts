import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages.js';
import { config } from '../../config/environment.js';
import type { BloqueSistema, ProveedorLlm, RespuestaLlm, TurnoChat, EspecificacionHerramienta } from './llm.types.js';

/**
 * ANTHROPIC como proveedor del agente de ventas. Haiku 4.5: el más barato con
 * uso de herramientas confiable (spec §4.2, decisión v1). Los bloques de
 * sistema marcados `cacheable` llevan `cache_control`: la persona, las reglas
 * y los servicios se pagan una vez y se leen a 10 % en cada turno.
 *
 * La clave ya vive en el `.env` de producción (`ANTHROPIC_API_KEY`, la usan
 * otras piezas). Sin clave, el proveedor no se construye y el agente no
 * contesta: nunca un fallback silencioso a otro proveedor.
 */

export const MODELO_VENTAS = 'claude-haiku-4-5-20251001';

const aMensajes = (turnos: TurnoChat[]): MessageParam[] =>
  turnos.map((t) => {
    if (t.rol === 'usuario') return { role: 'user', content: t.texto };
    if (t.rol === 'resultado') {
      return {
        role: 'user',
        content: t.resultados.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.contenido, ...(r.error ? { is_error: true } : {}) })) as ContentBlockParam[],
      };
    }
    const content: ContentBlockParam[] = [];
    if (t.texto) content.push({ type: 'text', text: t.texto });
    for (const l of t.llamadas ?? []) content.push({ type: 'tool_use', id: l.id, name: l.nombre, input: l.argumentos });
    return { role: 'assistant', content };
  });

const aHerramientas = (lista: EspecificacionHerramienta[]): Tool[] =>
  lista.map((h) => ({ name: h.nombre, description: h.descripcion, input_schema: h.parametros as Tool['input_schema'] }));

export const crearProveedorAnthropic = (): ProveedorLlm | null => {
  const apiKey = String(config.anthropic?.apiKey || '').trim();
  if (!apiKey) return null;
  const cliente = new Anthropic({ apiKey });
  return {
    nombre: `anthropic:${MODELO_VENTAS}`,
    async chat({ sistema, turnos, herramientas, maxTokens, timeoutMs }): Promise<RespuestaLlm> {
      const system = sistema.map((b: BloqueSistema) => ({
        type: 'text' as const,
        text: b.texto,
        ...(b.cacheable ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }));
      const respuesta = await cliente.messages.create(
        {
          model: MODELO_VENTAS,
          max_tokens: maxTokens,
          system,
          messages: aMensajes(turnos),
          tools: herramientas.length ? aHerramientas(herramientas) : undefined,
        },
        { timeout: timeoutMs }
      );
      const texto = respuesta.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      const llamadas = respuesta.content
        .filter((b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use')
        .map((b) => ({ id: b.id, nombre: b.name, argumentos: (b.input ?? {}) as Record<string, unknown> }));
      const uso = respuesta.usage as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
      return {
        texto: texto || undefined,
        llamadas: llamadas.length ? llamadas : undefined,
        uso: { entrada: uso.input_tokens, salida: uso.output_tokens, cacheLeida: uso.cache_read_input_tokens ?? undefined, cacheEscrita: uso.cache_creation_input_tokens ?? undefined },
        motivo: respuesta.stop_reason === 'tool_use' ? 'herramientas' : respuesta.stop_reason === 'max_tokens' ? 'tope' : 'fin',
      };
    },
  };
};
