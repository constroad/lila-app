import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { Schema, type Model } from 'mongoose';
import { getSharedConnection } from '../../database/sharedConnection.js';
import logger from '../../utils/logger.js';
import type { Catalogo, ItemCatalogo } from './catalogo.js';
import { guardarCatalogo, leerCatalogo } from './catalogo.js';
import type { Faq } from './faq.js';
import { guardarFaq, listarFaq } from './faq.js';
import { guardarNegocio, leerNegocio, type CambiosFicha, type FichaNegocio } from './negocio.js';
import { guardarServicios, leerServicios, slugDe, type GuionEditable, type PreguntaEditable, type ServicioEditable } from './servicios.js';

/**
 * IMPORTAR DESDE EXCEL (A13, spec DALI §4 `importar`): una plantilla con
 * cinco hojas —Negocio, Servicios, Preguntas, Preguntas frecuentes,
 * Catálogo— que sale con lo que la empresa YA tiene (así también sirve para
 * exportar), se completa en Excel y se sube. Se lee, se dice qué se normalizó
 * y recién con «Guardar» se aplica: reemplazando todo lo de cada hoja con
 * datos, o agregando solo lo nuevo (lo que coincide por código, pregunta o
 * nombre se actualiza). Cada importación queda en `bot_imports`.
 */
export const HOJAS = ['Negocio', 'Servicios', 'Preguntas', 'Preguntas frecuentes', 'Catálogo'] as const;
export type Hoja = (typeof HOJAS)[number];

export interface AvisoImportacion {
  seccion: Hoja;
  fila: number;
  detalle: string;
  /** `omitido`: la fila no entra; `ajustado`: entra con un cambio. */
  nivel: 'omitido' | 'ajustado';
}

export interface ResumenImportacion {
  negocio: number;
  servicios: number;
  preguntas: number;
  faqs: number;
  catalogo: number;
  total: number;
}

export type Modo = 'reemplazar' | 'agregar';

interface FilaServicio {
  fila: number;
  id: string;
  nombre: string;
  palabras: string[];
  modo: 'preguntas' | 'derivar';
  activo: boolean;
}
interface FilaPregunta {
  fila: number;
  /** El identificador interno del dato («tipoBase»); lo pone la plantilla para que una ida y vuelta no lo cambie. */
  campo: string;
  servicio: string;
  orden: number;
  pregunta: string;
  dato: string;
  tipo: string;
  opciones: Array<{ valor: string; palabras: string[] }>;
  condicion: string;
  pista: string;
  explicacion: string;
}
interface FilaFaq {
  fila: number;
  pregunta: string;
  respuesta: string;
  variantes: string[];
  categoria: string;
  activa: boolean;
}
interface FilaCatalogo {
  fila: number;
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precio?: number;
  disponible: boolean;
  descripcion: string;
}

export interface HojasLeidas {
  negocio: Partial<Omit<FichaNegocio, 'contacto'>> & {
    telefono?: string;
    correo?: string;
    redSocial?: string;
  };
  servicios: FilaServicio[];
  preguntas: FilaPregunta[];
  faqs: FilaFaq[];
  catalogo: FilaCatalogo[];
}

interface Actual {
  guion: GuionEditable;
  faqs: Faq[];
  catalogo: Catalogo;
}

