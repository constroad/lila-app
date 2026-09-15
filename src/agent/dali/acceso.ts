import { randomInt } from 'node:crypto';
import logger from '../../utils/logger.js';
import { esIdentidadValida, miembroPorIdentidad, normalizarIdentidad, registrarIngreso, type MiembroDali } from './miembros.js';

/**
 * ENTRAR A DALI CON UN CÓDIGO (spec DALI §2, patrón Torre). La persona pone su
 * número o su correo, recibe un código de seis cifras y lo escribe.
 *
 * HOY, SIN constroad-auth (F2): el código se genera acá y NO se manda a ningún
 * lado — queda en el log de lila («código de acceso para …»), y quien opera
 * lila se lo pasa a la persona. Es la «sesión de prueba» que pidió José
 * (15/09: «no esperes un envío real de código, eso déjalo para el final»). El
 * flujo de pantallas es el definitivo; en F2 lo único que cambia es que el
 * código viaja por WhatsApp o correo a través de constroad-auth.
 *
 * Reglas: el código vale 10 minutos y un solo uso; cinco intentos fallidos lo
 * queman; solo una identidad que sea miembro recibe código (a la que no lo es
 * se le contesta lo mismo, para no revelar quién está y quién no).
 */
export const VIGENCIA_CODIGO_MS = 10 * 60_000;
export const INTENTOS_MAXIMOS = 5;
const REENVIO_MINIMO_MS = 30_000;

interface CodigoPendiente {
  codigo: string;
  miembroId: string;
  creadoMs: number;
  intentos: number;
}

const pendientes = new Map<string, CodigoPendiente>();

/** Solo para tests. */
export const _resetCodigos = (): void => pendientes.clear();

export type ResultadoPedido = { ok: true; canal: 'prueba' | 'whatsapp' | 'correo'; reintentoEnMs: number } | { ok: false; motivo: 'identidad-invalida' | 'muy-seguido' };

export const pedirCodigo = async (
  destino: string,
  deps: { buscarMiembro?: typeof miembroPorIdentidad; generar?: () => string; ahoraMs?: number } = {}
): Promise<ResultadoPedido> => {
  const identidad = normalizarIdentidad(destino);
  if (!esIdentidadValida(identidad)) return { ok: false, motivo: 'identidad-invalida' };
  const ahora = deps.ahoraMs ?? Date.now();
  const previo = pendientes.get(identidad);
  if (previo && ahora - previo.creadoMs < REENVIO_MINIMO_MS) return { ok: false, motivo: 'muy-seguido' };
  const miembro = await (deps.buscarMiembro ?? miembroPorIdentidad)(identidad);
  // A quien no es miembro se le responde igual que a quien sí: nadie descubre
  // por acá qué números o correos existen.
  if (!miembro) {
    logger.info(`[dali] pidió código una identidad que no es miembro: ${identidad}`);
    return { ok: true, canal: 'prueba', reintentoEnMs: REENVIO_MINIMO_MS };
  }
  const codigo = (deps.generar ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0')))();
  pendientes.set(identidad, { codigo, miembroId: miembro.id, creadoMs: ahora, intentos: 0 });
  // F2: acá se llama a constroad-auth y el código viaja. Hoy queda en el log.
  logger.info(`[dali] código de acceso para ${identidad} (${miembro.name}, ${miembro.companyId}): ${codigo} — vale ${VIGENCIA_CODIGO_MS / 60_000} min`);
  return { ok: true, canal: 'prueba', reintentoEnMs: REENVIO_MINIMO_MS };
};

export type ResultadoVerificacion = { ok: true; miembro: MiembroDali } | { ok: false; motivo: 'sin-codigo' | 'vencido' | 'incorrecto' | 'bloqueado' };

export const verificarCodigo = async (
  destino: string,
  codigo: string,
  deps: { buscarMiembro?: typeof miembroPorIdentidad; anotarIngreso?: typeof registrarIngreso; ahoraMs?: number } = {}
): Promise<ResultadoVerificacion> => {
  const identidad = normalizarIdentidad(destino);
  const ahora = deps.ahoraMs ?? Date.now();
  const pendiente = pendientes.get(identidad);
  if (!pendiente) return { ok: false, motivo: 'sin-codigo' };
  if (ahora - pendiente.creadoMs > VIGENCIA_CODIGO_MS) {
    pendientes.delete(identidad);
    return { ok: false, motivo: 'vencido' };
  }
  if (String(codigo || '').trim() !== pendiente.codigo) {
    pendiente.intentos += 1;
    if (pendiente.intentos >= INTENTOS_MAXIMOS) {
      pendientes.delete(identidad);
      logger.warn(`[dali] código bloqueado por ${INTENTOS_MAXIMOS} intentos: ${identidad}`);
      return { ok: false, motivo: 'bloqueado' };
    }
    return { ok: false, motivo: 'incorrecto' };
  }
  pendientes.delete(identidad);
  const miembro = await (deps.buscarMiembro ?? miembroPorIdentidad)(identidad);
  if (!miembro) return { ok: false, motivo: 'sin-codigo' };
  await (deps.anotarIngreso ?? registrarIngreso)(miembro.id);
  logger.info(`[dali] entró ${miembro.name} (${miembro.companyId}) con código`);
  return { ok: true, miembro };
};
