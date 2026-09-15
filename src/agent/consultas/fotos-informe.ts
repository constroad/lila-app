import { getServiceReportModel } from '../../database/models.js';
import { normalizar, normalizarPlaca } from './catalogo.js';
import type { Archivo } from './archivos.js';

/**
 * LAS FOTOS Y VIDEOS DE UN INFORME (control de pista, panel fotográfico,
 * imprimación…), que no son las del despacho. José, 15/09 09:15: «dame las
 * fotos y videos de la unidad 1 del control de pista» → salieron las del
 * despacho (el camión en planta, la temperatura); las del informe son las que
 * el supervisor sube en campo. Viven en el propio documento del informe
 * (`servicemanagementreports.schemaData.<sección>.fotos[]`): el panel
 * fotográfico, el registro fotográfico y, por unidad, `unitPhotos_<dispatchId>`.
 * Los archivos están en el storage de lila (`/files/companies/<id>/services/…`),
 * y se mandan como cualquier otro archivo de la empresa dueña.
 */

export interface FotoInforme {
  url: string;
  descripcion: string;
  hora: string;
  /** Clave de la sección en `schemaData`: `panelFotografico`, `unitPhotos_<dispatchId>`… */
  seccion: string;
  mediaId?: string;
}

type Doc = Record<string, unknown>;
const texto = (v: unknown): string => (v == null ? '' : String(v)).trim();

const ES_VIDEO = /\.(mp4|mov|webm|m4v|3gp)(\?|$)/i;
export const esVideo = (url: string): boolean => ES_VIDEO.test(url);

/** Todas las fotos del informe, sección por sección, sin repetir la misma foto (la de una unidad también está en el panel). */
export const fotosDelInforme = (schemaData: unknown): FotoInforme[] => {
  const sd = (schemaData ?? {}) as Doc;
  const lista: FotoInforme[] = [];
  for (const [seccion, valor] of Object.entries(sd)) {
    const fotos = (valor as Doc | null)?.fotos;
    if (!Array.isArray(fotos)) continue;
    for (const f of fotos as Doc[]) {
      // La SELLADA (fecha, hora, lugar encima de la foto): es la evidencia; la original queda de respaldo.
      const url = texto(f.url) || texto(f.originalUrl);
      if (!url) continue;
      // La misma foto puede estar en el panel y en su unidad: acá van todas con
      // su sección; `fotosDeUnidad` y `todasLasFotos` quitan las repetidas.
      lista.push({ url, descripcion: texto(f.descripcion), hora: texto(f.hora), seccion, mediaId: texto(f.mediaId) || undefined });
    }
  }
  return lista;
};

const sinRepetir = (fotos: FotoInforme[]): FotoInforme[] => {
  const vistas = new Set<string>();
  return fotos.filter((f) => {
    const clave = f.mediaId || f.url;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
};

/** Las fotos de una unidad: su sección `unitPhotos_<dispatchId>`; si no la hay, las que la nombran («Unidad 1», la placa). */
export const fotosDeUnidad = (
  fotos: FotoInforme[],
  unidad: { dispatchId?: string; unitNumber?: number; plate?: string }
): FotoInforme[] => {
  if (unidad.dispatchId) {
    const propias = fotos.filter((f) => f.seccion === `unitPhotos_${unidad.dispatchId}`);
    if (propias.length) return sinRepetir(propias);
  }
  const placa = unidad.plate ? normalizarPlaca(unidad.plate) : '';
  const nombraUnidad = (f: FotoInforme): boolean => {
    const d = normalizar(f.descripcion);
    if (unidad.unitNumber && new RegExp(`\\bunidad\\s*#?\\s*${unidad.unitNumber}\\b`).test(d)) return true;
    return Boolean(placa) && normalizarPlaca(f.descripcion).includes(placa);
  };
  return sinRepetir(fotos.filter((f) => !f.seccion.startsWith('unitPhotos_') && nombraUnidad(f)));
};

/** Las fotos generales del informe (todas las secciones, sin repetir). */
export const todasLasFotos = (fotos: FotoInforme[]): FotoInforme[] => sinRepetir(fotos);

/** Como archivos para mandar: foto o video según la extensión, con su descripción de caption. */
export const archivosDeFotos = (fotos: FotoInforme[], companyId: string): Archivo[] =>
  fotos.map((f) => {
    const video = esVideo(f.url);
    const nombre = f.url.split('/').pop()?.split('?')[0] || (video ? 'video.mp4' : 'foto.jpg');
    return {
      tipo: video ? 'video' : 'image',
      url: f.url,
      nombre,
      fechaMs: 0,
      mime: video ? 'video/mp4' : 'image/jpeg',
      companyId,
      caption: [f.descripcion, f.hora].filter(Boolean).join(' · ') || undefined,
    };
  });

/** El `schemaData` de un informe, para sacarle las fotos. `null` si no está. */
export const cargarFotosDelInforme = async (reportId: string): Promise<FotoInforme[] | null> => {
  const Informe = await getServiceReportModel();
  const doc = (await Informe.findById(reportId).select('schemaData').lean()) as Doc | null;
  if (!doc) return null;
  return fotosDelInforme(doc.schemaData);
};
