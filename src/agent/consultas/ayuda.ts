import { normalizar } from './catalogo.js';

/**
 * LA AYUDA, POR NIVELES. José, 14/09/2026: «el menú me parece muy desordenado;
 * ¿qué opciones hay para no hacer tan extenso el mensaje, quizá navegación?».
 *
 * Lo que la comunidad hace con WhatsApp sin la API oficial: un menú numerado
 * corto y un nivel por tema (los botones y las listas interactivas Meta las
 * retiró para números que no van por su API, y las encuestas se mandan pero el
 * voto no se puede leer con esta versión de Baileys). Acá: «ayuda» muestra
 * seis temas; se responde con el número —la misma pregunta pendiente por
 * persona que usamos para «¿cuál pedido?»— o con la palabra («ayuda clima»).
 * Y con Qwen el menú exhaustivo dejó de hacer falta: se pregunta con palabras.
 */

export interface TemaAyuda {
  titulo: string;
  /** Palabras con las que se pide directo: «ayuda clima». */
  palabras: string[];
  ejemplos: string[];
  /** Notas al pie del tema, para lo que no es un ejemplo. */
  notas?: string[];
}

export const TEMAS: TemaAyuda[] = [
  {
    titulo: 'Despachos y unidades',
    palabras: ['despacho', 'despachos', 'unidad', 'unidades', 'carro', 'pedidos'],
    ejemplos: [
      'qué pedidos hay hoy · qué pedidos hay esta semana',
      'resumen de despachos de ayer (en imagen)',
      'cuántos m³ van · cuánto falta para terminar en planta / en campo',
      'a qué hora salió la 3 · quién maneja la 4 · cuánto falta para que llegue la 2',
      'fotos y video de la unidad de placa AML838',
    ],
  },
  {
    titulo: 'Planta',
    palabras: ['planta', 'tanque', 'tanques', 'agregado', 'agregados', 'kardex', 'insumo', 'insumos'],
    ejemplos: [
      'resumen de líquidos / galones en los tanques (en imagen)',
      'stock de agregados (en imagen)',
      'cuántos agregados llegaron hoy (por proveedor)',
      'consumos de la producción de hoy',
      'ingresos de arena en Globofast este mes (kardex)',
    ],
  },
  {
    titulo: 'Documentos y certificados',
    palabras: ['documento', 'documentos', 'certificado', 'certificados', 'guia', 'guias', 'guía', 'guías', 'enlace', 'informe', 'informes', 'checklist'],
    ejemplos: [
      'el enlace del pedido de hoy de Globofast (si no existe, lo genero: producción siempre; colocación e informes, si me lo pides)',
      'las guías generadas para la producción de hoy',
      'dame el informe de planta · pásame el control de pista de los pinos · manda la valorización de comas (en PDF)',
      'ya está el informe de imprimación / área adicional de hoy',
      'qué pedidos no tienen certificado cargado (por cliente)',
      'cómo va el checklist',
    ],
  },
  {
    titulo: 'Clima',
    palabras: ['clima', 'lluvia', 'tiempo', 'pronostico', 'pronóstico'],
    ejemplos: [
      'cómo está el clima en Lurigancho · va a llover el martes en Ate',
      'clima de la semana en Comas · clima el 20 de septiembre (hasta 16 días)',
      'qué distritos están propensos a lluvia esta semana',
    ],
  },
  {
    titulo: 'Clientes, proveedores e historial',
    palabras: ['cliente', 'clientes', 'proveedor', 'proveedores', 'historial'],
    ejemplos: [
      'el teléfono / RUC / dirección del cliente Cobeñas',
      'quién nos vende petróleo · datos del proveedor Julio Licas',
      'qué le despachamos a Consorcio Los Pinos la semana pasada',
      'cuántos pedidos tuvo Constroad en agosto',
    ],
  },
  {
    titulo: 'Cómo funciona',
    palabras: ['funciona', 'comandos', 'comando', 'fechas', 'propuestas', 'off', 'on'],
    ejemplos: [],
    notas: [
      '📅 *Fechas*: hoy, ayer, mañana, el martes, el martes pasado, 15/09, esta semana, la semana pasada, en agosto.',
      '🏷 *Respondo solo si me etiquetas* (@lila o mi número) o si respondes a un mensaje mío: «¿y la 3?», «¿y en Ate?». Si hay más de una opción, te pregunto cuál: responde con el número.',
      '📨 *Propuestas* (aviso a planta, checklist de planta, recordatorios): las publico aquí; un administrador responde al mensaje (lo desliza) con *1* para enviarlo o *3* para descartar. «@lila manda el aviso a planta con la programación de mañana» me la pide a mí.',
      '🔌 «@lila off» me apaga (sigo escuchando, no mando nada); «@lila on» me prende; «@lila estás encendida?» te lo dice. Solo administradores.',
      'No respondo precios, pagos, deudas ni datos personales de conductores.',
    ],
  },
];

/** El menú de arriba: seis temas y dos ejemplos del momento. */
export const menuAyuda = (contexto: { hayPedidosHoy: boolean } = { hayPedidosHoy: false }): string => {
  const delMomento = contexto.hayPedidosHoy
    ? ['«resumen de despachos de hoy»', '«cuánto falta para terminar en planta»']
    : ['«qué pedidos hay esta semana»', '«cuántos agregados llegaron hoy»'];
  return [
    '🤖 *Lila* — pregúntame con tus palabras, por ejemplo ' + delMomento.join(' o ') + '.',
    'O elige un tema:',
    ...TEMAS.map((t, i) => `${i + 1}. ${t.titulo}`),
    '',
    'Responde con el número, o escribe «ayuda clima», «ayuda planta»…',
  ].join('\n');
};

export const textoTema = (indice: number): string => {
  const t = TEMAS[indice];
  if (!t) return menuAyuda();
  const lineas = [`*${indice + 1}. ${t.titulo}*`, ...t.ejemplos.map((e) => `• ${e}`), ...(t.notas ?? [])];
  lineas.push('', 'Otro tema: responde su número. O pregúntame directo.');
  return lineas.join('\n');
};

/** «ayuda clima» → el índice del tema; «ayuda» solo → null. */
export const temaPorPalabra = (pregunta: string): number | null => {
  const t = normalizar(pregunta).replace(/[¿?¡!.,]/g, ' ');
  const m = t.match(/\b(ayuda|help|menu)\b\s*(?:de |del |con |sobre |para )?(.*)$/);
  const resto = (m?.[2] ?? '').trim();
  if (!resto) return null;
  const i = TEMAS.findIndex((tema) => tema.palabras.some((p) => new RegExp(`\\b${normalizar(p)}\\b`).test(resto)));
  return i >= 0 ? i : null;
};
