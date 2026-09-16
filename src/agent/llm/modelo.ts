import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import logger from '../../utils/logger.js';
import { AGENTE_ACTIVO } from '../checklist/alcance.js';

/**
 * EL MODELO GENERATIVO LOCAL. José, 14/09/2026: «sí a Qwen».
 *
 * Qwen2.5-1.5B-Instruct cuantizado (Q4_K_M, 1,1 GB) corriendo en la propia
 * máquina con `node-llama-cpp` (Metal en el M1). Ni una palabra del grupo sale
 * de acá: la misma regla que el clasificador de embeddings, y es la razón de
 * que sea un modelo chico y no una API.
 *
 * QUÉ HACE Y QUÉ NO. Hace dos cosas: entiende una pregunta con palabras
 * libres y ELIGE una herramienta con sus argumentos (`seleccion.ts`), y
 * REDACTA una respuesta a partir de datos que ya llegaron en JSON
 * (`redaccion.ts`). No conoce la base: solo puede pedir datos por las puertas
 * que `herramientas.ts` declara, y cada puerta devuelve campos en lista blanca.
 *
 * MEMORIA. Es una máquina de 8 GB que además sirve Portal y el storage. El
 * modelo se carga cuando hace falta (~1,3 GB residentes mientras se usa) y se
 * descarga solo tras 5 minutos sin preguntas. Las llamadas van de a una.
 *
 * SI NO ESTÁ, NO PASA NADA: sin el archivo del modelo, sin el binario, o con
 * `LLM_ACTIVO = false`, el agente sigue exactamente como antes (reglas +
 * embeddings). Todo lo de acá devuelve `null` en vez de lanzar.
 */

/** Apagar SOLO el modelo generativo (el resto del agente sigue). */
export const LLM_ACTIVO = true;

export const MODELO = {
  nombre: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  bytes: 1_117_320_736,
} as const;

/**
 * Fuera del repo y fuera de la release: `data/` es de cada release y un
 * archivo de 1,1 GB no se vuelve a bajar en cada deploy. Sin variable de
 * entorno, a propósito (regla del proyecto: constantes en código).
 */
export const DIRECTORIO_MODELOS = path.join(homedir(), '.cache', 'lila-app', 'models');
export const rutaModelo = (): string => path.join(DIRECTORIO_MODELOS, MODELO.nombre);

const CONTEXTO_TOKENS = 2048;
const OCIOSO_MS = 5 * 60_000;

/** ¿Está el archivo, completo? */
export const modeloDescargado = (): boolean => {
  try {
    return statSync(rutaModelo()).size === MODELO.bytes;
  } catch {
    return false;
  }
};

let descarga: Promise<boolean> | null = null;

/**
 * Baja el modelo si no está, en segundo plano y reanudando lo que haya. Se
 * llama al arrancar; mientras tanto el agente responde sin modelo.
 */
