/**
 * INTERPRETAR UN ANUNCIO DE PRODUCCIÓN: qué quiere decir el mensaje del grupo.
 *
 * José, 16/09: «¿por qué el modelo no se encarga de traducir el mensaje en
 * lugar de agregar regex como "cambio de día", "se cancela"?». Tiene razón, y
 * es el diseño de §13.5.4: **el modelo señala, el código resuelve**. El modelo
 * dice si el mensaje programa, mueve o cancela una producción, y COPIA de él
 * la empresa, el cliente, la fecha (tal cual está escrita), la hora y los m³;
 * el código convierte «jueves 17» en 2026-09-17 con el día del mensaje, y
 * valida contra el texto que la empresa exista y que los m³ estén escritos.
 * Un 1,5 B copia bien y calcula mal; acá no calcula nada.
 *
 * Sin modelo (no cargó, se pasó de tiempo), el lector por reglas de siempre
 * (`checklist/menciones.ts`) sigue programando; lo que no sabe hacer es mover
 * ni cancelar — para eso hace falta entender, no casar palabras.
 */
import { ALIAS_EMPRESA, fechaDe, normalizar } from '../consultas/catalogo.js';
import { diaPeruano } from '../checklist/tiempo.js';
import { fechasEn } from '../checklist/menciones.js';
import { generar } from './modelo.js';
import logger from '../../utils/logger.js';

export type AccionAnuncio = 'programar' | 'mover' | 'cancelar' | 'ninguna';

export interface ProduccionAnunciada {
  companyId?: string;
  empresa: string;
  cliente?: string;
  /** `YYYY-MM-DD`; sin fecha reconocida, `undefined` (se pregunta el día). */
  fecha?: string;
  hora?: string;
  cubos?: number;
}

export interface Anuncio {
  accion: AccionAnuncio;
  producciones: ProduccionAnunciada[];
  /** Al mover: de qué día venía. */
  desdeFecha?: string;
}

const EMPRESAS = ['globofast', 'constroad'] as const;