const CAMPOS_NEGOCIO: Array<[string, keyof HojasLeidas['negocio'], string]> = [
  ['Nombre comercial', 'nombreComercial', 'Como lo ve el cliente'],
  ['Descripción', 'descripcion', 'Hasta 240 letras; Dali se presenta con esto'],
  ['RUC', 'ruc', '11 dígitos'],
  ['Sitio web', 'web', 'sin https://'],
  ['Dirección', 'direccion', 'Planta u oficina'],
  ['Zona que atiende', 'zona', 'Hasta dónde llega'],
  ['Cómo llegar', 'comoLlegar', 'El texto que Dali manda si preguntan dónde están'],
  ['Teléfono', 'telefono', ''],
  ['Correo', 'correo', ''],
  ['Red social', 'redSocial', '@usuario'],
  ['Ofrece (separado por ;)', 'ofrece', 'Otros productos o servicios que Dali puede mencionar'],
  ['No ofrece (separado por ;)', 'noOfrece', 'Lo que Dali aclara que no hacen'],
];
const ENCABEZADOS = {
  Servicios: ['Código', 'Nombre', 'Palabras clave (separadas por ;)', 'Modo (preguntas / derivar)', 'Activo (sí / no)'],
  Preguntas: [
    'Servicio (código)',
    'Orden',
    'Pregunta',
    'Dato',
    'Tipo (numero / texto / sino / opcion)',
    'Opciones (valor: palabra; palabra | valor2: palabra)',
    'Condición (Dato = valor)',
    'Pista',
    'Explicación',
    'Código del dato (no tocar)',
  ],
  'Preguntas frecuentes': ['Pregunta', 'Respuesta', 'Variantes (separadas por ;)', 'Categoría', 'Activa (sí / no)'],
  Catálogo: ['Código', 'Nombre', 'Categoría', 'Unidad', 'Precio (S/)', 'Disponible (sí / no)', 'Descripción'],
} as const;

const siNo = (v: boolean): string => (v ? 'sí' : 'no');
const esSi = (v: string, porDefecto = true): boolean => {
  const t = v.trim().toLowerCase();
  if (!t) return porDefecto;
  return !['no', 'n', 'false', '0', 'apagado', 'inactivo'].includes(t);
};
const lista = (v: string): string[] => [
  ...new Set(
    v
      .split(/[;\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
  ),
];
const opcionesATexto = (opciones: Array<{ valor: string; palabras: string[] }>): string =>
  opciones.map((o) => `${o.valor}${o.palabras.length ? `: ${o.palabras.join('; ')}` : ''}`).join(' | ');
const opcionesDeTexto = (v: string): Array<{ valor: string; palabras: string[] }> =>
  v
    .split('|')
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      const [valor, resto] = parte.split(/:(.+)/);
      return { valor: valor.trim(), palabras: resto ? lista(resto) : [] };
    })
    .filter((o) => o.valor);

/** La plantilla con lo actual de la empresa: cinco hojas, encabezados en negrita, una nota por hoja. */
export const armarPlantilla = async (actual: { ficha: FichaNegocio; guion: GuionEditable; faqs: Faq[]; catalogo: Catalogo }): Promise<Buffer> => {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Dali';
  const hoja = (nombre: Hoja, encabezados: readonly string[], anchos: number[]) => {
    const h = libro.addWorksheet(nombre);
    h.addRow([...encabezados]).font = { bold: true };
    h.columns = anchos.map((width) => ({ width }));
    h.views = [{ state: 'frozen', ySplit: 1 }];
    return h;
  };
  const negocio = hoja('Negocio', ['Campo', 'Valor', 'Ayuda'], [28, 60, 50]);
  const f = actual.ficha;
  const valores: Record<string, string> = {
    nombreComercial: f.nombreComercial,
    descripcion: f.descripcion,
    ruc: f.ruc,
    web: f.web,
    direccion: f.direccion,
    zona: f.zona,
    comoLlegar: f.comoLlegar,
    telefono: f.contacto.telefono,
    correo: f.contacto.correo,
    redSocial: f.contacto.redSocial,
    ofrece: f.ofrece.join('; '),
    noOfrece: f.noOfrece.join('; '),
  };
  for (const [etiqueta, clave, ayuda] of CAMPOS_NEGOCIO) negocio.addRow([etiqueta, valores[clave], ayuda]);

  const servicios = hoja('Servicios', ENCABEZADOS.Servicios, [18, 40, 60, 22, 14]);
  for (const s of actual.guion.servicios) servicios.addRow([s.id, s.nombre, s.palabras.join('; '), s.modo, siNo(s.activo)]);

  const preguntas = hoja('Preguntas', ENCABEZADOS.Preguntas, [18, 8, 60, 18, 16, 60, 24, 40, 50, 18]);
  for (const s of actual.guion.servicios) {
    s.preguntas.forEach((p, i) => {
      const condicion = p.cuando ? `${s.preguntas.find((q) => q.campo === p.cuando!.campo)?.etiqueta ?? p.cuando.campo} = ${[p.cuando.es].flat()[0] ?? ''}` : '';
      preguntas.addRow([s.id, i + 1, p.pregunta, p.etiqueta, p.tipo, opcionesATexto(p.opciones), condicion, p.pista ?? '', p.explicacion ?? '', p.campo]);
    });
  }

  const faqs = hoja('Preguntas frecuentes', ENCABEZADOS['Preguntas frecuentes'], [50, 70, 50, 18, 14]);
  for (const q of actual.faqs) faqs.addRow([q.pregunta, q.respuesta, q.variantes.join('; '), q.categoria, siNo(q.activa)]);

  const catalogo = hoja('Catálogo', ENCABEZADOS.Catálogo, [16, 40, 20, 14, 12, 16, 60]);
  for (const i of actual.catalogo.items) catalogo.addRow([i.sku, i.nombre, i.categoria, i.unidad, i.precio ?? '', siNo(i.disponible), i.descripcion]);

  return Buffer.from(await libro.xlsx.writeBuffer());
};

