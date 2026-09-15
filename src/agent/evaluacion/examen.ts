/**
 * El examen de Lila: cada pregunta REAL del corpus, por el mismo camino que un
 * mensaje del grupo, y un veredicto por caso.
 *
 * Es el «banco de aprendizaje» hecho gate (spec §13.5.5 / §13.6): un error que
 * pasó al corpus no vuelve a pasar sin que este examen lo diga. Corre de dos
 * formas:
 *   · SIN modelo (jest, `examen.test.ts`): la decisión determinista de
 *     `decidirRuta`. Es rápido y corre en `npm test`.
 *   · CON modelo (`npm run agente:examen`): además, lo que el modelo elige
 *     cuando la decisión es `modelo`. Carga 1,1 GB; se corre a mano antes de
 *     un deploy que toque entendimiento, y su resultado se anota en el spec.
 */
import { decidirRuta, type Decision } from '../consultas/decision.js';
import { preguntaLimpia } from '../consultas/catalogo.js';

/** Lo que se espera de un caso, en el molde de `Decision`. Los objetos se comparan por subconjunto. */
export type Esperado =
  | { ruta: 'orden_planta' }
  | { ruta: 'sin_dato' }
  | { ruta: 'vetada' }
  | { ruta: 'datos'; herramienta: string; argumentos?: Record<string, unknown> }
  | { ruta: 'catalogo'; clave: string; params?: Record<string, unknown> }
  | { ruta: 'modelo'; reglaDeRespaldo?: string | null };

export interface Caso {
  /** `AAAA-MM-DD-HHMM` del incidente, o un slug. Único. */
  id: string;
  /** Tal cual llegó (con «@lila» si lo traía): la limpieza es parte del camino. */
  pregunta: string;
  /** El «hoy» del caso, Lima (`YYYY-MM-DD`): las fechas relativas dependen de él. */
  hoy: string;
  esperado: Esperado;
  /** Con modelo cargado, qué debe elegir cuando la decisión es `modelo`. */
  esperadoConModelo?: { herramienta: string; argumentos?: Record<string, unknown> };
  /** De qué incidente sale (id de `incidentes.jsonl`), si de alguno. */
  incidente?: string;
  /** Todavía no arreglado: se informa, no bloquea. */
  pendiente?: boolean;
  nota?: string;
}

export interface Veredicto {
  id: string;
  pregunta: string;
  ok: boolean;
  pendiente: boolean;
  esperado: string;
  obtenido: string;
  /** Qué parte falló: la ruta, o los argumentos/params. */
  motivo?: 'ruta' | 'argumentos';
}

/** «Ahora» del caso: mediodía Lima de ese día, para que «hoy» y «mañana» no dependan de la hora. */
export const ahoraDe = (hoy: string): number => Date.parse(`${hoy}T12:00:00.000-05:00`);

/** Comparación por subconjunto: lo que el caso no menciona, no se juzga. */
export const contiene = (obtenido: Record<string, unknown> | undefined, esperado: Record<string, unknown> | undefined): boolean => {
  if (!esperado) return true;
  // `null` esperado = «no debe estar» (ni null ni undefined): «los 250» no es placa.
  return Object.entries(esperado).every(([k, v]) => (v === null ? (obtenido ?? {})[k] == null : JSON.stringify((obtenido ?? {})[k]) === JSON.stringify(v)));
};

const resumen = (d: Decision | Esperado): string => {
  const x = d as Record<string, unknown>;
  const ruta = String(x.tipo ?? x.ruta);
  if (ruta === 'catalogo') return `catalogo:${x.clave}${x.params ? ' ' + JSON.stringify(x.params) : ''}`;
  if (ruta === 'datos') return `datos:${x.herramienta}${x.argumentos ? ' ' + JSON.stringify(x.argumentos) : ''}`;
  if (ruta === 'modelo') return `modelo${x.reglaDeRespaldo ? ` (respaldo ${x.reglaDeRespaldo})` : ''}`;
  return ruta;
};

/** PURO: un caso contra una decisión. */
export const juzgar = (caso: Caso, decision: Decision): Veredicto => {
  const e = caso.esperado;
  const base = { id: caso.id, pregunta: caso.pregunta, pendiente: Boolean(caso.pendiente), esperado: resumen(e), obtenido: resumen(decision) };
  if (e.ruta !== decision.tipo) return { ...base, ok: false, motivo: 'ruta' };
  if (e.ruta === 'catalogo' && decision.tipo === 'catalogo') {
    if (e.clave !== decision.clave) return { ...base, ok: false, motivo: 'ruta' };
    if (!contiene(decision.params as unknown as Record<string, unknown>, e.params)) return { ...base, ok: false, motivo: 'argumentos' };
  }
  if (e.ruta === 'datos' && decision.tipo === 'datos') {
    if (e.herramienta !== decision.herramienta) return { ...base, ok: false, motivo: 'ruta' };
    if (!contiene(decision.argumentos as unknown as Record<string, unknown>, e.argumentos)) return { ...base, ok: false, motivo: 'argumentos' };
  }
  if (e.ruta === 'modelo' && decision.tipo === 'modelo' && e.reglaDeRespaldo !== undefined && e.reglaDeRespaldo !== decision.reglaDeRespaldo) {
    return { ...base, ok: false, motivo: 'ruta' };
  }
  return { ...base, ok: true };
};

export interface Informe {
  total: number;
  ok: number;
  fallidos: Veredicto[];
  pendientes: Veredicto[];
  /** Porcentajes sobre los casos NO pendientes. */
  ruta: number;
  argumentos: number;
}

/** El examen sin modelo: determinista, para jest. */
export const examinar = (corpus: Caso[], numeroBot = '51949376824'): Informe => {
  const veredictos = corpus.map((c) => juzgar(c, decidirRuta(preguntaLimpia(c.pregunta, numeroBot), { ahoraMs: ahoraDe(c.hoy) })));
  const vigentes = veredictos.filter((v) => !v.pendiente);
  const rutaOk = vigentes.filter((v) => v.ok || v.motivo === 'argumentos').length;
  const pct = (n: number) => (vigentes.length ? Math.round((n / vigentes.length) * 1000) / 10 : 100);
  return {
    total: corpus.length,
    ok: veredictos.filter((v) => v.ok).length,
    fallidos: vigentes.filter((v) => !v.ok),
    pendientes: veredictos.filter((v) => v.pendiente),
    ruta: pct(rutaOk),
    argumentos: pct(vigentes.filter((v) => v.ok).length),
  };
};

export const formatear = (v: Veredicto): string => `  ✗ ${v.id} «${v.pregunta}»\n      esperado: ${v.esperado}\n      obtenido: ${v.obtenido}`;
