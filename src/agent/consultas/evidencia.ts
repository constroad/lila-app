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
 * libre. Medido el 15/09 sobre el último mes de Globofast (≈600 fotos): 432
 * dicen solo «Unidad N PLACA»; 30 «temperatura»; 23 «volquete saliendo»; 15
 * «vacío» (con y sin tilde, «vacioo»…); el resto, trabajos de pista (bacheo,
 * escantillón, sellado). Hoy, 1 de 11 unidades tenía «temperatura» escrito.
 * O sea: la palabra a veces está, y cuando está sirve; cuando no está NO
 * significa que la foto no exista. Por eso esta consulta hace dos cosas y las
 * separa: cuenta fotos contra el mínimo de tres (objetivo), y lee las
 * MARCAS que el ingeniero puso (temperatura, salida vacía, ingreso) diciendo
 * «sin marcar», nunca «sin foto». Decir «a la 9 le falta la de temperatura»
 * con certeza exige que el Portal etiquete cada foto al tomarla.
 */

/** Las tres marcas, tal como las escriben en campo (con y sin tilde, con errores). */
export type Marca = 'ingreso' | 'temperatura' | 'vacio';
export const MARCAS: Record<Marca, { patron: RegExp; nombre: string }> = {
  ingreso: { patron: /ingres|llegad|llegan|entrad|descarg|arrib/i, nombre: 'ingreso / descarga' },
  temperatura: { patron: /temperat|termom|°\s?c\b|grados/i, nombre: 'temperatura' },
  vacio: { patron: /vaci|saliendo|salida|se va|retir|regres/i, nombre: 'salida vacía' },
};
export const marcasDe = (descripcion: string): Marca[] =>
  (Object.keys(MARCAS) as Marca[]).filter((m) => MARCAS[m].patron.test(String(descripcion || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')));

/** Qué marca pregunta la persona («foto de temperatura», «tolva vacía», «ingreso»), si alguna. */
export const focoDe = (pregunta: string): Marca | null => {
  const t = String(pregunta || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/temperat/.test(t)) return 'temperatura';
  if (/vaci|salida|saliendo/.test(t)) return 'vacio';
  if (/ingres|llegada|descarga/.test(t)) return 'ingreso';
  return null;
};
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
  /** Cuántas fotos llevan escrita cada marca. 0 = sin marcar, NO «sin foto». */
  marcadas: Record<Marca, number>;
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
      const marcadas: Record<Marca, number> = { ingreso: 0, temperatura: 0, vacio: 0 };
      for (const f of propias) for (const m of marcasDe(f.descripcion)) marcadas[m] += 1;
      return {
        unitNumber: u.unitNumber,
        plate: u.plate,
        llego: Boolean(u.arrivalAt),
        enRuta: !u.arrivalAt,
        fotos: soloFotos,
        videos,
        incompleta: soloFotos < FOTOS_MINIMAS,
        marcadas,
      };
    });

const textoMarcas = (u: EvidenciaUnidad): string =>
  (Object.keys(MARCAS) as Marca[]).map((m) => `${MARCAS[m].nombre} ${u.marcadas[m] ? '✓' : '–'}`).join(' · ');

/** PURO: el texto. Primero lo que falta, después lo que está bien; siempre dice qué NO puede saber. */
export const textoEvidencia = (lista: EvidenciaUnidad[], dia: string, unidad?: EvidenciaUnidad, foco: Marca | null = null): string => {
  if (unidad) {
    const estado = unidad.fotos >= FOTOS_MINIMAS ? '✅' : unidad.fotos === 0 ? '❌' : '⚠️';
    const detalle = `${unidad.fotos} foto(s)${unidad.videos ? ` y ${unidad.videos} video(s)` : ''} en el control de pista`;
    const juicio =
      unidad.fotos >= FOTOS_MINIMAS
        ? `cubre el mínimo de ${FOTOS_MINIMAS} (llegada, temperatura, tolva vacía)`
        : unidad.fotos === 0
          ? `sin evidencia de campo${unidad.enRuta ? ' (todavía en ruta)' : ''}`
          : `por debajo del mínimo de ${FOTOS_MINIMAS}: falta${FOTOS_MINIMAS - unidad.fotos > 1 ? 'n' : ''} ${FOTOS_MINIMAS - unidad.fotos}`;
    return [`${estado} *Unidad ${unidad.unitNumber}* (${unidad.plate || 'sin placa'}), ${dia}: ${detalle} — ${juicio}.`, `Marcadas por el ingeniero: ${textoMarcas(unidad)}.`, NOTA_ETIQUETAS].join('\n');
  }
  if (!lista.length) return `No hay unidades despachadas ${dia}.`;
  // «¿Qué unidad no tiene foto de temperatura?»: lo que se puede decir es qué
  // unidades NO tienen esa marca escrita — y que sin marca no es sin foto.
  if (foco) {
    const nombre = MARCAS[foco].nombre;
    const llegadas = lista.filter((u) => u.llego);
    const con = llegadas.filter((u) => u.marcadas[foco] > 0);
    const sin = llegadas.filter((u) => u.marcadas[foco] === 0);
    const partes = [`📷 *Foto de ${nombre}, ${dia}*: marcada por el ingeniero en ${con.length} de ${llegadas.length} unidad(es) que llegaron${con.length ? ` (${con.map((u) => `unidad ${u.unitNumber}`).join(', ')})` : ''}.`];
    if (sin.length) partes.push(`Sin la marca «${nombre}» en ninguna de sus fotos: ${sin.map((u) => `unidad ${u.unitNumber} (${u.fotos} foto(s))`).join(', ')}.`);
    partes.push(`_Sin marca no es sin foto: la mayoría de las fotos de pista van solo con «Unidad N placa». Para saberlo con certeza, el Portal tendría que pedir la foto de ${nombre} como disparo fijo._`);
    return partes.join('\n');
  }
  const llegadas = lista.filter((u) => u.llego);
  const incompletas = llegadas.filter((u) => u.incompleta);
  const enRutaSinFotos = lista.filter((u) => u.enRuta && u.fotos === 0);
  const partes = [`📷 *Evidencia de campo, ${dia}*: ${llegadas.length} unidad(es) llegaron; ${llegadas.length - incompletas.length} con las ${FOTOS_MINIMAS} fotos mínimas.`];
  if (incompletas.length) {
    partes.push(`⚠️ Con menos de ${FOTOS_MINIMAS} fotos en el control de pista:`);
    for (const u of incompletas) partes.push(`• Unidad ${u.unitNumber} (${u.plate || 'sin placa'}): ${u.fotos === 0 ? 'ninguna foto' : `${u.fotos} foto(s)`}${u.videos ? `, ${u.videos} video(s)` : ''}${u.fotos ? ` — ${textoMarcas(u)}` : ''}`);
  } else if (llegadas.length) {
    partes.push('Todas las que llegaron tienen al menos 3 fotos.');
  }
  if (enRutaSinFotos.length) partes.push(`En ruta, todavía sin fotos: ${enRutaSinFotos.map((u) => `unidad ${u.unitNumber}`).join(', ')}.`);
  partes.push(NOTA_ETIQUETAS);
  return partes.join('\n');
};

const NOTA_ETIQUETAS = '_Cuento fotos contra el mínimo de 3 y leo lo que el ingeniero escribió en cada una; «–» es sin marcar, no sin foto._';

/** Las unidades de la vista, planas, para el cálculo. */
export const unidadesDe = (vista: VistaDelDia, companyId?: string): UnidadDelDia[] =>
  vista.orders.filter((o) => !companyId || o.companyId === companyId).flatMap((o) => o.units);
