import { ALIAS_EMPRESA, fechaDe, hoyLima, normalizar, normalizarPlaca, sumarDias, type ClaveConsulta } from '../consultas/catalogo.js';
import { LOCATIONS } from '../../services/weather-asphalt-forecast.service.js';

/**
 * LAS HERRAMIENTAS: las únicas puertas por las que el modelo puede pedir datos.
 *
 * Es una lista cerrada, y esa es la decisión de fondo (José, 14/09/2026: «¿cómo
 * solucionaríamos las consultas al aire?»). El modelo NO escribe consultas a la
 * base: elige una herramienta de esta lista y saca de la pregunta sus
 * argumentos. El código valida los argumentos contra la pregunta, ejecuta la
 * herramienta con el alcance de siempre (`EMPRESAS_CON_PEDIDOS`, campos en lista
 * blanca, la lista negra §7.5 en código) y arma la respuesta. Una herramienta
 * nueva cubre cientos de formas de preguntar; una frase nueva, una.
 *
 * Dos familias: las consultas del catálogo de siempre (`ClaveConsulta`, que ya
 * tienen su respuesta armada), y las de DATOS, nuevas, que leen la base
 * (`datos.ts`) y se responden con una ficha (`fichas.ts`).
 */

export type HerramientaDeDatos = 'clientes' | 'proveedores' | 'pedidos' | 'kardex';
export type IdHerramienta = ClaveConsulta | HerramientaDeDatos;

export const HERRAMIENTAS_DE_DATOS: readonly HerramientaDeDatos[] = ['clientes', 'proveedores', 'pedidos', 'kardex'];
export const esHerramientaDeDatos = (id: string): id is HerramientaDeDatos =>
  (HERRAMIENTAS_DE_DATOS as readonly string[]).includes(id);

export type CampoArgumento = 'fecha' | 'desde' | 'hasta' | 'unidad' | 'placa' | 'empresa' | 'distrito' | 'nombre';
export const CAMPOS_ARGUMENTO: readonly CampoArgumento[] = ['fecha', 'desde', 'hasta', 'unidad', 'placa', 'empresa', 'distrito', 'nombre'];

export interface Herramienta {
  id: IdHerramienta;
  /** Una línea, para el modelo: qué responde y con qué argumentos. */
  descripcion: string;
  argumentos: readonly CampoArgumento[];
  /** Mira hacia atrás (historial): las fechas del modelo mandan, no las de «el martes» = próximo martes. */
  historial?: boolean;
}

export const HERRAMIENTAS: readonly Herramienta[] = [
  { id: 'orders_day', descripcion: 'qué pedidos o producciones hay un día', argumentos: ['fecha', 'empresa'] },
  { id: 'dispatch_summary', descripcion: 'resumen de despachos de un día', argumentos: ['fecha'] },
  { id: 'day_progress', descripcion: 'cuántos m³ van despachados hoy', argumentos: ['fecha'] },
  { id: 'plant_current_unit', descripcion: 'qué unidad se está cargando en planta ahora', argumentos: [] },
  { id: 'site_current_unit', descripcion: 'qué unidad está en campo / en obra ahora', argumentos: [] },
  { id: 'unit_driver', descripcion: 'quién maneja / conductor de una unidad', argumentos: ['unidad', 'placa', 'fecha'] },
  { id: 'unit_departure', descripcion: 'a qué hora salió una unidad', argumentos: ['unidad', 'placa', 'fecha'] },
  { id: 'unit_eta', descripcion: 'cuánto falta para que llegue una unidad', argumentos: ['unidad', 'placa'] },
  { id: 'unit_media', descripcion: 'fotos y videos de una unidad', argumentos: ['unidad', 'placa', 'fecha'] },
  { id: 'order_link', descripcion: 'enlace/link del pedido para el cliente', argumentos: ['empresa', 'fecha'] },
  { id: 'guias_day', descripcion: 'guías y vales de remisión generados', argumentos: ['empresa', 'fecha'] },
  { id: 'reports_status', descripcion: 'informes de campo hechos (imprimación, área adicional…)', argumentos: ['fecha'] },
  { id: 'checklist_status', descripcion: 'cómo va el checklist de la producción', argumentos: ['fecha'] },
  { id: 'plant_finish', descripcion: 'cuánto falta para terminar la producción en planta', argumentos: [] },
  { id: 'site_finish', descripcion: 'cuánto falta para terminar en campo / control de pista', argumentos: [] },
  { id: 'tank_levels', descripcion: 'galones, niveles, líquidos, PEN, petróleo, gasohol de los tanques', argumentos: [] },
  { id: 'production_consume', descripcion: 'consumos de una producción', argumentos: ['fecha'] },
  { id: 'aggregates_stock', descripcion: 'stock actual de agregados: arena, piedra, confitillo', argumentos: [] },
  { id: 'weather', descripcion: 'clima, lluvia, pronóstico en un distrito', argumentos: ['distrito', 'fecha'] },
  { id: 'weather_districts', descripcion: 'qué distritos o zonas tienen riesgo de lluvia (todos los distritos, un día o la semana)', argumentos: ['fecha'] },
  { id: 'help', descripcion: 'qué puede hacer Lila', argumentos: [] },
  { id: 'clientes', descripcion: 'datos de UN cliente: RUC, contacto, teléfono, correo, dirección, sus últimos pedidos', argumentos: ['nombre'] },
  { id: 'proveedores', descripcion: 'datos de UN proveedor: RUC, contacto, teléfono, qué vende o transporta', argumentos: ['nombre'] },
  { id: 'pedidos', descripcion: 'historial de pedidos en un rango de fechas, de una empresa o de un cliente', argumentos: ['desde', 'hasta', 'empresa', 'nombre'], historial: true },
  { id: 'kardex', descripcion: 'ingresos, salidas y movimientos de UN material en un rango de fechas', argumentos: ['nombre', 'desde', 'hasta', 'empresa'], historial: true },
];

