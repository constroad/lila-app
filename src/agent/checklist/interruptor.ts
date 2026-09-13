/**
 * EL INTERRUPTOR. Motor puro.
 *
 * Desde que el agente puede escribirle a la gente que trabaja, tiene que poder
 * apagarse desde el celular, sin deploy y sin terminal: `!lila off` en el grupo
 * de operaciones, de un administrador. `!lila on` lo vuelve a prender. Spec
 * §4.3: «kill switch por comando desde un número admin».
 *
 * Apagado, el agente sigue ESCUCHANDO y guardando —así al prenderlo no está
 * ciego— pero no propone ni manda nada. El estado se persiste: un deploy no
 * puede prender lo que alguien apagó.
 */

export interface EstadoInterruptor {
  apagado: boolean;
  por?: string;
  ms?: number;
}

let estado: EstadoInterruptor = { apagado: false };

/** Solo para tests. */
export const _resetInterruptor = (): void => {
  estado = { apagado: false };
};

export const hidratarInterruptor = (guardado: EstadoInterruptor | null | undefined): void => {
  if (guardado && typeof guardado.apagado === 'boolean') estado = { ...guardado };
};

export const agenteApagado = (): boolean => estado.apagado;
export const estadoInterruptor = (): EstadoInterruptor => ({ ...estado });

/** `!lila off` | `!lila on` — exactos, sin importar mayúsculas ni espacios de más. */
export const comandoInterruptor = (texto: string): 'off' | 'on' | null => {
  const t = String(texto || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === '!lila off') return 'off';
  if (t === '!lila on') return 'on';
  return null;
};

export const apagar = (por: string, ms = Date.now()): EstadoInterruptor => {
  estado = { apagado: true, por, ms };
  return { ...estado };
};

export const encender = (por: string, ms = Date.now()): EstadoInterruptor => {
  estado = { apagado: false, por, ms };
  return { ...estado };
};
