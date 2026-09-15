/**
 * Barrido de despachos «en ruta» sin cierre programado.
 *
 * ─── POR QUÉ EXISTE ────────────────────────────────────────────────────────
 * El cierre de fondo (`dispatch-autoclose.service`) es UN job por despacho,
 * creado al salir la unidad y guardado en un JsonStore. Con Torre (releases en
 * `~/deploys/lila/releases/<sha>/`, 15/08/2026) ese store quedó DENTRO de la
 * release: cada deploy arranca con la cola vacía y los jobs de las unidades que
 * ya salieron se pierden. 15/09/2026, 8 deploys en el día: a las 15:39 tres
 * unidades de Consorcio Lomas que salieron 08:53, 09:12 y 10:15 seguían «en
 * ruta». El store se mudó a `shared/` (WHATSAPP_SESSION_DIR), pero un one-shot
 * que se puede perder necesita alguien que lo vuelva a pedir: este barrido.
 *
 * Cada 10 minutos (y al arrancar) busca despachos `despachado` sin `arrival`
 * que salieron hace más de 20 min y menos de 12 h, y a los que no tienen job
 * les programa uno con el ETA que les QUEDA (salida + ETA de la ruta − ahora):
 * si ya se cumplió, cierra en el próximo tick. No decide llegadas: eso sigue
 * siendo `POST /api/dispatch/:id/auto-close` del Portal (idempotente, actor
 * `system`, una marca real posterior lo pisa).
 */
import logger from '../utils/logger.js';
import { getDispatchModel } from '../database/models.js';
import { hasScheduledAutoClose, scheduleDispatchAutoClose } from './dispatch-autoclose.service.js';
import { fetchDispatchTracking } from './driver-arrival-reminder.service.js';

/** Antes de esto el job del post-process normal todavía puede estar por crearse. */
export const SALIDA_MINIMA_MS = 20 * 60 * 1000;
/** Más viejo que una jornada no tiene sentido cerrarlo a ciegas. */
export const SALIDA_MAXIMA_MS = 12 * 60 * 60 * 1000;
const INTERVALO_MS = 10 * 60 * 1000;
const ESPERA_INICIAL_MS = 30 * 1000;

export type DespachoEnRuta = { companyId: string; dispatchId: string; departedAt: string };

const ms = (v: unknown): number | null => {
  const n = v instanceof Date ? v.getTime() : Date.parse(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * PURO: de una lista de despachos, los que hay que barrer. Un despacho cuenta
 * si está despachado, nadie marcó llegada, y salió en la ventana.
 */
export const seleccionarEnRutaSinCierre = (
  docs: Array<Record<string, unknown>>,
  ahoraMs: number,
  ventana: { minimaMs?: number; maximaMs?: number } = {}
): DespachoEnRuta[] => {
  const minima = ventana.minimaMs ?? SALIDA_MINIMA_MS;
  const maxima = ventana.maximaMs ?? SALIDA_MAXIMA_MS;
  const out: DespachoEnRuta[] = [];
  for (const d of docs) {
    if (String(d.state) !== 'despachado') continue;
    if ((d.arrival as { at?: unknown } | undefined)?.at) continue;
    const salida = ms(d.departedAt);
    if (salida === null) continue;
    const hace = ahoraMs - salida;
    if (hace < minima || hace > maxima) continue;
    const companyId = String(d.companyId ?? '').trim();
    if (!companyId) continue;
    out.push({ companyId, dispatchId: String(d._id), departedAt: new Date(salida).toISOString() });
  }
  return out;
};

/**
 * PURO: cuánto falta para el cierre. El ETA del tracking es la duración de la
 * ruta desde la salida, no desde ahora: se descuenta lo que ya pasó. Sin ETA
 * devuelve null (el job usa su fallback).
 */
export const etaRestanteSegundos = (departedAtMs: number, etaSeconds: number | null, ahoraMs: number): number | null => {
  if (etaSeconds === null || !Number.isFinite(etaSeconds) || etaSeconds <= 0) return null;
  const llegadaEsperadaMs = departedAtMs + etaSeconds * 1000;
  // 0 y no negativo: el job lo dispara en el próximo tick. Se evita `null`
  // porque eso significaría «sin ETA» y esperaría 90 min más.
  return Math.max(0, Math.round((llegadaEsperadaMs - ahoraMs) / 1000));
};

/** Una pasada. Devuelve cuántos programó (para el log y los tests de integración). */
export async function barrerDespachosEnRuta(ahoraMs = Date.now()): Promise<number> {
  const Dispatch = await getDispatchModel();
  const desde = new Date(ahoraMs - SALIDA_MAXIMA_MS).toISOString();
  const hasta = new Date(ahoraMs - SALIDA_MINIMA_MS).toISOString();
  // `departedAt` es texto ISO en el Portal: el rango lexicográfico coincide con
  // el cronológico. Se filtra en Mongo y se vuelve a filtrar en código con la
  // misma regla, por si algún documento lo guardó como Date.
  const docs = (await Dispatch.find({
    state: 'despachado',
    'arrival.at': { $exists: false },
    departedAt: { $gte: desde, $lte: hasta },
  })
    .select('companyId state departedAt arrival')
    .limit(200)
    .lean()) as Array<Record<string, unknown>>;

  const candidatos = seleccionarEnRutaSinCierre(docs, ahoraMs);
  let programados = 0;
  for (const c of candidatos) {
    if (await hasScheduledAutoClose(c.dispatchId)) continue;
    const tracking = await fetchDispatchTracking(c.companyId, c.dispatchId);
    const eta = etaRestanteSegundos(Date.parse(c.departedAt), tracking?.durationSeconds ?? null, ahoraMs);
    // Sin ETA y con más de 90 min desde la salida, el fallback del job (90 min
    // desde AHORA) sería esperar el doble: se cierra en el próximo tick.
    const etaSeconds = eta ?? (ahoraMs - Date.parse(c.departedAt) > 90 * 60 * 1000 ? 0 : null);
    const ok = await scheduleDispatchAutoClose({ companyId: c.companyId, dispatchId: c.dispatchId, etaSeconds });
    if (ok) {
      programados += 1;
      logger.info('dispatch_autoclose.sweeper_scheduled', { companyId: c.companyId, dispatchId: c.dispatchId, departedAt: c.departedAt, etaSeconds });
    }
  }
  if (candidatos.length) logger.info('dispatch_autoclose.sweep', { enRuta: candidatos.length, programados });
  return programados;
}

export function startDispatchAutoCloseSweeper(intervalMs = INTERVALO_MS): () => void {
  let corriendo = false;
  const pasada = () => {
    if (corriendo) return;
    corriendo = true;
    barrerDespachosEnRuta()
      .catch((err) => logger.error('[dispatch-autoclose-sweeper] pasada falló', err))
      .finally(() => {
        corriendo = false;
      });
  };
  const inicial = setTimeout(pasada, ESPERA_INICIAL_MS);
  const timer = setInterval(pasada, intervalMs);
  logger.info(`[dispatch-autoclose-sweeper] started (interval=${intervalMs}ms)`);
  return () => {
    clearTimeout(inicial);
    clearInterval(timer);
    logger.info('[dispatch-autoclose-sweeper] stopped');
  };
}
