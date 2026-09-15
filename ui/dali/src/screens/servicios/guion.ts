import type { GuionEditable, PreguntaEditable, ServicioEditable, TipoPregunta } from '@/lib/types';

/**
 * LO PURO DEL EDITOR DEL GUION (A8/A9/A10): cómo se lee y se cambia un
 * guion sin tocar el servidor. Cada función devuelve un guion nuevo.
 */
export const NOMBRE_TIPO: Record<TipoPregunta, string> = { numero: 'Número', texto: 'Texto', sino: 'Sí / No', opcion: 'Opciones' };
export const NOMBRE_MODO = { preguntas: 'Junta datos para cotizar', derivar: 'Deriva a un asesor' } as const;

export const mismoGuion = (a: GuionEditable, b: GuionEditable): boolean => JSON.stringify(a) === JSON.stringify(b);

export const servicioDe = (guion: GuionEditable, id: string | undefined): ServicioEditable | undefined => guion.servicios.find((s) => s.id === id);

/** Un id provisorio: el servidor lo cambia por el slug del nombre al guardar. */
export const idNuevo = (): string => `nuevo-${Date.now().toString(36)}`;

export const servicioNuevo = (): ServicioEditable => ({ id: idNuevo(), nombre: '', palabras: [], activo: true, modo: 'preguntas', preguntas: [] });

export const preguntaNueva = (): PreguntaEditable => ({ campo: '', etiqueta: '', pregunta: '', tipo: 'texto', opciones: [] });

export const conServicio = (guion: GuionEditable, servicio: ServicioEditable): GuionEditable => ({
  ...guion,
  servicios: guion.servicios.some((s) => s.id === servicio.id) ? guion.servicios.map((s) => (s.id === servicio.id ? servicio : s)) : [...guion.servicios, servicio],
});

export const sinServicio = (guion: GuionEditable, id: string): GuionEditable => ({ ...guion, servicios: guion.servicios.filter((s) => s.id !== id) });

const conPreguntas = (guion: GuionEditable, id: string, preguntas: PreguntaEditable[]): GuionEditable => {
  const servicio = servicioDe(guion, id);
  return servicio ? conServicio(guion, { ...servicio, preguntas }) : guion;
};

export const conPregunta = (guion: GuionEditable, id: string, indice: number, pregunta: PreguntaEditable): GuionEditable => {
  const preguntas = [...(servicioDe(guion, id)?.preguntas ?? [])];
  if (indice >= preguntas.length) preguntas.push(pregunta);
  else preguntas[indice] = pregunta;
  return conPreguntas(guion, id, preguntas);
};

export const sinPregunta = (guion: GuionEditable, id: string, indice: number): GuionEditable =>
  conPreguntas(
    guion,
    id,
    (servicioDe(guion, id)?.preguntas ?? []).filter((_, i) => i !== indice)
  );

export const preguntaDuplicada = (guion: GuionEditable, id: string, indice: number): GuionEditable => {
  const preguntas = [...(servicioDe(guion, id)?.preguntas ?? [])];
  const original = preguntas[indice];
  if (!original) return guion;
  preguntas.splice(indice + 1, 0, { ...structuredClone(original), campo: '', etiqueta: `${original.etiqueta} (copia)` });
  return conPreguntas(guion, id, preguntas);
};

/** Mueve la pregunta `indice` a `destino` (0-based) dentro del servicio. */
export const preguntaMovida = (guion: GuionEditable, id: string, indice: number, destino: number): GuionEditable => {
  const preguntas = [...(servicioDe(guion, id)?.preguntas ?? [])];
  if (indice < 0 || indice >= preguntas.length || destino < 0 || destino >= preguntas.length) return guion;
  const [p] = preguntas.splice(indice, 1);
  preguntas.splice(destino, 0, p);
  return conPreguntas(guion, id, preguntas);
};

/** Lo que una pregunta guarda, para mostrar: «{Área}». */
export const variableDe = (p: PreguntaEditable): string => `{${p.etiqueta || p.campo || 'dato'}}`;

/** «Solo si Base = preparada», con la etiqueta de la pregunta condicionante. */
export const condicionLegible = (p: PreguntaEditable, preguntas: PreguntaEditable[]): string | null => {
  if (!p.cuando) return null;
  const otra = preguntas.find((q) => q.campo === p.cuando!.campo);
  return `Solo si ${otra?.etiqueta ?? p.cuando.campo} = ${[p.cuando.es].flat().join(' o ')}`;
};

/** Las preguntas anteriores con opciones, que pueden condicionar a esta. */
export const condicionantesDe = (preguntas: PreguntaEditable[], indice: number): PreguntaEditable[] =>
  preguntas.slice(0, indice).filter((q) => (q.tipo === 'opcion' || q.tipo === 'sino') && q.opciones.length > 0 && q.campo);

/** Lo que dice el chip de una pregunta en la lista: el tipo y sus opciones. */
export const resumenDeRespuesta = (p: PreguntaEditable): string => {
  if (p.tipo === 'numero') return 'Respuesta numérica';
  if (p.tipo === 'texto') return 'Texto libre';
  return `Opciones: ${p.opciones.map((o) => o.valor).join(', ') || '—'}`;
};
