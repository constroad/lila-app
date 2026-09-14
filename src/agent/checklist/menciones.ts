import { ALIAS_EMPRESA, normalizar, sumarDias } from '../consultas/catalogo.js';
import { rangoDe } from '../llm/herramientas.js';
import { COMPANY_PILOTO } from './alcance.js';
import { diaPeruano, fechaLegible } from './tiempo.js';
import type { MensajeGrupo } from './mensajes.js';

/**
 * PRODUCCIONES MENCIONADAS EN EL CHAT QUE TODAVÍA NO SON PEDIDOS.
 *
 * José, 14/09/2026: «muchas veces crean el pedido hasta el último día o las
 * últimas horas antes. ¿No sería bueno indicar "mencionaron producciones pero
 * no hay pedidos creados ni se avisó al grupo de planta", y sugerir el aviso a
 * planta pero que creen el pedido?».
 *
 * El detector de siempre arranca del PEDIDO en Portal: sin pedido con hora de
 * inicio no hay día de planta, no hay aviso ni checklist. Esto mira lo otro:
 * lo que la gente DIJO en INFRAMAQ admin. Los anuncios reales del 14/09:
 *
 *   «📣📣📣 Jueves 17 tengo produccion de 137m3, 2 pulgadas»
 *   «Buenos dias tenemos producción en INFRAMAQ 2 dias :
 *    MARTES 15-09 / H.de producion. 04:30 am / M3: 250.00 APROX. …
 *    MIERCOLES 16-09 / H.de producion. 04:30 am / M3: 274.00 APROX. …
 *    Cliente : CONSORCIO LOMAS»
 *
 * Es lectura por reglas, no por modelo: una palabra de producción, una señal
 * de FUTURO (una fecha, «esta semana», «tengo», «habrá») y ninguna de pasado
 * («ayer», «terminó»). Un mensaje con varias fechas son varias producciones:
 * el texto se parte en bloques, uno por fecha, y cada bloque trae sus m³ y su
 * hora. Las fechas se resuelven relativas al MENSAJE: «mañana» dicho el lunes
 * es martes. «En INFRAMAQ» es la planta, no una empresa.
 */

export interface MencionDeProduccion {
  /** Día o rango al que se refiere («esta semana» es lunes a domingo). */
  desde: string;
  hasta: string;
  /** `false` cuando solo dijo «habrá producción» sin cuándo: se toma la semana que viene. */
  fechaConocida: boolean;
  companyId?: string;
  cliente?: string;
  cubos?: number;
  hora?: string;
  texto: string;
  autor: string;
  ts: number;
}

