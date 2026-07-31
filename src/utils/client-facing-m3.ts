/**
 * "Lo que ve el cliente" — override de PRESENTACIÓN del m³ de un despacho.
 *
 * ESPEJO de `Portal/src/common/utils/dispatchClientFacingM3.ts`. No es
 * duplicación por descuido: lila es autónoma y lee el MISMO documento
 * `dispatch` del Mongo compartido, así que la regla tiene que viajar con el
 * dato. Si las dos lecturas divergen, el vale automático (lo genera lila) y el
 * vale manual (lo genera Portal) imprimen números distintos para el mismo
 * despacho. El test fija el contrato en ambos repos.
 *
 * Los tres m³ de un despacho, que NO deben mezclarse:
 * - `planedQuantity` — planificado (mueve las bachadas).
 * - `quantity` — realmente cargado en planta. Dato INTERNO, base de liquidación.
 * - `placeholders.m3Dispatched` — lo que debe LEER el cliente (vale, WhatsApp,
 *   reporte). No es una medición.
 *
 * Regla central: **0 y vacío significan lo mismo — SIN override.**
 */

export type ClientFacingDispatch = {
  placeholders?: { m3Dispatched?: number | null } | null;
  quantity?: number | null;
  planedQuantity?: number | null;
};

/** True solo si el override es un número utilizable (finito y > 0). */
export function hasClientFacingM3(value?: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** m³ del viaje tal como debe verlo el cliente. */
export function resolveClientFacingM3(dispatch: ClientFacingDispatch): number {
  const candidates = [
    dispatch.placeholders?.m3Dispatched,
    dispatch.quantity,
    dispatch.planedQuantity,
  ];
  return candidates.find((value) => hasClientFacingM3(value)) ?? 0;
}
