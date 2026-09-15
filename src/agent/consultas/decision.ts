/**
 * La DECISIÓN de una consulta, separada de su ejecución.
 *
 * ─── POR QUÉ EXISTE ────────────────────────────────────────────────────────
 * `atenderConsulta` decidía y ejecutaba en la misma función: reglas, lista
 * negra, herramientas por palabra, rango, modelo… entre `fetch`, «escribiendo…»
 * y envíos al grupo. Consecuencia: el examen de punta a punta (§13.5.5 del spec)
 * no se podía escribir, y los tests probaban funciones sueltas. El 15/09 a las
 * 15:13 una pregunta pasaba `rutearPorReglas` y fallaba igual, porque otra
 * capa —`herramientaDeDatosPorReglas`— la pisaba más adelante. Nadie lo vio
 * porque nada corría la pregunta ENTERA por el mismo camino que un mensaje.
 *
 * Acá vive ese camino, sin IO: dada la pregunta limpia y «ahora», devuelve QUÉ
 * se haría. `atenderConsulta` la ejecuta; `evaluacion/examen` la interroga con
 * el corpus. El único paso que no está acá es el modelo (`sinRuta`): la
 * decisión dice `modelo` y quien la ejecuta lo consulta.
 *
 * La precedencia es EXACTAMENTE la de `atenderConsulta` del 15/09; si cambia
 * acá, cambia allá, y el examen lo mide.
 */
import { especificidadDeRegla, extraerParametros, fueraDeCatalogo, rutearPorReglas, temaSinDato, type ClaveConsulta, type Parametros } from './catalogo.js';
import { pareceParaElAgente } from './contexto.js';
import { argumentosDeRango, herramientaDeDatosPorReglas, normalizarArgumentos, type Argumentos, type HerramientaDeDatos } from '../llm/index.js';
import { esOrdenDeAvisoAPlanta } from './orden-planta.js';

/** Desde cuántas palabras una pregunta va primero al modelo y no a las reglas. */
export const PALABRAS_PARA_MODELO = 12;

/** Las consultas que hablan de UN día: con un rango en la pregunta, es la programación o el historial del rango. */
export const esDeUnDia = (clave: ClaveConsulta | null): boolean => clave === 'orders_day' || clave === 'dispatch_summary' || clave === 'day_progress';

export type Decision =
  /** «Manda el aviso a planta»: una orden, no una consulta. */
  | { tipo: 'orden_planta' }
  /** Un dato que no se registra (temperatura…): se dice de frente. */
  | { tipo: 'sin_dato'; texto: string }
  /** Lista negra (precios, pagos…): ni reglas, ni modelo, ni embeddings. */
  | { tipo: 'vetada' }
  /** Herramienta de datos reconocida por palabra, con los argumentos que el código lee. */
  | { tipo: 'datos'; herramienta: HerramientaDeDatos; argumentos: Argumentos }
  /** Consulta del catálogo, con los parámetros extraídos de la pregunta. */
  | { tipo: 'catalogo'; clave: ClaveConsulta; params: Parametros }
  /** Nada la reconoció: la sigue el modelo (o, sin modelo, la regla de respaldo). */
  | { tipo: 'modelo'; reglaDeRespaldo: ClaveConsulta | null };

export interface OpcionesDecision {
  ahoraMs?: number;
}

/**
 * Qué haría Lila con esta pregunta (ya limpia de «@lila»), antes de tocar el
 * modelo. Determinista: la misma pregunta y el mismo «ahora» dan lo mismo.
 */
export const decidirRuta = (pregunta: string, opciones: OpcionesDecision = {}): Decision => {
  const ahoraMs = opciones.ahoraMs ?? Date.now();
  if (esOrdenDeAvisoAPlanta(pregunta)) return { tipo: 'orden_planta' };
  const sinDato = temaSinDato(pregunta);
  if (sinDato) return { tipo: 'sin_dato', texto: sinDato };
  const vetada = fueraDeCatalogo(pregunta);
  if (vetada) return { tipo: 'vetada' };

  const porRegla = rutearPorReglas(pregunta);
  // Una pregunta LARGA la entiende mejor el modelo que la primera regla que
  // pisa… salvo que la regla sea de dos o más palabras: esa es precisa aunque
  // la pregunta sea larga (14/09, 13:49).
  const larga = pregunta.split(/\s+/).length > PALABRAS_PARA_MODELO && especificidadDeRegla(pregunta) < 2;
  const clave: ClaveConsulta | null = larga ? null : porRegla;

  // Las herramientas de datos que se reconocen por palabra y no necesitan un
  // nombre («cuántos agregados llegaron hoy») se contestan sin modelo.
  const porDatos = larga ? null : herramientaDeDatosPorReglas(pregunta);
  if (porDatos) return { tipo: 'datos', herramienta: porDatos, argumentos: normalizarArgumentos(porDatos, [], pregunta, ahoraMs) };

  // «Qué pedidos hay esta semana»: la regla dice «pedidos de hoy», pero el
  // rango de la pregunta manda.
  const rango = esDeUnDia(clave) ? argumentosDeRango(pregunta, ahoraMs) : null;
  if (rango) return { tipo: 'datos', herramienta: 'pedidos', argumentos: rango };

  if (clave) return { tipo: 'catalogo', clave, params: extraerParametros(pregunta, ahoraMs) };
  return { tipo: 'modelo', reglaDeRespaldo: larga ? porRegla : null };
};

/**
 * Etiquetada pero hablando DE ella, no CON ella («eso no puede responder @lila
 * 😅», 14/09 18:27): sin ruta y sin forma de pregunta, se deja pasar. Es la
 * última decisión, y depende de lo que haya dicho el modelo: por eso es aparte.
 */
export const seDejaPasar = (pregunta: string, clave: ClaveConsulta | null, porRegla: ClaveConsulta | null, hayRespuesta: boolean): boolean =>
  !hayRespuesta && (!clave || clave === 'help') && porRegla !== 'help' && !pareceParaElAgente(pregunta);