export const ESQUEMA_ANUNCIO = {
  type: 'object',
  properties: {
    accion: { enum: ['programar', 'mover', 'cancelar', 'ninguna'] },
    producciones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          empresa: { enum: [...EMPRESAS, ''] },
          cliente: { type: 'string' },
          fecha: { type: 'string' },
          hora: { type: 'string' },
          m3: { type: 'string' },
        },
      },
    },
    desde_fecha: { type: 'string' },
  },
} as const;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const promptAnuncio = (hoy: string): string => {
  const [y, m, d] = hoy.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const ej = (t: string, r: object) => `M: ${t} → ${JSON.stringify(r)}`;
  return [
    `Eres Lila, asistente de una planta de asfalto en Lima. Hoy es ${DIAS[dow]} ${hoy}.`,
    'Lees un mensaje del grupo de coordinación y dices si ANUNCIA producciones (programar), MUEVE una de día (mover), CANCELA una (cancelar) o nada de eso (ninguna). Respondes solo JSON.',
    '',
    'Reglas:',
    '- fecha y desde_fecha: COPIA el texto de la fecha tal como está escrito ("jueves 17", "MARTES 15-09", "mañana", "viernes"). No calcules ni conviertas.',
    '- empresa: globofast o constroad solo si el mensaje la nombra (o su alias: "globo", "solkali"); si no, "". INFRAMAQ es la PLANTA, nunca una empresa.',
    '- Lo que ya pasó ("ayer", "terminamos", "salió") no es programar ni cancelar: ninguna.',
    '- cliente: el nombre del cliente u obra si lo dice ("CONSORCIO LOMAS"); si no, "".',
    '- hora: la hora de arranque de la producción en HH:mm si está escrita; si no, "".',
    '- m3: los metros cúbicos escritos, solo el número; si no, "".',
    '- Varios días en un mensaje = varias producciones.',
    '- Preguntas, dudas, charla, lo que ya pasó, y lo que dice Lila: ninguna.',
    '- "ya no el jueves, pasa al viernes" / "se mueve" / "se reprograma" / "en vez de" = mover, con desde_fecha el día viejo y fecha el nuevo.',
    '- "se cancela" / "se suspende" / "no va" / "no hay producción" = cancelar, con la fecha cancelada.',
    '',
    'Ejemplos:',
    ej('📣 Jueves 17 tengo produccion de 137m3, 2 pulgadas', { accion: 'programar', producciones: [{ empresa: '', cliente: '', fecha: 'Jueves 17', hora: '', m3: '137' }], desde_fecha: '' }),
    ej('Buenos dias tenemos producción en INFRAMAQ 2 dias : MARTES 15-09 / H.de producion. 04:30 am / M3: 250.00 APROX. MIERCOLES 16-09 / H.de producion. 04:30 am / M3: 274.00 APROX. Cliente : CONSORCIO LOMAS', { accion: 'programar', producciones: [{ empresa: '', cliente: 'CONSORCIO LOMAS', fecha: 'MARTES 15-09', hora: '04:30', m3: '250' }, { empresa: '', cliente: 'CONSORCIO LOMAS', fecha: 'MIERCOLES 16-09', hora: '04:30', m3: '274' }], desde_fecha: '' }),
    ej('mañana producción de globofast 200 m3 a las 5', { accion: 'programar', producciones: [{ empresa: 'globofast', cliente: '', fecha: 'mañana', hora: '05:00', m3: '200' }], desde_fecha: '' }),
    ej('la producción de globofast del jueves ya no va, pasa al viernes', { accion: 'mover', producciones: [{ empresa: 'globofast', cliente: '', fecha: 'viernes', hora: '', m3: '' }], desde_fecha: 'jueves' }),
    ej('se suspende la producción del jueves por lluvia', { accion: 'cancelar', producciones: [{ empresa: '', cliente: '', fecha: 'jueves', hora: '', m3: '' }], desde_fecha: '' }),
    ej('ayer terminamos a las 3 con 250 m3', { accion: 'ninguna', producciones: [], desde_fecha: '' }),
    ej('@lila hay producción mañana?', { accion: 'ninguna', producciones: [], desde_fecha: '' }),
    ej('ok gracias', { accion: 'ninguna', producciones: [], desde_fecha: '' }),
  ].join('\n');
};

const TIMEOUT_MS = 25_000;

const empresaDe = (nombre: string, texto: string): { companyId?: string; empresa: string } => {
  const n = normalizar(nombre);
  const t = normalizar(texto);
  // «Producción en INFRAMAQ» es la planta, no la empresa: Inframaq solo cuenta
  // si el modelo la nombró como empresa, nunca por aparecer en el texto.
  const alias = ALIAS_EMPRESA.find((e) => e.companyId !== 'inframaq-iax' && e.alias.some((a) => a === n || new RegExp(`\\b${a}\\b`).test(t)));
  if (!alias) return { empresa: nombre || '' };
  const bonito = { 'globofas-s8k': 'Globofast Solkali', constroad: 'ConstRoad', 'inframaq-iax': 'Inframaq' }[alias.companyId] ?? alias.companyId;
  return { companyId: alias.companyId, empresa: bonito };
};

/** «04:30 am», «4.30», «5», «5 am» → «04:30» / «05:00». Solo si está en el texto. */
export const horaDe = (cruda: string): string | undefined => {
  const m = String(cruda || '').trim().toLowerCase().match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return undefined;
  let h = Number(m[1]);
  const mm = m[2] ?? '00';
  if (/p/.test(m[3] ?? '') && h < 12) h += 12;
  if (h > 23) return undefined;
  return `${String(h).padStart(2, '0')}:${mm}`;
};

/** Resuelve una fecha copiada del mensaje al día que nombra, relativa al día del mensaje. */
export const resolverFechaAnunciada = (span: string, mensajeMs: number): string | undefined => {
  const s = String(span || '').trim();
  if (!s) return undefined;
  // `fechasEn` es el lector de fechas de los anuncios («jueves 17», «MARTES
  // 15-09», «17/09», «17 de setiembre», «mañana»); `fechaDe` cubre lo que aquel
  // no («viernes» a secas = el próximo viernes).
  const dia = diaPeruano(mensajeMs);
  return fechasEn(normalizar(s), dia)[0]?.fecha ?? fechaDe(s, mensajeMs);
};

