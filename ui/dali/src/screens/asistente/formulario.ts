import type { Asistente, AvisosAsistente, PerfilAsistente } from '@/lib/types';

/**
 * EL FORMULARIO DE «ASISTENTE» (A6): lo que se edita y se guarda de una vez
 * con «Guardar cambios». El encendido y la pausa no pasan por acá: se
 * aplican al toque.
 */
export interface Formulario {
  perfil: PerfilAsistente;
  avisos: AvisosAsistente;
  handoffPauseMinutes: number;
  testNumbers: string[];
}

export const SALUDO_MAX = 160;
export const FUERA_DE_HORARIO_MAX = 300;
export const NOMBRE_MAX = 40;

export const formularioDe = (a: Asistente): Formulario =>
  structuredClone({ perfil: a.perfil, avisos: a.avisos, handoffPauseMinutes: a.handoffPauseMinutes, testNumbers: a.testNumbers });

export const mismoFormulario = (a: Formulario, b: Formulario): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Un celular peruano de 9 dígitos, o uno internacional con código: solo dígitos, con «51» adelante si faltaba. */
export const normalizarNumero = (texto: string): string | null => {
  const d = texto.replace(/\D/g, '');
  if (d.length === 9 && d.startsWith('9')) return `51${d}`;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
};

/** El primer mensaje tal como lo manda el guion con este perfil (espejo de `saludoDe` en `guiado.ts`). */
export const primerMensaje = (perfil: PerfilAsistente, empresa: string, enHorario: boolean): string[] => {
  const remate = perfil.emojis === 'ninguno' ? '.' : ' 👋';
  const presentacion = perfil.saludo.trim() || `¡Hola! Soy ${perfil.asistente}, la asistente de ${empresa}${remate}`;
  const fuera = !enHorario && perfil.fueraDeHorario.trim() ? ` ${perfil.fueraDeHorario.trim()}` : '';
  const texto = `${presentacion}${fuera} ¿En qué te ayudo? Vendemos mezcla asfáltica, hacemos asfaltado y transporte.`;
  return [perfil.emojis === 'ninguno' ? sinEmojis(texto) : texto];
};

const sinEmojis = (texto: string): string =>
  texto
    .replace(/ ?(?:\p{Extended_Pictographic}|\u200D|\uFE0F)+/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim();

/** ¿Está abierto ahora (hora de Lima) según el horario del formulario? */
export const abiertoAhora = (horario: PerfilAsistente['horario'], ahoraMs = Date.now()): boolean => {
  const lima = new Date(new Date(ahoraMs).toLocaleString('en-US', { timeZone: 'America/Lima' }));
  const dow = lima.getDay();
  const franja = dow === 0 ? horario.domingo : dow === 6 ? horario.sabado : horario.semana;
  if (!franja.activo) return false;
  const minutos = lima.getHours() * 60 + lima.getMinutes();
  const de = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return minutos >= de(franja.desde) && minutos < de(franja.hasta);
};

export type Pausa = '30' | '120' | 'manana';

/** Qué chip de pausa está vigente, por lo que falta hasta `pausadoHasta`. */
export const pausaVigente = (pausadoHasta: string | undefined, ahoraMs = Date.now()): Pausa | null => {
  if (!pausadoHasta) return null;
  const faltaMin = (Date.parse(pausadoHasta) - ahoraMs) / 60_000;
  if (faltaMin <= 0) return null;
  if (faltaMin <= 30) return '30';
  if (faltaMin <= 120) return '120';
  return 'manana';
};