export const herramienta = (id: string): Herramienta | undefined => HERRAMIENTAS.find((h) => h.id === id);

/** Los argumentos ya validados contra la pregunta. */
export interface Argumentos {
  fecha?: string;
  desde?: string;
  hasta?: string;
  unitNumber?: number;
  plate?: string;
  companyId?: string;
  distrito?: string;
  nombre?: string;
}

export interface ArgumentoCrudo {
  campo: string;
  valor: string;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (v: string, hoy: string): boolean => {
  if (!FECHA_ISO.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  // Un año hacia atrás, dos meses hacia adelante: fuera de eso es un invento.
  return v >= sumarDias(hoy, -400) && v <= sumarDias(hoy, 60);
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ultimoDia = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number): string => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * El RANGO que nombra la pregunta, resuelto por código: «este mes», «el mes
 * pasado», «esta semana», «la semana pasada», «en agosto», «hoy/ayer». Los
 * rangos en curso («esta semana», «este mes») van completos, con los días por
 * venir: «qué pedidos hay esta semana» pregunta por lo programado. El
 * modelo se equivoca justo acá («este mes» → todo el año), así que lo que se
 * puede leer con reglas se lee con reglas y el modelo solo aporta lo demás
 * («del 1 al 15», «desde el 3 de agosto»).
 */
export const rangoDe = (pregunta: string, hoy: string): { desde: string; hasta: string } | undefined => {
  const t = normalizar(pregunta);
  const [y, m, d] = hoy.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const lunes = sumarDias(hoy, -((dow + 6) % 7));
  if (/\b(anteayer|antes de ayer)\b/.test(t)) return { desde: sumarDias(hoy, -2), hasta: sumarDias(hoy, -2) };
  if (/\bayer\b/.test(t)) return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) };
  if (/\bhoy\b/.test(t)) return { desde: hoy, hasta: hoy };
  if (/\b(este|del|el) mes\b/.test(t) && !/\bmes pasado\b/.test(t)) return { desde: iso(y, m, 1), hasta: iso(y, m, ultimoDia(y, m)) };
  if (/\bmes pasado\b/.test(t)) {
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    return { desde: iso(py, pm, 1), hasta: iso(py, pm, ultimoDia(py, pm)) };
  }
  if (/\bsemana pasada\b/.test(t)) return { desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, -1) };
  // «Esta semana» es la semana ENTERA, lunes a domingo: lo que ya pasó y lo que
  // está programado. Un historial no tiene nada en los días por venir, y los
  // pedidos programados sí, así que el rango completo sirve a los dos.
  if (/\b(esta|de la|de esta|la|en la) semana\b/.test(t) || /\bsemana\b/.test(t)) return { desde: lunes, hasta: sumarDias(lunes, 6) };
  if (/\b(proximos|estos) dias\b/.test(t)) return { desde: hoy, hasta: sumarDias(hoy, 7) };
  const mes = MESES.findIndex((nombre) => new RegExp(`\\b(en|de|del) (mes de )?${nombre === 'septiembre' ? 'se[pt]?tiembre' : nombre}\\b`).test(t));
  if (mes >= 0) {
    // «en agosto» es el agosto más reciente: el de este año si ya empezó, si no el del año pasado.
    const anio = mes + 1 <= m ? y : y - 1;
    return { desde: iso(anio, mes + 1, 1), hasta: iso(anio, mes + 1, ultimoDia(anio, mes + 1)) };
  }
  return undefined;
};

const textoConFecha = (t: string): boolean => /\d/.test(t) || MESES.some((m) => new RegExp(`\\b${m}\\b`).test(t)) || /\bse[pt]?tiembre\b/.test(t);

const empresaPorAlias = (valor: string): string | undefined => {
  const v = normalizar(valor);
  return ALIAS_EMPRESA.find((e) => e.alias.some((a) => v === a || new RegExp(`\\b${a}\\b`).test(v)))?.companyId;
};

const aliasEnPregunta = (companyId: string, t: string): boolean =>
  ALIAS_EMPRESA.find((e) => e.companyId === companyId)?.alias.some((a) => new RegExp(`\\b${a}\\b`).test(t)) ?? false;