const PRODUCCION = /\b(produccion|producciones|producir|produciremos|producimos|pedido|pedidos|despacho|despachos|asfaltar|asfaltado|asfaltamos|colocacion|colocar|imprimacion|imprimar|carga|cargar|cargamos|mezcla)\b/;
const FUTURO = /\b(habra|va a haber|van a haber|vamos a|iremos|tengo|tendremos|tenemos|se programa|programad[oa]s?|programacion|confirmad[oa]s?|confirmaron|confirmo|sale|salimos|arrancamos|empezamos|se produce|se despacha|hay)\b/;
const PASADO = /\b(ayer|anteayer|la semana pasada|el mes pasado|termin[oó]|terminamos|se hizo|se produjo|se despacho|salio|salieron|fue|fueron|hubo|hicimos|ya (esta|salio|termino|se produjo))\b/;
const DIAS_SIN_FECHA = 7;
/** Dentro de estos minutos después de un anuncio, «y el viernes constroad» sigue hablando de producción. */
const HILO_MS = 10 * 60_000;

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const iso = (y: number, m: number, d: number): string => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const diaSemanaDe = (fecha: string): number => {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const fechaValida = (y: number, m: number, d: number): boolean => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/**
 * Cada fecha nombrada en el texto (normalizado), con su posición: «MARTES
 * 15-09», «jueves 17», «17/09», «17 de septiembre», «mañana», «pasado mañana»,
 * «hoy». Un día de la semana solo es el PRÓXIMO; con número («jueves 17») es el
 * próximo jueves que caiga 17; con día y mes, esa fecha.
 */
export const fechasEn = (t: string, dia: string): Array<{ fecha: string; pos: number; fin: number }> => {
  const anio = Number(dia.slice(0, 4));
  const mesActual = Number(dia.slice(5, 7));
  const salida: Array<{ fecha: string; pos: number; fin: number }> = [];
  const RE = new RegExp(
    `\\b(pasado manana|manana|hoy)\\b` +
      `|\\b(${DIAS_SEMANA.join('|')})\\b(?:\\s+(\\d{1,2})(?:[-/](\\d{1,2}))?)?` +
      `|\\b(\\d{1,2})[-/](\\d{1,2})\\b(?![-/]\\d)` +
      `|\\b(\\d{1,2})\\s+de\\s+(${MESES.join('|')}|setiembre)\\b`,
    'g'
  );
  for (const m of t.matchAll(RE)) {
    const pos = m.index ?? 0;
    const fin = pos + m[0].length;
    let fecha: string | undefined;
    if (m[1]) {
      fecha = m[1] === 'hoy' ? dia : sumarDias(dia, m[1] === 'manana' ? 1 : 2);
    } else if (m[2]) {
      const dow = DIAS_SEMANA.indexOf(m[2]);
      const numero = m[3] ? Number(m[3]) : undefined;
      const mes = m[4] ? Number(m[4]) : undefined;
      if (numero && mes && fechaValida(anio, mes, numero)) {
        fecha = iso(anio, mes, numero);
      } else {
        // El próximo <día de la semana> (hoy incluido si es hoy): si además
        // dice el número («jueves 17»), el próximo que caiga en ese número.
        const proximo = sumarDias(dia, (dow - diaSemanaDe(dia) + 7) % 7);
        let candidata = proximo;
        if (numero) {
          for (let i = 0; i < 6 && Number(candidata.slice(8, 10)) !== numero; i++) candidata = sumarDias(candidata, 7);
          if (Number(candidata.slice(8, 10)) !== numero) candidata = proximo;
        }
        fecha = candidata;
      }
    } else if (m[5]) {
      const d = Number(m[5]);
      const mes = Number(m[6]);
      if (fechaValida(anio, mes, d)) fecha = iso(anio, mes, d);
    } else if (m[7]) {
      const d = Number(m[7]);
      const mes = m[8] === 'setiembre' ? 9 : MESES.indexOf(m[8]) + 1;
      if (fechaValida(anio, mes, d)) fecha = iso(anio, mes, d);
    }
    if (!fecha) continue;
    // En noviembre o diciembre, «15-01» es de enero que viene.
    if (fecha < sumarDias(dia, -60) && mesActual >= 11) fecha = `${anio + 1}${fecha.slice(4)}`;
    salida.push({ fecha, pos, fin });
  }
  return salida;
};

/** «137m3», «250 m3», «M3: 250.00 APROX», «137 cubos». */
const cubosDe = (t: string): number | undefined => {
  const m = t.match(/\b(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:m3|m³|cubos)\b/) ?? t.match(/\bm3\s*[:=]?\s*(\d{1,4}(?:[.,]\d{1,2})?)/);
  return m ? Number(m[1].replace(',', '.')) : undefined;
};

/** «04:30 am», «4.30 pm», «H. de producción 04:30», «a las 4». */
const horaDe = (t: string): string | undefined => {
  const conMinutos = t.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|hrs|h)?\b/);
  const aLas = conMinutos ? null : t.match(/\b(?:a las|desde las|a la)\s+(\d{1,2})\b(?:\s*(am|pm|de la (?:manana|madrugada|tarde|noche)))?/);
  const m = conMinutos ?? aLas;
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = conMinutos ? conMinutos[2] : '00';
  const sufijo = String((conMinutos ? conMinutos[3] : aLas?.[2]) ?? '');
  if (/pm|tarde|noche/.test(sufijo) && h < 12) h += 12;
  if (h > 23 || Number(min) > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${min}`;
};

/** Inframaq es la planta: «producción en INFRAMAQ» no dice de qué empresa es el pedido. */
const empresaDe = (t: string): string | undefined =>
  ALIAS_EMPRESA.filter((e) => e.companyId !== COMPANY_PILOTO).find((e) => e.alias.some((a) => new RegExp(`\\b${a}\\b`).test(t)))?.companyId;

const clienteDe = (texto: string): string | undefined => {
  const m = texto.match(/cliente\s*:\s*([^\n]+)/i);
  return m ? m[1].trim().slice(0, 60) : undefined;
};

/**
 * Las producciones que anuncia un mensaje, una por fecha. `enHilo`: acaba de
 * haber un anuncio, así que una fecha + una empresa sin la palabra
 * «producción» («y el viernes constroad») también cuenta.
 */
export const mencionesDe = (m: MensajeGrupo, enHilo = false): MencionDeProduccion[] => {
  if (m.esPropio) return [];
  // Una pregunta («¿qué pedidos hay mañana?», «@lila …») habla de producción sin anunciar ninguna.
  if (/[?¿]/.test(m.texto) || /^\s*@/.test(m.texto) || /\blila\b/i.test(m.texto)) return [];
  const t = normalizar(m.texto);
  if (!t || t.length > 800) return [];
  if (PASADO.test(t)) return [];
  const dia = diaPeruano(m.ts);
  const fechas = fechasEn(t, dia);
  const rango = rangoDe(m.texto, dia);
  const conCuando = fechas.length > 0 || Boolean(rango && rango.hasta >= dia);
  const companyId = empresaDe(t);
  if (!PRODUCCION.test(t) && !(enHilo && conCuando && companyId)) return [];
  if (!conCuando && !FUTURO.test(t)) return [];

  const base = { companyId, cliente: clienteDe(m.texto), texto: m.texto, autor: m.autor, ts: m.ts };
  if (fechas.length === 0) {
    const [desde, hasta] = rango && rango.hasta >= dia ? [rango.desde < dia ? dia : rango.desde, rango.hasta] : [dia, sumarDias(dia, DIAS_SIN_FECHA)];
    return [{ ...base, desde, hasta, fechaConocida: Boolean(rango), cubos: cubosDe(t), hora: horaDe(t) }];
  }
  // Un bloque por fecha: desde esa fecha hasta la siguiente. Los m³ y la hora
  // de cada producción viven en su bloque; lo que está ANTES de la primera
  // fecha pertenece a la primera.
  const vistas = new Set<string>();
  const salida: MencionDeProduccion[] = [];
  fechas.forEach((f, i) => {
    if (f.fecha < dia || vistas.has(f.fecha)) return;
    vistas.add(f.fecha);
    const inicio = i === 0 ? 0 : f.pos;
    const fin = i + 1 < fechas.length ? fechas[i + 1].pos : t.length;
    const bloque = t.slice(inicio, fin);
    salida.push({
      ...base,
      desde: f.fecha,
      hasta: f.fecha,
      fechaConocida: true,
      cubos: cubosDe(bloque) ?? (fechas.length === 1 ? cubosDe(t) : undefined),
      hora: horaDe(bloque) ?? (fechas.length === 1 ? horaDe(t) : undefined),
    });
  });
  return salida;
};

/**
 * Las menciones de un lote de mensajes, una por (fecha, empresa): si tres
 * personas hablaron de la misma producción, es UNA mención — la última.
 */
export const detectarMenciones = (mensajes: MensajeGrupo[]): MencionDeProduccion[] => {
  const porFirma = new Map<string, MencionDeProduccion>();
  let ultimoAnuncioTs = -Infinity;
  for (const m of [...mensajes].sort((a, b) => a.ts - b.ts)) {
    const menciones = mencionesDe(m, m.ts - ultimoAnuncioTs <= HILO_MS);
    if (menciones.length === 0) continue;
    ultimoAnuncioTs = m.ts;
    for (const mencion of menciones) porFirma.set(firmaMencion(mencion), mencion);
  }
  return [...porFirma.values()].sort((a, b) => a.desde.localeCompare(b.desde));
};

export const firmaMencion = (m: Pick<MencionDeProduccion, 'desde' | 'hasta' | 'companyId'>): string =>
  `${m.desde}|${m.hasta}|${m.companyId ?? '?'}`;

const nombreEmpresa = (companyId?: string): string =>
  ({ 'globofas-s8k': 'Globofast', constroad: 'Constroad', 'inframaq-iax': 'Inframaq' })[companyId ?? ''] ?? '';

export const cuandoDe = (m: Pick<MencionDeProduccion, 'desde' | 'hasta' | 'fechaConocida'>): string => {
  if (!m.fechaConocida) return 'en los próximos días';
  if (m.desde === m.hasta) return `el ${fechaLegible(m.desde)}`;
  return `entre el ${fechaLegible(m.desde)} y el ${fechaLegible(m.hasta)}`;
};

const quienEs = (m: MencionDeProduccion): string => {
  const empresa = nombreEmpresa(m.companyId);
  if (empresa && m.cliente) return `${empresa} (${m.cliente})`;
  return empresa || m.cliente || '';
};

/** «• martes 15/09 — CONSORCIO LOMAS, ~250 m³, desde las 04:30» */
export const lineaDe = (m: MencionDeProduccion): string => {
  const quien = quienEs(m);
  const detalles = [quien, m.cubos ? `~${m.cubos} m³` : '', m.hora ? `desde las ${m.hora}` : ''].filter(Boolean).join(', ');
  return `• ${cuandoDe(m)}${detalles ? ` — ${detalles}` : ''}`;
};

/**
 * Lo que iría a Inframaq Planta: un aviso previo de TODO lo mencionado que no
 * tiene pedido, marcado como no confirmado. Un solo mensaje aunque sean tres
 * producciones: el 14/09 se anunciaron tres en dos mensajes.
 */
export const textoAvisoPrevio = (lista: MencionDeProduccion[]): string =>
  [
    `🗓 *${lista.length === 1 ? 'Posible producción' : 'Posibles producciones'} mencionada${lista.length === 1 ? '' : 's'} en INFRAMAQ admin*`,
    ...lista.map(lineaDe),
    `${lista.length === 1 ? 'El pedido todavía no está' : 'Los pedidos todavía no están'} en Portal, así que puede cambiar. Cuando los carguen, llega el aviso formal con la hora y el checklist.`,
  ].join('\n');

/** Lo que iría a INFRAMAQ admin: que carguen los pedidos con hora de inicio (o les pongan la hora). */
export const textoRecordatorioPedido = (sinPedido: MencionDeProduccion[], sinHora: MencionDeProduccion[] = []): string => {
  const partes: string[] = [];
  if (sinPedido.length) {
    partes.push(`📝 Mencionaron producción pero el pedido no está en Portal:`, ...sinPedido.map(lineaDe));
  }
  if (sinHora.length) {
    partes.push(`${sinPedido.length ? 'Y estos' : '📝 Estos pedidos'} están en Portal *sin hora de inicio*:`, ...sinHora.map(lineaDe));
  }
  partes.push(`Para que lila avise a planta y arme el checklist, ${sinPedido.length ? 'cárguenlos *con hora de inicio*' : 'pónganles la hora de inicio'}.`);
  return partes.join('\n');
};
