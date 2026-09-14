/**
 * EL PROVEEDOR DE LLM DEL AGENTE DE VENTAS (WHATSAPP-AGENT-VERTICALS §4.2).
 *
 * Una interfaz y nada del proveedor afuera de su adapter: el runtime arma
 * bloques de sistema, turnos y herramientas, y recibe texto o llamadas a
 * herramientas. Anthropic es la implementación v1 (Haiku 4.5, prompt
 * caching); un endpoint compatible con OpenAI o un modelo local entrarían
 * como otro adapter sin tocar el runtime.
 */

export interface BloqueSistema {
  texto: string;
  /** Se cachea del lado del proveedor: va primero y cambia poco (persona, reglas, servicios). */
  cacheable?: boolean;
}

export type TurnoChat =
  | { rol: 'usuario'; texto: string }
  | { rol: 'asistente'; texto?: string; llamadas?: LlamadaHerramienta[] }
  | { rol: 'resultado'; resultados: ResultadoHerramienta[] };

export interface EspecificacionHerramienta {
  nombre: string;
  descripcion: string;
  /** JSON schema de los argumentos. */
  parametros: Record<string, unknown>;
}

export interface LlamadaHerramienta {
  id: string;
  nombre: string;
  argumentos: Record<string, unknown>;
}

export interface ResultadoHerramienta {
  id: string;
  contenido: string;
  error?: boolean;
}

export interface UsoTokens {
  entrada: number;
  salida: number;
  cacheLeida?: number;
  cacheEscrita?: number;
}

export interface RespuestaLlm {
  texto?: string;
  llamadas?: LlamadaHerramienta[];
  uso: UsoTokens;
  /** `fin`: terminó de hablar; `herramientas`: pide ejecutar las llamadas; `tope`: se quedó sin tokens. */
  motivo: 'fin' | 'herramientas' | 'tope';
}

export interface ProveedorLlm {
  nombre: string;
  chat(params: {
    sistema: BloqueSistema[];
    turnos: TurnoChat[];
    herramientas: EspecificacionHerramienta[];
    maxTokens: number;
    timeoutMs: number;
  }): Promise<RespuestaLlm>;
}