const textoDe = (celda: ExcelJS.CellValue): string => {
  if (celda == null) return '';
  if (typeof celda === 'object') {
    if ('richText' in celda) return celda.richText.map((r) => r.text).join('');
    if ('text' in celda) return String(celda.text ?? '');
    if ('result' in celda) return String(celda.result ?? '');
    if (celda instanceof Date) return celda.toISOString();
    return '';
  }
  return String(celda).trim();
};

const filasDe = (libro: ExcelJS.Workbook, nombre: Hoja, columnas: number): Array<{ fila: number; c: string[] }> => {
  const hoja = libro.getWorksheet(nombre);
  if (!hoja) return [];
  const filas: Array<{ fila: number; c: string[] }> = [];
  hoja.eachRow((row, numero) => {
    if (numero === 1) return;
    const c = Array.from({ length: columnas }, (_, i) => textoDe(row.getCell(i + 1).value).trim());
    if (c.some(Boolean)) filas.push({ fila: numero, c });
  });
  return filas;
};

/** Las cinco hojas, leídas tal cual (sin juzgar todavía). */
export const leerLibro = (libro: ExcelJS.Workbook): HojasLeidas => {
  const negocio: HojasLeidas['negocio'] = {};
  for (const { c } of filasDe(libro, 'Negocio', 2)) {
    const campo = CAMPOS_NEGOCIO.find(([etiqueta]) => etiqueta.toLowerCase() === c[0].toLowerCase());
    if (!campo) continue;
    const [, clave] = campo;
    if (clave === 'ofrece' || clave === 'noOfrece') negocio[clave] = lista(c[1]);
    else negocio[clave] = c[1];
  }
  const precioDe = (v: string): number | undefined => {
    const limpio = v.replace(/[^\d.,]/g, '').replace(',', '.');
    if (!limpio) return undefined;
    const n = Number(limpio);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
  };
  return {
    negocio,
    servicios: filasDe(libro, 'Servicios', 5).map(({ fila, c }) => ({
      fila,
      id: c[0],
      nombre: c[1],
      palabras: lista(c[2]),
      modo: c[3].toLowerCase().startsWith('deriv') ? 'derivar' : 'preguntas',
      activo: esSi(c[4]),
    })),
    preguntas: filasDe(libro, 'Preguntas', 10).map(({ fila, c }) => ({
      fila,
      campo: c[9],
      servicio: c[0],
      orden: Number(c[1]) || 0,
      pregunta: c[2],
      dato: c[3],
      tipo: c[4].toLowerCase(),
      opciones: opcionesDeTexto(c[5]),
      condicion: c[6],
      pista: c[7],
      explicacion: c[8],
    })),
    faqs: filasDe(libro, 'Preguntas frecuentes', 5).map(({ fila, c }) => ({
      fila,
      pregunta: c[0],
      respuesta: c[1],
      variantes: lista(c[2]),
      categoria: c[3],
      activa: esSi(c[4]),
    })),
    catalogo: filasDe(libro, 'Catálogo', 7).map(({ fila, c }) => ({
      fila,
      sku: c[0],
      nombre: c[1],
      categoria: c[2],
      unidad: c[3],
      precio: precioDe(c[4]),
      disponible: esSi(c[5]),
      descripcion: c[6],
    })),
  };
};

