/**
 * LA EVIDENCIA DE CAMPO POR UNIDAD: ¿qué volquetes llegaron a obra sin las
 * fotos del control de pista?
 *
 * José, 15/09: el ingeniero de campo sube tres fotos obligatorias por unidad
 * —al ingreso, la temperatura, y la tolva vacía al irse— y es la única prueba
 * ante el cliente de que llegó, se midió y se descargó. Cuando falta una, nadie
 * se entera hasta que el cliente reclama.
 *
 * LO QUE EL DATO PERMITE HOY, y lo que no. El control de pista guarda las
 * fotos de cada volquete en `unitPhotos_<dispatchId>` con una descripción
 * libre («Unidad 9 A1Y 825»): NO dice cuál es la de llegada, cuál la de
 * temperatura ni cuál la de tolva vacía. Por eso esta consulta cuenta fotos
 * contra el mínimo de tres y dice qué unidad está por debajo; decir «a la 9
 * le falta la de temperatura» exige que el Portal etiquete cada foto al
 * tomarla (tres disparos fijos en la cámara de la unidad). Está dicho en la
 * respuesta para que nadie lea «3 fotos» como «las 3 fotos».
 */
import type { UnidadDelDia, VistaDelDia } from './vista.js';
import type { FotoInforme } from './fotos-informe.js';
import { fotosDeUnidad } from './fotos-informe.js';

/** Las tres fotos obligatorias: llegada, temperatura, tolva vacía. */
export const FOTOS_MINIMAS = 3;

export interface EvidenciaUnidad {
  unitNumber: number;
  plate: string;
  /** Llegó a obra (arrival) o al menos salió de planta. */
  llego: boolean;
  enRuta: boolean;
  fotos: number;
  videos: number;
  /** Menos de tres fotos: falta evidencia (sin saber cuál). */
  incompleta: boolean;
}

/** PURO: por cada unidad despachada, cuántas fotos/videos tiene en el control de pista. */
export const evidenciaPorUnidad = (units: UnidadDelDia[], fotos: FotoInforme[], esVideo: (url: string) => boolean): EvidenciaUnidad[] =>
  units
    .filter((u) => u.state === 'despachado')
    .sort((a, b) => a.unitNumber - b.unitNumber)
    .map((u) => {
      const propias = fotosDeUnidad(fotos, { dispatchId: u.dispatchId, unitNumber: u.unitNumber, plate: u.plate });
      const videos = propias.filter((f) => esVideo(f.url)).length;
      const soloFotos = propias.length - videos;
      return {
        unitNumber: u.unitNumber,
        plate: u.plate,
        llego: Boolean(u.arrivalAt),
        enRuta: !u.arrivalAt,
        fotos: soloFotos,
        videos,
        incompleta: soloFotos < FOTOS_MINIMAS,
      };
    });

/** PURO: el texto. Primero lo que falta, después lo que está bien; siempre dice qué NO puede saber. */
export const textoEvidencia = (lista: EvidenciaUnidad[], dia: string, unidad?: EvidenciaUnidad): string => {
  if (unidad) {
    const estado = unidad.fotos >= FOTOS_MINIMAS ? '✅' : unidad.fotos === 0 ? '❌' : '⚠️';
    const detalle = `${unidad.fotos} foto(s)${unidad.videos ? ` y ${unidad.videos} video(s)` : ''} en el control de pista`;
    const juicio =
      unidad.fotos >= FOTOS_MINIMAS
        ? `cubre el mínimo de ${FOTOS_MINIMAS} (llegada, temperatura, tolva vacía)`
        : unidad.fotos === 0
          ? `sin evidencia de campo${unidad.enRuta ? ' (todavía en ruta)' : ''}`
          : `por debajo del mínimo de ${FOTOS_MINIMAS}: falta${FOTOS_MINIMAS - unidad.fotos > 1 ? 'n' : ''} ${FOTOS_MINIMAS - unidad.fotos}`;
    return [`${estado} *Unidad ${unidad.unitNumber}* (${unidad.plate || 'sin placa'}), ${dia}: ${detalle} — ${juicio}.`, NOTA_ETIQUETAS].join('\n');
  }
  if (!lista.length) return `No hay unidades despachadas ${dia}.`;
  const llegadas = lista.filter((u) => u.llego);
  const incompletas = llegadas.filter((u) => u.incompleta);
  const enRutaSinFotos = lista.filter((u) => u.enRuta && u.fotos === 0);
  const partes = [`📷 *Evidencia de campo, ${dia}*: ${llegadas.length} unidad(es) llegaron; ${llegadas.length - incompletas.length} con las ${FOTOS_MINIMAS} fotos mínimas.`];
  if (incompletas.length) {
    partes.push(`⚠️ Con menos de ${FOTOS_MINIMAS} fotos en el control de pista:`);
    for (const u of incompletas) partes.push(`• Unidad ${u.unitNumber} (${u.plate || 'sin placa'}): ${u.fotos === 0 ? 'ninguna foto' : `${u.fotos} foto(s)`}${u.videos ? `, ${u.videos} video(s)` : ''}`);
  } else if (llegadas.length) {
    partes.push('Todas las que llegaron tienen al menos 3 fotos.');
  }
  if (enRutaSinFotos.length) partes.push(`En ruta, todavía sin fotos: ${enRutaSinFotos.map((u) => `unidad ${u.unitNumber}`).join(', ')}.`);
  partes.push(NOTA_ETIQUETAS);
  return partes.join('\n');
};

const NOTA_ETIQUETAS = '_Cuento fotos contra el mínimo de 3; el Portal no marca cuál es la de llegada, temperatura o tolva vacía, así que no puedo decir cuál falta._';

/** Las unidades de la vista, planas, para el cálculo. */
export const unidadesDe = (vista: VistaDelDia, companyId?: string): UnidadDelDia[] =>
  vista.orders.filter((o) => !companyId || o.companyId === companyId).flatMap((o) => o.units);