export const descargarModelo = (): Promise<boolean> => {
  if (!AGENTE_ACTIVO || !LLM_ACTIVO) return Promise.resolve(false);
  if (modeloDescargado()) return Promise.resolve(true);
  if (descarga) return descarga;
  descarga = (async () => {
    const destino = rutaModelo();
    const parcial = `${destino}.part`;
    try {
      mkdirSync(DIRECTORIO_MODELOS, { recursive: true });
      const desde = existsSync(parcial) ? statSync(parcial).size : 0;
      logger.info(`[agente] bajando el modelo ${MODELO.nombre} (${(MODELO.bytes / 1e9).toFixed(2)} GB)${desde ? `, reanudando en ${(desde / 1e6).toFixed(0)} MB` : ''}`);
      const res = await fetch(MODELO.url, { headers: desde ? { Range: `bytes=${desde}-` } : {}, redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reanuda = res.status === 206;
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(parcial, { flags: reanuda ? 'a' : 'w' }));
      if (statSync(parcial).size !== MODELO.bytes) throw new Error(`tamaño ${statSync(parcial).size}, esperaba ${MODELO.bytes}`);
      renameSync(parcial, destino);
      logger.info(`[agente] modelo ${MODELO.nombre} listo en ${DIRECTORIO_MODELOS}`);
      return true;
    } catch (error) {
      logger.warn(`[agente] no pude bajar el modelo: ${error instanceof Error ? error.message : String(error)}. El agente sigue sin él.`);
      try {
        if (existsSync(parcial) && statSync(parcial).size > MODELO.bytes) unlinkSync(parcial);
      } catch {
        /* nada */
      }
      return false;
    } finally {
      descarga = null;
    }
  })();
  return descarga;
};

// Los tipos vienen del módulo cargado dinámicamente (pitfall §13: nada ESM-only
// en el grafo estático). Lo justo para lo que se usa.
type Sesion = {
  prompt: (texto: string, opciones: Record<string, unknown>) => Promise<string>;
  resetChatHistory: () => void;
  dispose: () => void;
};
type Runtime = {
  llama: { createGrammarForJsonSchema: (schema: unknown) => Promise<unknown> };
  model: { createContext: (o: unknown) => Promise<unknown>; dispose: () => Promise<void> };
  context: { getSequence: () => unknown; dispose: () => Promise<void> };
  crearSesion: (systemPrompt: string) => Sesion;
  sesiones: Map<string, { sistema: string; sesion: Sesion }>;
  gramaticas: Map<string, unknown>;
};

let runtime: Runtime | null = null;
/** Cuándo se le pidió texto por última vez (consola del operador, S4). */
let ultimoUsoMs: number | null = null;
let cargando: Promise<Runtime | null> | null = null;
let cola: Promise<unknown> = Promise.resolve();
let temporizadorOcioso: NodeJS.Timeout | null = null;
let avisadoSinModelo = false;

export const cargarLlm = async (): Promise<Runtime | null> => {
  if (!AGENTE_ACTIVO || !LLM_ACTIVO) return null;
  if (runtime) return runtime;
  if (!modeloDescargado()) {
    if (!avisadoSinModelo) {
      avisadoSinModelo = true;
      logger.info('[agente] modelo generativo todavía no disponible: se responde con reglas y embeddings');
    }
    return null;
  }
  if (cargando) return cargando;
  cargando = (async () => {
    const inicio = Date.now();
    try {
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
      const llama = await getLlama({ logLevel: 'error' } as never);
      const model = await llama.loadModel({ modelPath: rutaModelo(), gpuLayers: 'auto' } as never);
      // Tres secuencias: elegir herramienta, redactar, y el agente de ventas.
      // Cada una conserva su prompt de sistema evaluado, así una pregunta solo
      // paga sus propios tokens. Un solo modelo en memoria para los dos agentes.
      const context = await model.createContext({ contextSize: CONTEXTO_TOKENS, sequences: 3 } as never);
      const rt: Runtime = {
        llama: llama as never,
        model: model as never,
        context: context as never,
        crearSesion: (systemPrompt) => new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt } as never) as unknown as Sesion,
        sesiones: new Map(),
        gramaticas: new Map(),
      };
      runtime = rt;
      logger.info(`[agente] modelo generativo cargado en ${((Date.now() - inicio) / 1000).toFixed(1)} s (${MODELO.nombre})`);
      return rt;
    } catch (error) {
      logger.warn(`[agente] no pude cargar el modelo generativo: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      cargando = null;
    }
  })();
  return cargando;
};

/** Libera la memoria del modelo. Se vuelve a cargar solo con la próxima pregunta. */
export const descargarLlm = async (): Promise<void> => {
  const rt = runtime;
  runtime = null;
  if (temporizadorOcioso) clearTimeout(temporizadorOcioso);
  temporizadorOcioso = null;
  if (!rt) return;
  try {
    for (const { sesion } of rt.sesiones.values()) sesion.dispose();
    await rt.context.dispose();
    await rt.model.dispose();
    logger.info('[agente] modelo generativo descargado de memoria por inactividad');
  } catch {
    /* ya estaba libre */
  }
};

const programarDescarga = (): void => {
  if (temporizadorOcioso) clearTimeout(temporizadorOcioso);
  temporizadorOcioso = setTimeout(() => void descargarLlm(), OCIOSO_MS);
  temporizadorOcioso.unref?.();
};

export interface PedidoDeTexto {
  /** Nombre de la tarea: identifica la sesión (y su prompt de sistema cacheado). */
  tarea: string;
  sistema: string;
  usuario: string;
  /** JSON schema (dialecto de node-llama-cpp) que fuerza la forma de la salida. */
  esquema?: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
  /** 0 por defecto (determinista); el agente de ventas usa algo de variedad. */
  temperatura?: number;
}

/**
 * Genera texto. Serializado (una llamada a la vez), con tope de tiempo, y
 * `null` ante cualquier problema: quien llama siempre tiene un camino sin
 * modelo.
 */
export const generar = (pedido: PedidoDeTexto): Promise<string | null> => {
  const turno = cola.then(async () => {
    const rt = await cargarLlm();
    if (!rt) return null;
    const inicio = Date.now();
    ultimoUsoMs = inicio;
    try {
      let entrada = rt.sesiones.get(pedido.tarea);
      if (!entrada || entrada.sistema !== pedido.sistema) {
        entrada?.sesion.dispose();
        entrada = { sistema: pedido.sistema, sesion: rt.crearSesion(pedido.sistema) };
        rt.sesiones.set(pedido.tarea, entrada);
      } else {
        entrada.sesion.resetChatHistory();
      }
      let grammar: unknown;
      if (pedido.esquema) {
        const clave = JSON.stringify(pedido.esquema);
        grammar = rt.gramaticas.get(clave) ?? (await rt.llama.createGrammarForJsonSchema(pedido.esquema));
        rt.gramaticas.set(clave, grammar);
      }
      const controlador = new AbortController();
      const timer = setTimeout(() => controlador.abort(), pedido.timeoutMs);
      try {
        const texto = await entrada.sesion.prompt(pedido.usuario, {
          grammar,
          maxTokens: pedido.maxTokens,
          temperature: pedido.temperatura ?? 0,
          signal: controlador.signal,
          stopOnAbortSignal: false,
        });
        logger.info(`[agente] llm ${pedido.tarea}: ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
        return texto;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`[agente] llm ${pedido.tarea} falló tras ${((Date.now() - inicio) / 1000).toFixed(1)} s: ${/abort/i.test(msg) ? `se pasó de ${pedido.timeoutMs / 1000} s` : msg}`);
      return null;
    } finally {
      programarDescarga();
    }
  });
  cola = turno.catch(() => undefined);
  return turno;
};

export const estadoLlm = (): { activo: boolean; descargado: boolean; cargado: boolean; nombre: string; bytes: number; ultimoUsoMs: number | null; ociosoMs: number } => ({
  activo: AGENTE_ACTIVO && LLM_ACTIVO,
  descargado: modeloDescargado(),
  cargado: runtime !== null,
  nombre: MODELO.nombre,
  bytes: MODELO.bytes,
  ultimoUsoMs,
  ociosoMs: OCIOSO_MS,
});