export interface Plan {
  resumen: ResumenImportacion;
  avisos: AvisoImportacion[];
  aplicar: (modo: Modo) => {
    ficha: CambiosFicha;
    guion: GuionEditable;
    faqs: Faq[];
    catalogo: Catalogo;
  };
}

const TIPOS = ['numero', 'texto', 'sino', 'opcion'];
const norma = (t: string): string => t.trim().toLowerCase();

/** Qué se guardaría con estas hojas: los conteos, los avisos, y el resultado por modo. Puro. */
export const planDeImportacion = (hojas: HojasLeidas, actual: Actual): Plan => {
  const avisos: AvisoImportacion[] = [];
  const aviso = (seccion: Hoja, fila: number, detalle: string, nivel: AvisoImportacion['nivel'] = 'ajustado') => avisos.push({ seccion, fila, detalle, nivel });

  // Negocio
  const n = hojas.negocio;
  const ficha: CambiosFicha = {};
  const conNegocio = Object.values(n).some((v) => (Array.isArray(v) ? v.length : String(v ?? '').trim()));
  if (conNegocio) {
    for (const clave of ['nombreComercial', 'descripcion', 'web', 'direccion', 'zona', 'comoLlegar', 'ofrece', 'noOfrece'] as const)
      if (n[clave] !== undefined) (ficha as Record<string, unknown>)[clave] = n[clave];
    if (n.ruc !== undefined) {
      const d = n.ruc.replace(/\D/g, '');
      if (d && d.length !== 11) aviso('Negocio', 4, 'El RUC no tiene 11 dígitos; se ignora.');
      else ficha.ruc = d;
    }
    if (n.telefono !== undefined || n.correo !== undefined || n.redSocial !== undefined)
      ficha.contacto = {
        ...(n.telefono !== undefined ? { telefono: n.telefono } : {}),
        ...(n.correo !== undefined ? { correo: n.correo } : {}),
        ...(n.redSocial !== undefined ? { redSocial: n.redSocial } : {}),
      };
  }

  // Servicios
  const servicios: Array<ServicioEditable & { fila: number; clave: string }> = [];
  for (const s of hojas.servicios) {
    if (!s.nombre.trim()) {
      aviso('Servicios', s.fila, 'Sin nombre: se omite.', 'omitido');
      continue;
    }
    const clave = s.id.trim() || slugDe(s.nombre);
    if (!s.palabras.length && s.modo === 'preguntas')
      aviso('Servicios', s.fila, `El servicio «${s.nombre.trim()}» no tiene palabras clave: Dali solo lo reconoce si el cliente lo elige por su nombre.`);
    servicios.push({
      fila: s.fila,
      clave,
      id: s.id.trim(),
      nombre: s.nombre.trim(),
      palabras: s.palabras,
      activo: s.activo,
      modo: s.modo,
      preguntas: [],
    });
  }

  // Preguntas, por servicio y en orden
  const porServicio = new Map<string, FilaPregunta[]>();
  for (const p of hojas.preguntas) {
    const servicio = servicios.find((s) => s.clave === p.servicio.trim() || s.id === p.servicio.trim());
    if (!servicio) {
      aviso('Preguntas', p.fila, `La pregunta es de un servicio que no está en la hoja Servicios («${p.servicio || 'sin servicio'}»); se omite.`, 'omitido');
      continue;
    }
    if (!p.pregunta.trim()) {
      aviso('Preguntas', p.fila, 'Sin texto de pregunta: se omite.', 'omitido');
      continue;
    }
    if (!porServicio.has(servicio.clave)) porServicio.set(servicio.clave, []);
    porServicio.get(servicio.clave)!.push(p);
  }
  let preguntasValidas = 0;
  for (const s of servicios) {
    const filas = (porServicio.get(s.clave) ?? []).sort((a, b) => a.orden - b.orden || a.fila - b.fila);
    const editables: PreguntaEditable[] = [];
    for (const p of filas) {
      let tipo = p.tipo;
      if (!TIPOS.includes(tipo)) {
        aviso('Preguntas', p.fila, `Tipo «${p.tipo || 'vacío'}» no existe; se usa texto.`);
        tipo = 'texto';
      }
      let opciones = p.opciones;
      if (tipo === 'opcion' && !opciones.length) {
        aviso('Preguntas', p.fila, 'Es de opciones pero no trae ninguna; se usa texto.');
        tipo = 'texto';
      }
      if (tipo !== 'opcion' && tipo !== 'sino') opciones = [];
      for (const o of opciones) if (!o.palabras.length) aviso('Preguntas', p.fila, `La opción «${o.valor}» no tiene palabras clave; se usará el nombre.`);
      const etiqueta = p.dato.trim() || `Dato ${editables.length + 1}`;
      const pregunta: PreguntaEditable = {
        campo: /^[A-Za-z0-9_-]{1,40}$/.test(p.campo.trim()) ? p.campo.trim() : '',
        etiqueta,
        pregunta: p.pregunta.trim(),
        tipo: tipo as PreguntaEditable['tipo'],
        opciones: opciones.map((o) => ({
          valor: o.valor,
          palabras: o.palabras.length ? o.palabras : [o.valor],
        })),
        ...(p.pista.trim() ? { pista: p.pista.trim() } : {}),
        ...(p.explicacion.trim() ? { explicacion: p.explicacion.trim() } : {}),
      };
      if (p.condicion.trim()) {
        const m = p.condicion.match(/^(.+?)\s*=\s*(.+)$/);
        const anterior = m ? editables.find((q) => norma(q.etiqueta) === norma(m[1])) : undefined;
        if (anterior && (anterior.tipo === 'opcion' || anterior.tipo === 'sino'))
          pregunta.cuando = {
            campo: anterior.campo || slugDe(anterior.etiqueta),
            es: m![2].trim(),
          };
        else aviso('Preguntas', p.fila, `La condición «${p.condicion.trim()}» apunta a un dato que no es de opciones; se pregunta siempre.`);
      }
      if (!pregunta.campo) pregunta.campo = slugDe(etiqueta);
      editables.push(pregunta);
      preguntasValidas++;
    }
    s.preguntas = editables;
  }

  // FAQ
  const faqs: Faq[] = [];
  for (const f of hojas.faqs) {
    if (!f.pregunta.trim()) {
      aviso('Preguntas frecuentes', f.fila, 'Sin pregunta: se omite.', 'omitido');
      continue;
    }
    if (!f.respuesta.trim()) {
      aviso('Preguntas frecuentes', f.fila, 'Sin respuesta: se omite.', 'omitido');
      continue;
    }
    faqs.push({
      id: '',
      pregunta: f.pregunta.trim(),
      respuesta: f.respuesta.trim(),
      variantes: f.variantes,
      categoria: f.categoria.trim(),
      activa: f.activa,
      usos: 0,
    });
  }

  // Catálogo
  const items: ItemCatalogo[] = [];
  for (const c of hojas.catalogo) {
    if (!c.nombre.trim()) {
      aviso('Catálogo', c.fila, 'Sin nombre: se omite.', 'omitido');
      continue;
    }
    items.push({
      id: '',
      sku: c.sku.trim(),
      nombre: c.nombre.trim(),
      categoria: c.categoria.trim(),
      unidad: c.unidad.trim(),
      ...(c.precio !== undefined ? { precio: c.precio } : {}),
      disponible: c.disponible,
      descripcion: c.descripcion.trim(),
    });
  }

  const resumen: ResumenImportacion = {
    negocio: conNegocio ? 1 : 0,
    servicios: servicios.length,
    preguntas: preguntasValidas,
    faqs: faqs.length,
    catalogo: items.length,
    total: 0,
  };
  resumen.total = resumen.negocio + resumen.servicios + resumen.preguntas + resumen.faqs + resumen.catalogo;
  avisos.sort((a, b) => HOJAS.indexOf(a.seccion) - HOJAS.indexOf(b.seccion) || a.fila - b.fila);

  const aplicar = (modo: Modo) => {
    const delArchivo = servicios.map(({ fila: _f, clave: _c, ...s }) => s);
    let guion: GuionEditable;
    if (modo === 'reemplazar')
      guion = {
        ...actual.guion,
        servicios: delArchivo.length ? delArchivo : actual.guion.servicios,
      };
    else {
      const lista = actual.guion.servicios.map((s) => {
        const nuevo = delArchivo.find((x) => x.id === s.id);
        return nuevo
          ? {
              ...s,
              nombre: nuevo.nombre,
              palabras: nuevo.palabras,
              modo: nuevo.modo,
              activo: nuevo.activo,
              preguntas: nuevo.preguntas.length ? nuevo.preguntas : s.preguntas,
            }
          : s;
      });
      for (const nuevo of delArchivo) if (!actual.guion.servicios.some((s) => s.id === nuevo.id && nuevo.id)) lista.push(nuevo);
      guion = { ...actual.guion, servicios: lista };
    }
    let faqsFinal: Faq[];
    if (modo === 'reemplazar') faqsFinal = faqs.length ? faqs : actual.faqs;
    else {
      faqsFinal = actual.faqs.map((f) => {
        const nueva = faqs.find((x) => norma(x.pregunta) === norma(f.pregunta));
        return nueva
          ? {
              ...f,
              respuesta: nueva.respuesta,
              variantes: [...new Set([...f.variantes, ...nueva.variantes])],
              categoria: nueva.categoria || f.categoria,
              activa: nueva.activa,
            }
          : f;
      });
      for (const nueva of faqs) if (!actual.faqs.some((f) => norma(f.pregunta) === norma(nueva.pregunta))) faqsFinal.push(nueva);
    }
    let itemsFinal: ItemCatalogo[];
    if (modo === 'reemplazar') itemsFinal = items.length ? items : actual.catalogo.items;
    else {
      const mismo = (a: ItemCatalogo, b: ItemCatalogo) => (a.sku && b.sku ? norma(a.sku) === norma(b.sku) : norma(a.nombre) === norma(b.nombre));
      itemsFinal = actual.catalogo.items.map((i) => {
        const nuevo = items.find((x) => mismo(x, i));
        return nuevo ? { ...i, ...nuevo, id: i.id } : i;
      });
      for (const nuevo of items) if (!actual.catalogo.items.some((i) => mismo(nuevo, i))) itemsFinal.push(nuevo);
    }
    return {
      ficha,
      guion,
      faqs: faqsFinal,
      catalogo: { ...actual.catalogo, items: itemsFinal },
    };
  };

  return { resumen, avisos, aplicar };
};

