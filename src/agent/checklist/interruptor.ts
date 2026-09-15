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

/**
 * `!lila off` | `!lila on` — y las formas en que la gente lo escribe de verdad:
 * «@lila off», «lila off», «!@lila off», «@lila apágate», «@lila enciéndete».
 * El 14/09 a las 18:14 José escribió «@lila off» y «!@lila off» y ninguno lo
 * apagó: «off» fue al modelo y contestó cualquier cosa. También «@lila estás
 * encendida?» → `estado`, para que no vaya al modelo y termine en el menú.
 * Tiene que ser el mensaje entero (con o sin signos al final), nunca parte de
 * una frase.
 */
export const comandoInterruptor = (texto: string): 'off' | 'on' | 'estado' | null => {
  const t = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!@¡¿?.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = t.match(/^lila (.+)$/);
  if (!m) return null;
  const orden = m[1];
  if (/^(off|apagar|apagate|apaga|apagado|silencio|callate|stop)$/.test(orden)) return 'off';
  if (/^(on|prender|prendete|encender|enciendete|enciende|activar|activate|prendido|encendido)$/.test(orden)) return 'on';
  if (/^(estado|estas (encendid|prendid|apagad|activ)[ao]|estas on|estas off|sigues (encendid|prendid|apagad)[ao]|te apagaron)$/.test(orden)) return 'estado';
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