/**
 * PURO: del JSON del modelo al anuncio, validado contra el texto: la empresa
 * tiene que estar en el mensaje (o venir del autor), los m³ escritos, la fecha
 * resuelta con el día del mensaje. Lo que el modelo inventó no pasa.
 */
export const interpretarJsonDeAnuncio = (json: string, texto: string, mensajeMs: number, empresaDelAutor?: { companyId: string; empresa: string }): Anuncio | null => {
  let crudo: { accion?: unknown; producciones?: unknown; desde_fecha?: unknown };
  try {
    crudo = JSON.parse(json);
  } catch {
    return null;
  }
  const accion = String(crudo.accion || 'ninguna') as AccionAnuncio;
  if (!['programar', 'mover', 'cancelar'].includes(accion)) return { accion: 'ninguna', producciones: [] };
  const t = normalizar(texto);
  const lista = Array.isArray(crudo.producciones) ? (crudo.producciones as Array<Record<string, unknown>>) : [];
  const producciones: ProduccionAnunciada[] = [];
  for (const p of lista) {
    const empresa = empresaDe(String(p.empresa ?? ''), texto);
    const cubosTxt = String(p.m3 ?? '').replace(/,/g, '.').match(/\d+(?:\.\d+)?/)?.[0];
    const cubos = cubosTxt && t.includes(cubosTxt.split('.')[0]) ? Math.round(Number(cubosTxt)) : undefined;
    const hora = horaDe(String(p.hora ?? ''));
    const cliente = String(p.cliente ?? '').trim();
    producciones.push({
      companyId: empresa.companyId ?? empresaDelAutor?.companyId,
      empresa: empresa.companyId ? empresa.empresa : empresaDelAutor?.empresa ?? '',
      cliente: cliente && t.includes(normalizar(cliente)) ? cliente : undefined,
      fecha: resolverFechaAnunciada(String(p.fecha ?? ''), mensajeMs),
      hora,
      cubos,
    });
  }
  const hoy = diaPeruano(mensajeMs);
  // Lo que apunta al pasado no es un anuncio («ayer terminamos con 250 m3»
  // salió como cancelar del 14/09): ninguna.
  const vigentes = producciones.filter((p) => !p.fecha || p.fecha >= hoy);
  if (!vigentes.length) return { accion: 'ninguna', producciones: [] };
  let desdeFecha = accion === 'mover' ? resolverFechaAnunciada(String(crudo.desde_fecha ?? ''), mensajeMs) : undefined;
  // «El jueves cambia: 160 m3 en vez de 137» vino como mover del jueves al
  // jueves: es una actualización, o sea programar.
  if (accion === 'mover' && (!desdeFecha || vigentes.every((p) => p.fecha === desdeFecha))) {
    desdeFecha = undefined;
    return { accion: 'programar', producciones: vigentes };
  }
  return { accion, producciones: vigentes, desdeFecha };
};

/**
 * Pregunta al modelo. `null` si no hay modelo o no supo: el llamador cae al
 * lector por reglas.
 */
export const interpretarAnuncio = async (texto: string, mensajeMs: number, empresaDelAutor?: { companyId: string; empresa: string }): Promise<Anuncio | null> => {
  const hoy = diaPeruano(mensajeMs);
  const json = await generar({ tarea: 'anuncio', sistema: promptAnuncio(hoy), usuario: texto, esquema: ESQUEMA_ANUNCIO as unknown as Record<string, unknown>, maxTokens: 260, timeoutMs: TIMEOUT_MS });
  if (!json) return null;
  const anuncio = interpretarJsonDeAnuncio(json, texto, mensajeMs, empresaDelAutor);
  logger.info(`[agente] anuncio: ${anuncio ? `${anuncio.accion} ${JSON.stringify(anuncio.producciones)}${anuncio.desdeFecha ? ` desde ${anuncio.desdeFecha}` : ''}` : 'no se entendió'} ← «${texto.slice(0, 80)}»`);
  return anuncio;
};
