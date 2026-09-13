import logger from '../../utils/logger.js';
import { itemSatisfecho, normalizarTexto, type ChecklistItem, type Revision } from './checklist.js';
import { AGENTE_ACTIVO } from './alcance.js';

/**
 * ENTENDER UNA CONFIRMACIÓN ESCRITA COMO HABLA LA GENTE.
 *
 * El matcher literal (`itemSatisfecho`) reconoce «avisé a planta» y no «le dije
 * a planta», «planta ya está enterada» ni «ya cargamos el diesel». Medido el
 * 12/09/2026 sobre 19 mensajes reales: literal 9/19, embeddings 17/19. Los dos
 * que quedan son conceptos sin frase semilla, que se arreglan agregando
 * semillas — no cambiando de modelo.
 *
 * CÓMO: cada ítem tiene frases semilla (`seSatisfaceCon`); su CENTROIDE es el
 * promedio de sus vectores. Una cláusula del grupo confirma el ítem cuyo
 * centroide le queda más cerca, si la similitud pasa el umbral. Argmax, no «el
 * primero que pasa»: varios ítems pueden superar el umbral y el orden de
 * declaración no es un criterio.
 *
 * LOS FILTROS VAN ANTES, no después. Los embeddings NO codifican negación ni
 * pregunta: «¿ya avisaron a planta?» y «no avisé a planta» quedan a 0.94 y 0.90
 * de «avisé a planta». Por eso este módulo recibe cláusulas que YA pasaron por
 * `filtrarMensajes` (sin preguntas, sin negaciones, sin lo propio del bot).
 *
 * LOCAL, porque el texto del grupo no sale de la máquina (José, 12/09: «no
 * puede ir a la API de Anthropic»). `multilingual-e5-small`: 120 MB en disco,
 * ~600 MB cargado, 3 ms por cláusula en la mini. Se carga la primera vez que
 * hace falta —18 s— y se queda. Si no se puede cargar, se dice UNA vez en el
 * log y se sigue con el matcher literal: un agente que entiende menos es mejor
 * que uno caído.
 *
 * El paquete se importa DINÁMICAMENTE (pitfall §13): es ESM-only y este módulo
 * cuelga del grafo del detector.
 */

export type Embed = (textos: string[]) => Promise<number[][]>;

/** Medido: por debajo empiezan los falsos positivos entre ítems parecidos. */
export const UMBRAL_SIMILITUD = 0.86;
const MODELO = 'Xenova/multilingual-e5-small';

let embedCargado: Embed | null = null;
let cargaFallida = false;

/** Solo para tests. */
export const _resetSemantica = (): void => {
  embedCargado = null;
  cargaFallida = false;
  centroides.clear();
};

/**
 * El modelo, cargado una vez. `null` si no se pudo: el detector sigue sin él.
 */