// ---------------------------------------------------------------- servidor

interface IBotImport {
  companyId: string;
  archivo: string;
  tamano: number;
  resumen: ResumenImportacion;
  avisos: AvisoImportacion[];
  modo: Modo;
  quien: string;
  createdAt?: Date;
}

const BotImportSchema = new Schema<IBotImport>(
  {
    companyId: { type: String, required: true },
    archivo: { type: String, required: true },
    tamano: { type: Number, default: 0 },
    resumen: { type: Schema.Types.Mixed },
    avisos: { type: Schema.Types.Mixed },
    modo: { type: String, enum: ['reemplazar', 'agregar'], required: true },
    quien: { type: String, required: true },
  },
  {
    collection: 'bot_imports',
    timestamps: { createdAt: true, updatedAt: false },
  }
);
BotImportSchema.index({ companyId: 1, createdAt: -1 });

let importModel: Model<IBotImport> | null = null;
const getBotImportModel = async (): Promise<Model<IBotImport>> => {
  if (importModel) return importModel;
  const conn = await getSharedConnection();
  importModel = (conn.models.BotImport as Model<IBotImport>) || conn.model<IBotImport>('BotImport', BotImportSchema);
  return importModel;
};

const actualDe = async (companyId: string) => {
  const [ficha, servicios, faqs, catalogo] = await Promise.all([leerNegocio(companyId), leerServicios(companyId), listarFaq(companyId), leerCatalogo(companyId)]);
  return { ficha, guion: servicios.guion, faqs, catalogo };
};

