import { getBotConfigModel } from '../../database/bot.models.js';
import logger from '../../utils/logger.js';
import {
  GUION_ASFALTO,
  ID_SERVICIO,
  PREGUNTA_SERVICIO_POR_DEFECTO,
  guionDe,
  opcionesSiNo,
  palabrasDeOpcion,
  palabrasDeServicio,
  type Guion,
  type OpcionGuion,
  type PreguntaGuion,
  type ServicioGuion,
  type TipoPregunta,
} from '../ventas/guion.asfalto.js';

/**
 * LOS SERVICIOS Y EL GUION COMO LOS EDITA EL PANEL (A8 Servicios, A9 guion de
 * un servicio, A10 una pregunta; spec DALI §4 `servicios`). El panel ve
 * palabras, no regex: `editableDe` traduce el guion del motor (el pack o el
 * guardado en `bot_configs.guion`) y `aGuion` lo vuelve a armar al guardar.
 * Lo que la empresa no tocó conserva los regex expertos del pack; lo que sí,
 * queda con sus palabras y el motor arma el patrón (`regexDePalabras`).
 */
export interface OpcionEditable {
  valor: string;
  palabras: string[];
  sugerencia?: string;
}

export interface PreguntaEditable {
  campo: string;
  etiqueta: string;
  pregunta: string;
  tipo: TipoPregunta;
  opciones: OpcionEditable[];
  cuando?: { campo: string; es: string | string[] };
  pista?: string;
  explicacion?: string;
}

export interface ServicioEditable {
  id: string;
  nombre: string;
  palabras: string[];
  activo: boolean;
  /** «Junta datos para cotizar» (preguntas) o «Derivar de inmediato a un asesor». */
  modo: 'preguntas' | 'derivar';
  preguntas: PreguntaEditable[];
}

export interface GuionEditable {
  preguntaServicio: string;
  servicios: ServicioEditable[];
  cierre: PreguntaEditable[];
}

export interface Servicios {
  guion: GuionEditable;
  /** Sin guion propio: lo que se ve es el pack de asfalto tal cual. */
  delPack: boolean;
  activos: number;
}

const LARGOS = { nombre: 80, palabra: 40, palabras: 40, pregunta: 400, etiqueta: 40, valor: 60, texto: 400, preguntaServicio: 300 } as const;

const texto = (v: unknown, max: number): string => (v == null ? '' : String(v)).trim().slice(0, max);
const listaDePalabras = (v: unknown): string[] => {
  const vistas = new Set<string>();
  const limpias: string[] = [];
  for (const cruda of Array.isArray(v) ? v : []) {
    const p = texto(cruda, LARGOS.palabra);
    if (!p || vistas.has(p.toLowerCase())) continue;
    vistas.add(p.toLowerCase());
    limpias.push(p);
  }
  return limpias.slice(0, LARGOS.palabras);
};

/** «Sellado de grietas» → «sellado-de-grietas». */
export const slugDe = (nombre: string): string =>
  String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const opcionEditable = (o: OpcionGuion): OpcionEditable => ({ valor: o.valor, palabras: palabrasDeOpcion(o), ...(o.sugerencia ? { sugerencia: o.sugerencia } : {}) });

const preguntaEditable = (p: PreguntaGuion): PreguntaEditable => ({
  campo: p.campo,
  etiqueta: p.etiqueta,
  pregunta: p.pregunta,
  tipo: p.tipo,
  opciones: (p.opciones ?? []).map(opcionEditable),
  ...(p.cuando ? { cuando: p.cuando } : {}),
  ...(p.pista ? { pista: p.pista } : {}),
  ...(p.explicacion ? { explicacion: p.explicacion } : {}),
});

/** El guion del motor como lo ve el panel. */
export const editableDe = (guion: Guion): GuionEditable => ({
  preguntaServicio: guion.preguntaServicio ?? PREGUNTA_SERVICIO_POR_DEFECTO,
  servicios: guion.servicios.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    palabras: palabrasDeServicio(s),
    activo: s.activo !== false,
    modo: s.derivar ? 'derivar' : 'preguntas',
    preguntas: s.preguntas.map(preguntaEditable),
  })),
  cierre: guion.cierre.map(preguntaEditable),
});

const mismasPalabras = (a: string[], b: string[]): boolean => {
  const norma = (l: string[]) => [...new Set(l.map((p) => p.trim().toLowerCase()))].sort().join('|');
  return norma(a) === norma(b);
};

/**
 * Una opción de vuelta al motor: si es la del pack y sus palabras no
 * cambiaron, con sus regex; si no, con sus palabras (y lo inequívoco del
 * pack, `senal`, se conserva).
 */
const aOpcion = (o: OpcionEditable, delPack?: OpcionGuion): OpcionGuion => {
  const valor = texto(o.valor, LARGOS.valor);
  const palabras = listaDePalabras(o.palabras);
  const sugerencia = texto(o.sugerencia, LARGOS.texto) || undefined;
  if (delPack && mismasPalabras(palabras, palabrasDeOpcion(delPack))) return { ...delPack, valor, ...(sugerencia ? { sugerencia } : {}) };
  return { valor, palabras, ...(delPack?.senal ? { senal: delPack.senal } : {}), ...(sugerencia ? { sugerencia } : {}) };
};

/** Un campo del guion es un identificador (`tipoBase`): se conserva tal cual; uno nuevo sale de la etiqueta. */
const CAMPO = /^[A-Za-z0-9_-]{1,40}$/;

