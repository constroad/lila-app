import logger from '../../utils/logger.js';
import { COMPANY_PILOTO } from '../checklist/alcance.js';
import { extraerParametros, hoyLima, sumarDias } from '../consultas/catalogo.js';
import { preguntar } from '../consultas/pendientes.js';
import { buscarClientes, buscarProveedores, ingresosDeAgregados, movimientosDeMaterial, nombresDeEmpresas, pedidosEntre, pedidosSinCertificado } from './datos.js';
import { rangoDe } from './herramientas.js';
import {
  FILAS_PARA_IMAGEN,
  fichaCertificados,
  fichaClientes,
  fichaIngresos,
  fichaKardex,
  fichaPedidos,
  fichaProveedores,
  kardexConMovimientos,
  resumenCertificados,
  tablaCertificados,
  tablaIngresos,
  tablaKardex,
  tablaPedidos,
} from './fichas.js';
import { pngTabla, type TablaSpec } from '../consultas/imagen.js';
import type { Archivo } from '../consultas/archivos.js';
import type { Argumentos, HerramientaDeDatos } from './herramientas.js';
import { redactar } from './redaccion.js';

export { elegirHerramienta, esClaveDeCatalogo, type Eleccion } from './seleccion.js';
export { descargarModelo, estadoLlm } from './modelo.js';
export { esHerramientaDeDatos, herramientaDeDatosPorReglas, normalizarArgumentos, rangoDe, type Argumentos, type HerramientaDeDatos } from './herramientas.js';

/**
 * UNA HERRAMIENTA DE DATOS, DE PUNTA A PUNTA: leer (`datos.ts`), armar la ficha
 * (`fichas.ts`) y, si el modelo llega a tiempo y respeta los datos, la frase
 * encima (`redaccion.ts`). Si falta el dato con el que buscar (el nombre), se
 * pregunta y la respuesta de la persona completa esta misma consulta.
 */

const DIAS_POR_DEFECTO = 30;

const PREGUNTA_NOMBRE: Record<HerramientaDeDatos, string> = {
  clientes: '¿De qué cliente? Dime el nombre.',
  proveedores: '¿De qué proveedor? Dime el nombre.',
  pedidos: '',
  kardex: '¿De qué material? Dime el nombre (arena, piedra, confitillo…).',
  ingresos_agregados: '',
  certificados_pendientes: '',
};

export interface FichaArmada {
  ficha: string;
  resultados: number;
  /** Para listas largas: la tabla en imagen y el texto corto que va de caption. */
  tabla?: TablaSpec;
  resumen?: string;
}

/** La ficha de una herramienta con sus argumentos ya validados, y cuántos resultados trae. */
export const fichaPara = async (id: HerramientaDeDatos, args: Argumentos, ahoraMs = Date.now()): Promise<FichaArmada> => {
  const hoy = hoyLima(ahoraMs);
  // Sin rango, los últimos 30 días: lo que alguien quiere decir con «los pedidos de cobeñas».
  const desde = args.desde ?? sumarDias(hoy, -DIAS_POR_DEFECTO);
  const hasta = args.hasta ?? hoy;
  switch (id) {
    case 'clientes': {
      const lista = await buscarClientes(args.nombre ?? '');
      return { ficha: fichaClientes(args.nombre ?? '', lista), resultados: lista.length };
    }
    case 'proveedores': {
      const lista = await buscarProveedores(args.nombre ?? '');
      return { ficha: fichaProveedores(args.nombre ?? '', lista), resultados: lista.length };
    }
    case 'pedidos': {
      const nombres = await nombresDeEmpresas();
      // «Los pedidos en inframaq» son los de LA PLANTA (todos): inframaq la
      // opera, y los pedidos los hacen globofast y constroad. Filtrar por la
      // empresa inframaq contestaría «no hay pedidos» con la planta llena.
      const companyId = args.companyId === COMPANY_PILOTO ? undefined : args.companyId;
      const h = await pedidosEntre({ desde, hasta, companyId, cliente: args.nombre });
      const filtro = { empresa: companyId ? nombres.get(companyId) || companyId : undefined, cliente: args.nombre };
      const ficha = fichaPedidos(h, filtro, hoy);
      const larga = h.pedidos.length > FILAS_PARA_IMAGEN;
      return { ficha, resultados: h.pedidos.length, tabla: larga ? tablaPedidos(h, filtro, hoy) : undefined, resumen: larga ? ficha.split('\n').slice(0, 2).join('\n') : undefined };
    }
    case 'kardex': {
      const lista = await movimientosDeMaterial({ material: args.nombre ?? '', desde, hasta, companyId: args.companyId });
      const ficha = fichaKardex(args.nombre ?? '', lista);
      const filas = kardexConMovimientos(lista).reduce((s, k) => s + k.movimientos.length, 0);
      const larga = filas > FILAS_PARA_IMAGEN;
      // De caption, la cabecera de cada material sin sus movimientos (van en la imagen).
      const resumen = ficha.split('\n\n').map((b) => b.split('\n').filter((l) => !l.startsWith('• ')).join('\n')).join('\n\n');
      return { ficha, resultados: lista.length, tabla: larga ? tablaKardex(args.nombre ?? '', lista) : undefined, resumen: larga ? resumen : undefined };
    }
    case 'ingresos_agregados': {
      // «¿Cuántos agregados llegaron?» sin fecha es hoy, no los últimos 30 días.
      const r = await ingresosDeAgregados({ desde: args.desde ?? hoy, hasta: args.hasta ?? hoy, companyId: args.companyId });
      const ficha = fichaIngresos(r, hoy);
      const filas = r.proveedores.reduce((s, p) => s + p.materiales.length, 0);
      const larga = filas > FILAS_PARA_IMAGEN;
      return { ficha, resultados: r.proveedores.length, tabla: larga ? tablaIngresos(r, hoy) : undefined, resumen: larga ? ficha.split('\n').slice(0, 2).join('\n') : undefined };
    }
    case 'certificados_pendientes': {
      const nombres = await nombresDeEmpresas();
      const r = await pedidosSinCertificado({ desde, hasta, companyId: args.companyId });
      const empresa = args.companyId ? nombres.get(args.companyId) || args.companyId : undefined;
      const larga = r.pedidos.length > FILAS_PARA_IMAGEN;
      return {
        ficha: fichaCertificados(r, { desde, hasta }, empresa),
        resultados: r.pedidos.length,
        tabla: larga ? tablaCertificados(r, { desde, hasta }, empresa) : undefined,
        resumen: larga ? resumenCertificados(r, { desde, hasta }, empresa) : undefined,
      };
    }
    default:
      return { ficha: '', resultados: 0 };
  }
};