export const plantillaDe = async (companyId: string): Promise<Buffer> => armarPlantilla(await actualDe(companyId));

/** Los análisis esperando confirmación: por token, 15 minutos. */
const pendientes = new Map<
  string,
  {
    companyId: string;
    archivo: string;
    tamano: number;
    plan: Plan;
    venceMs: number;
  }
>();
const VIGENCIA_ANALISIS_MS = 15 * 60_000;
/** El archivo se carga entero en memoria en la Mac mini (spec §8: ≤ 2 MB); la plantilla de Constroad pesa 14 KB. */
export const TAMANO_MAXIMO_MB = 2;
export const TAMANO_MAXIMO_BYTES = TAMANO_MAXIMO_MB * 1024 * 1024;

export class ArchivoInvalido extends Error {}

export const analizarArchivo = async (
  companyId: string,
  archivo: { nombre: string; buffer: Buffer }
): Promise<{
  token: string;
  archivo: string;
  tamano: number;
  resumen: ResumenImportacion;
  avisos: AvisoImportacion[];
  hojasEncontradas: Hoja[];
}> => {
  if (archivo.buffer.length > TAMANO_MAXIMO_BYTES) throw new ArchivoInvalido(`El archivo pesa más de ${TAMANO_MAXIMO_MB} MB`);
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(archivo.buffer as unknown as ArrayBuffer);
  } catch {
    throw new ArchivoInvalido('No se pudo leer el archivo: tiene que ser un .xlsx (Excel)');
  }
  const hojasEncontradas = HOJAS.filter((h) => libro.getWorksheet(h));
  if (!hojasEncontradas.length) throw new ArchivoInvalido(`El archivo no tiene ninguna de las hojas de la plantilla (${HOJAS.join(', ')})`);
  const actual = await actualDe(companyId);
  const plan = planDeImportacion(leerLibro(libro), actual);
  for (const [token, p] of pendientes) if (p.venceMs < Date.now()) pendientes.delete(token);
  const token = randomBytes(12).toString('hex');
  pendientes.set(token, {
    companyId,
    archivo: archivo.nombre,
    tamano: archivo.buffer.length,
    plan,
    venceMs: Date.now() + VIGENCIA_ANALISIS_MS,
  });
  return {
    token,
    archivo: archivo.nombre,
    tamano: archivo.buffer.length,
    resumen: plan.resumen,
    avisos: plan.avisos,
    hojasEncontradas,
  };
};