const aPregunta = (p: PreguntaEditable, usados: Set<string>, delPack?: PreguntaGuion): PreguntaGuion => {
  const etiqueta = texto(p.etiqueta, LARGOS.etiqueta) || 'Dato';
  const campoDado = texto(p.campo, LARGOS.etiqueta);
  const base = (CAMPO.test(campoDado) ? campoDado : slugDe(etiqueta)) || 'dato';
  let campo = base;
  for (let n = 2; usados.has(campo); n++) campo = `${base}-${n}`;
  usados.add(campo);
  const tipo: TipoPregunta = (['texto', 'numero', 'sino', 'opcion'] as const).find((t) => t === p.tipo) ?? 'texto';
  const conOpciones = tipo === 'sino' || tipo === 'opcion';
  let opciones: OpcionGuion[] | undefined;
  if (conOpciones) {
    const dadas = (Array.isArray(p.opciones) ? p.opciones : []).filter((o) => texto(o?.valor, LARGOS.valor));
    opciones = dadas.length ? dadas.map((o) => aOpcion(o, delPack?.opciones?.find((x) => x.valor === texto(o.valor, LARGOS.valor)))) : tipo === 'sino' ? opcionesSiNo() : [];
  }
  const cuando = p.cuando && typeof p.cuando.campo === 'string' && CAMPO.test(p.cuando.campo) ? { campo: p.cuando.campo, es: Array.isArray(p.cuando.es) ? p.cuando.es.map(String) : String(p.cuando.es ?? '') } : undefined;
  return {
    campo,
    etiqueta,
    pregunta: texto(p.pregunta, LARGOS.pregunta),
    tipo,
    ...(opciones ? { opciones } : {}),
    ...(cuando ? { cuando } : {}),
    ...(texto(p.pista, LARGOS.texto) ? { pista: texto(p.pista, LARGOS.texto) } : {}),
    ...(texto(p.explicacion, LARGOS.texto) ? { explicacion: texto(p.explicacion, LARGOS.texto) } : {}),
  };
};

const aServicio = (s: ServicioEditable, ids: Set<string>): ServicioGuion => {
  const nombre = texto(s.nombre, LARGOS.nombre) || 'Servicio';
  // Un servicio recién creado en el panel llega como `nuevo-…`: su id sale del nombre.
  const base = (ID_SERVICIO.test(String(s.id ?? '')) && !/^nuevo-/.test(String(s.id)) ? String(s.id) : slugDe(nombre)) || 'servicio';
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  ids.add(id);
  const delPack = GUION_ASFALTO.servicios.find((x) => x.id === id);
  const palabras = listaDePalabras(s.palabras);
  const usados = new Set<string>();
  const preguntas = s.modo === 'derivar' ? [] : (Array.isArray(s.preguntas) ? s.preguntas : []).map((p) => aPregunta(p, usados, delPack?.preguntas.find((x) => x.campo === p.campo)));
  const reconocimiento = delPack && mismasPalabras(palabras, palabrasDeServicio(delPack)) ? { alias: delPack.alias, ...(delPack.cambio ? { cambio: delPack.cambio } : {}), palabras: delPack.palabras } : { palabras };
  return {
    id,
    nombre,
    ...reconocimiento,
    activo: s.activo !== false,
    ...(s.modo === 'derivar' ? { derivar: delPack?.derivar ?? `${nombre}: lo ve un asesor` } : {}),
    preguntas,
  };
};

/** Lo que mandó el panel, de vuelta al motor, limpio: slugs, largos, opciones sí/no, los regex del pack donde no se tocó nada. */
export const aGuion = (e: GuionEditable): Guion => {
  const ids = new Set<string>();
  const usados = new Set<string>();
  const preguntaServicio = texto(e.preguntaServicio, LARGOS.preguntaServicio);
  return {
    servicios: (Array.isArray(e.servicios) ? e.servicios : []).map((s) => aServicio(s, ids)),
    cierre: (Array.isArray(e.cierre) ? e.cierre : []).map((p) => aPregunta(p, usados, GUION_ASFALTO.cierre.find((x) => x.campo === p.campo))),
    ...(preguntaServicio && preguntaServicio !== PREGUNTA_SERVICIO_POR_DEFECTO ? { preguntaServicio } : {}),
  };
};

const resumen = (guion: Guion, delPack: boolean): Servicios => ({ guion: editableDe(guion), delPack, activos: guion.servicios.filter((s) => s.activo !== false).length });

export const leerServicios = async (companyId: string): Promise<Servicios> => {
  const Config = await getBotConfigModel();
  const config = await Config.findOne({ companyId }).select('guion').lean();
  const guardado = config?.guion;
  const guion = guionDe(guardado);
  return resumen(guion, !guardado || guion === GUION_ASFALTO);
};

export class GuionInvalido extends Error {}

export const guardarServicios = async (companyId: string, editable: GuionEditable, quien: string): Promise<Servicios> => {
  const guion = aGuion(editable);
  if (guionDe(guion) !== guion) throw new GuionInvalido('El guion no tiene la forma que espera Dali');
  if (!guion.servicios.length) throw new GuionInvalido('Dali necesita al menos un servicio');
  const Config = await getBotConfigModel();
  await Config.updateOne({ companyId }, { $set: { guion } });
  logger.info(`[dali] ${quien} guardó el guion de ${companyId}: ${guion.servicios.map((s) => `${s.id}${s.activo === false ? ' (apagado)' : ''}`).join(', ')}`);
  return resumen(guion, false);
};

/** Vuelve al pack de asfalto: se borra el guion propio. */
export const restaurarPack = async (companyId: string, quien: string): Promise<Servicios> => {
  const Config = await getBotConfigModel();
  await Config.updateOne({ companyId }, { $unset: { guion: 1 } });
  logger.info(`[dali] ${quien} restauró el pack de asfalto en ${companyId}`);
  return resumen(GUION_ASFALTO, true);
};