/**
 * La frase del modelo solo sobre UNA ficha corta (un cliente, un proveedor).
 * Sobre una lista de pedidos o de movimientos el modelo elige una línea al
 * azar y la presenta como el total (medido 14/09: «despachamos 175 m³ al
 * CONSORCIO OLIVA» sobre 27 pedidos), y el encabezado de esas fichas ya es la
 * respuesta directa.
 */
const conFrase = (id: HerramientaDeDatos, resultados: number): boolean => (id === 'clientes' || id === 'proveedores') && resultados === 1;

export const responderConDatos = async (
  id: HerramientaDeDatos,
  args: Argumentos,
  pregunta: string,
  quien: string,
  grupo: string
): Promise<{ texto: string; archivos?: Archivo[] }> => {
  if (!args.nombre && PREGUNTA_NOMBRE[id]) {
    preguntar({
      quien,
      grupo,
      opciones: [],
      tipo: 'texto',
      continuar: (_i, texto) => responderConDatos(id, { ...args, nombre: String(texto || '').trim() }, `${pregunta} ${texto ?? ''}`, quien, grupo),
    });
    return { texto: PREGUNTA_NOMBRE[id] };
  }
  const inicio = Date.now();
  const { ficha, resultados, tabla, resumen } = await fichaPara(id, args);
  // Una lista larga va en IMAGEN con el resumen de caption: en el celular, 24
  // pedidos en texto no se leen (José, 14/09). Si la imagen no sale, el texto.
  if (tabla && resumen) {
    try {
      const buffer = await pngTabla(tabla);
      logger.info(`[agente] ${id} ${JSON.stringify(args)} → tabla en imagen (${tabla.secciones.reduce((s, x) => s + x.filas.length, 0)} filas) en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
      return { texto: '', archivos: [{ tipo: 'image', url: '', nombre: `${id}-${Date.now()}.png`, fechaMs: Date.now(), mime: 'image/png', companyId: '', buffer, caption: resumen }] };
    } catch (error) {
      logger.warn(`[agente] no pude armar la tabla de ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const frase = conFrase(id, resultados) ? await redactar(pregunta, ficha) : null;
  logger.info(`[agente] ${id} ${JSON.stringify(args)} → ficha de ${ficha.split('\n').length} línea(s)${frase ? ' con frase' : ''} en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  return { texto: frase ? `${frase}\n\n${ficha}` : ficha };
};

/**
 * «Qué pedidos hay esta semana / este mes / la semana pasada»: la regla de
 * siempre lo mandaba a los pedidos de HOY. Con un rango de más de un día en la
 * pregunta, la respuesta es el historial/la programación de ese rango, sin
 * pasar por el modelo. `null` si la pregunta no trae un rango así.
 */
export const argumentosDeRango = (pregunta: string, ahoraMs = Date.now()): Argumentos | null => {
  const rango = rangoDe(pregunta, hoyLima(ahoraMs));
  if (!rango || rango.desde === rango.hasta) return null;
  const { companyId } = extraerParametros(pregunta, ahoraMs);
  return { ...rango, ...(companyId ? { companyId } : {}) };
};