export const confirmarImportacion = async (companyId: string, token: string, modo: Modo, quien: string): Promise<{ resumen: ResumenImportacion }> => {
  const pendiente = pendientes.get(token);
  if (!pendiente || pendiente.companyId !== companyId || pendiente.venceMs < Date.now()) throw new ArchivoInvalido('El análisis venció: vuelve a subir el archivo');
  pendientes.delete(token);
  const { ficha, guion, faqs, catalogo } = pendiente.plan.aplicar(modo);
  if (Object.keys(ficha).length) await guardarNegocio(companyId, ficha, quien);
  await guardarServicios(companyId, guion, quien);
  await guardarFaq(companyId, faqs, quien);
  await guardarCatalogo(companyId, { items: catalogo.items }, quien);
  const Import = await getBotImportModel();
  await Import.create({
    companyId,
    archivo: pendiente.archivo,
    tamano: pendiente.tamano,
    resumen: pendiente.plan.resumen,
    avisos: pendiente.plan.avisos,
    modo,
    quien,
  });
  logger.info(`[dali] ${quien} importó ${pendiente.plan.resumen.total} elementos en ${companyId} (${modo}) desde ${pendiente.archivo}`);
  return { resumen: pendiente.plan.resumen };
};

export const historialDeImportaciones = async (
  companyId: string
): Promise<
  Array<{
    archivo: string;
    tamano: number;
    resumen: ResumenImportacion;
    avisos: number;
    modo: Modo;
    quien: string;
    fecha: string;
  }>
> => {
  const Import = await getBotImportModel();
  const docs = await Import.find({ companyId }).sort({ createdAt: -1 }).limit(10).lean();
  return docs.map((d) => ({
    archivo: d.archivo,
    tamano: d.tamano,
    resumen: d.resumen,
    avisos: Array.isArray(d.avisos) ? d.avisos.length : 0,
    modo: d.modo,
    quien: d.quien,
    fecha: (d.createdAt as Date).toISOString(),
  }));
};