/**
 * DEL MODELO SOLO SE ACEPTA LO QUE LA PREGUNTA RESPALDA. Un modelo de 1,5 B
 * rellena con lo que sea cuando se le exige un campo («placa: 123456789»,
 * «nombre: Lila»), así que cada argumento se contrasta con el texto: una
 * unidad tiene que estar escrita en la pregunta, una empresa por su alias, un
 * distrito por su nombre, un nombre al menos por una de sus palabras.
 *
 * LAS FECHAS QUE EL CÓDIGO ENTIENDE, LAS PONE EL CÓDIGO. «ayer», «el jueves»,
 * «15/09» ya se resuelven de forma determinista (`fechaDe`) y eso manda sobre
 * lo que diga el modelo. El modelo aporta las que el código no sabe leer:
 * «la semana pasada», «en agosto», «del 1 al 15».
 */
export const normalizarArgumentos = (
  id: IdHerramienta,
  crudos: ArgumentoCrudo[],
  pregunta: string,
  ahoraMs = Date.now()
): Argumentos => {
  const h = herramienta(id);
  const t = normalizar(pregunta);
  const tCompacto = t.replace(/[\s-]/g, '');
  const hoy = hoyLima(ahoraMs);
  const args: Argumentos = {};
  const acepta = (campo: CampoArgumento): boolean => Boolean(h?.argumentos.includes(campo));

  for (const { campo, valor: crudo } of crudos) {
    const valor = String(crudo ?? '').trim();
    if (!valor) continue;
    switch (campo) {
      case 'unidad': {
        const n = Number(valor);
        if (acepta('unidad') && Number.isInteger(n) && n > 0 && n < 100 && new RegExp(`\\b${n}\\b`).test(t)) args.unitNumber = n;
        break;
      }
      case 'placa': {
        // «placa: 4» es la unidad 4 con el nombre equivocado.
        if (/^\d{1,2}$/.test(valor)) {
          const n = Number(valor);
          if (acepta('unidad') && new RegExp(`\\b${n}\\b`).test(t)) args.unitNumber = n;
          break;
        }
        const placa = normalizarPlaca(valor);
        if (acepta('placa') && /^[A-Z]{3}\d{3}$/.test(placa) && tCompacto.includes(placa.toLowerCase())) args.plate = placa;
        break;
      }
      case 'empresa': {
        const companyId = empresaPorAlias(valor);
        if (acepta('empresa') && companyId && aliasEnPregunta(companyId, t)) {
          args.companyId = companyId;
          break;
        }
        // «empresa: consorcio los pinos» es un CLIENTE llamado así (para el
        // modelo un consorcio es una empresa): si la herramienta busca por
        // nombre y las palabras están en la pregunta, es el nombre.
        if (!companyId && acepta('nombre') && !args.nombre) {
          const palabras = normalizar(valor).split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 3);
          if (palabras.length && palabras.some((p) => t.includes(p))) args.nombre = valor.slice(0, 60);
        }
        break;
      }
      case 'nombre': {
        // «nombre: constroad» en una herramienta que acepta empresa es la empresa.
        const comoEmpresa = empresaPorAlias(valor);
        if (comoEmpresa && acepta('empresa') && aliasEnPregunta(comoEmpresa, t)) {
          args.companyId = comoEmpresa;
          break;
        }
        if (!acepta('nombre')) break;
        const palabras = normalizar(valor).split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 3);
        if (palabras.length && palabras.some((p) => t.includes(p))) args.nombre = valor.slice(0, 60);
        break;
      }
      case 'distrito': {
        const v = normalizar(valor);
        const d = LOCATIONS.slice(1).find((l) => normalizar(l.name) === v);
        if (acepta('distrito') && d && t.includes(normalizar(d.name))) args.distrito = d.name;
        break;
      }
      case 'fecha':
      case 'desde':
      case 'hasta': {
        // Una fecha del modelo solo si la pregunta trae con qué armarla: un
        // número o un mes. «Clima para planta esta semana» → «2026-09-01» era
        // un invento (14/09); lo que el código sabe leer lo pone después.
        if (acepta(campo) && fechaValida(valor, hoy) && textoConFecha(t)) args[campo] = valor;
        break;
      }
      default:
        break;
    }
  }

  // Las fechas que el código sabe leer mandan (salvo en el historial, donde
  // «el martes» mira hacia atrás y el modelo ya lo entendió así).
  if (acepta('fecha')) {
    const propia = fechaDe(pregunta, ahoraMs);
    if (propia) args.fecha = propia;
    else if (/\bhoy\b/.test(t)) args.fecha = hoy;
    else if (/\bmanana\b/.test(t) && !/\bpasado manana\b/.test(t)) args.fecha = sumarDias(hoy, 1);
  }
  if (acepta('desde') || acepta('hasta')) {
    const rango = rangoDe(pregunta, hoy);
    if (rango) Object.assign(args, rango);
    if (args.desde && !args.hasta) args.hasta = args.desde;
    if (args.hasta && !args.desde) args.desde = args.hasta;
    if (args.desde && args.hasta && args.hasta < args.desde) [args.desde, args.hasta] = [args.hasta, args.desde];
  }
  return args;
};