export const cargarModelo = async (): Promise<Embed | null> => {
  if (!AGENTE_ACTIVO) return null; // sin agente, sin 600 MB
  if (embedCargado) return embedCargado;
  if (cargaFallida) return null;
  const inicio = Date.now();
  try {
    const { pipeline } = await import('@huggingface/transformers');
    // El modelo se cachea dentro del `node_modules` del paquete, que en la mini
    // es compartido entre releases (`nm-cache`): se baja una vez por cambio de
    // dependencias, no por deploy.
    const extractor = await pipeline('feature-extraction', MODELO, { dtype: 'q8' });
    embedCargado = async (textos: string[]) => {
      // «query: » es el prefijo con el que e5 fue entrenado para textos cortos.
      const salida = await extractor(
        textos.map((t) => `query: ${t}`),
        { pooling: 'mean', normalize: true }
      );
      return (salida as { tolist(): number[][] }).tolist();
    };
    logger.info(
      `[agente] modelo semántico cargado (${MODELO}) en ${((Date.now() - inicio) / 1000).toFixed(1)} s, ` +
        `RSS ${Math.round(process.memoryUsage().rss / 1e6)} MB`
    );
    return embedCargado;
  } catch (error) {
    cargaFallida = true;
    logger.warn(
      `[agente] no pude cargar el modelo semántico; sigo con el matcher literal: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
};

const coseno = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * b[i], 0);

/** Centroides por ítem, calculados una vez por conjunto de semillas. */
const centroides = new Map<string, number[]>();

/** Lo mínimo que hace falta para clasificar: un id y sus semillas. El checklist y el catálogo de consultas lo cumplen. */
export interface Clasificable {
  id: string;
  seSatisfaceCon: string[];
}

const claveDe = (item: Clasificable): string => `${item.id}|${item.seSatisfaceCon.join('|')}`;

const centroideDe = async (item: Clasificable, embed: Embed): Promise<number[]> => {
  const clave = claveDe(item);
  const cacheado = centroides.get(clave);
  if (cacheado) return cacheado;
  const vectores = await embed(item.seSatisfaceCon);
  const dim = vectores[0]?.length ?? 0;
  const centroide = Array.from({ length: dim }, (_, i) =>
    vectores.reduce((s, v) => s + v[i], 0) / vectores.length
  );
  centroides.set(clave, centroide);
  return centroide;
};

export interface Coincidencia {
  itemId: string;
  clausula: string;
  similitud: number;
}

/**
 * Qué ítem confirma cada cláusula, si alguno. Puro dado `embed`: se testea
 * con un embed de mentira.
 */
export const clasificar = async (
  items: Clasificable[],
  clausulas: string[],
  embed: Embed
): Promise<Coincidencia[]> => {
  const limpias = clausulas.map((c) => normalizarTexto(c)).filter(Boolean);
  if (limpias.length === 0 || items.length === 0) return [];

  const cents = await Promise.all(items.map((i) => centroideDe(i, embed)));
  const vectores = await embed(limpias);

  const coincidencias: Coincidencia[] = [];
  vectores.forEach((v, idx) => {
    let mejor = -1;
    let mejorS = -1;
    cents.forEach((c, j) => {
      const s = coseno(v, c);
      if (s > mejorS) {
        mejorS = s;
        mejor = j;
      }
    });
    if (mejor >= 0 && mejorS >= UMBRAL_SIMILITUD) {
      coincidencias.push({ itemId: items[mejor].id, clausula: limpias[idx], similitud: mejorS });
    }
  });
  return coincidencias;
};

/**
 * La revisión con entendimiento: un ítem está resuelto si lo confirma el
 * matcher literal O una cláusula semánticamente cercana. Sin modelo, es
 * exactamente `evaluarRevision`.
 */
export const evaluarRevisionSemantica = async (
  items: ChecklistItem[],
  clausulas: string[],
  opciones: { soloCriticos?: boolean; embed?: Embed | null; negadas?: string[] } = {}
): Promise<Revision & { semanticas: Coincidencia[] }> => {
  const considerados = opciones.soloCriticos ? items.filter((i) => i.critico) : items;
  const embed = opciones.embed === undefined ? await cargarModelo() : opciones.embed;
  const negadas = opciones.negadas ?? [];

  // Las cláusulas NEGADAS nunca pasan por el embedding: las negaciones
  // comparten estructura («no hay…», «no lleva…») y el modelo las junta —
  // medido en la mini el 13/09: «no avisé a planta» cayó a 0.88 de «no lleva
  // imprimación». Para los ítems cuya respuesta buena es un «no», las negadas
  // se comparan solo LITERALMENTE contra sus semillas, que son explícitas.
  const semanticas = embed ? await clasificar(considerados, clausulas, embed) : [];
  const porSemantica = new Set(semanticas.map((c) => c.itemId));

  const pendientes: ChecklistItem[] = [];
  const resueltos: ChecklistItem[] = [];
  for (const item of considerados) {
    const ok =
      itemSatisfecho(item, clausulas) ||
      (item.laNegacionConfirma && itemSatisfecho(item, negadas)) ||
      porSemantica.has(item.id);
    (ok ? resueltos : pendientes).push(item);
  }
  return { pendientes, resueltos, semanticas };
};
