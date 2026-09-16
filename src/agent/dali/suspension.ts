import { getBotConfigModel } from '../../database/bot.models.js';

/**
 * EMPRESA SUSPENDIDA POR EL OPERADOR (S2 «Suspender empresa»: «pausa el bot y
 * retira acceso al panel»). La marca vive en `bot_configs.operador.suspendida`;
 * la sesión la consulta en cada request con una caché de un minuto por
 * empresa, así una suspensión tarda a lo sumo un minuto en cerrar el panel y
 * levantarla, otro tanto en abrirlo.
 */
export const CACHE_SUSPENSION_MS = 60_000;

interface Marca {
  suspendida: boolean;
  hastaMs: number;
}
const marcas = new Map<string, Marca>();

/** Solo para tests. */
export const _resetSuspensiones = (): void => marcas.clear();

export const estaSuspendida = async (companyId: string, ahoraMs = Date.now()): Promise<boolean> => {
  const marca = marcas.get(companyId);
  if (marca && marca.hastaMs > ahoraMs) return marca.suspendida;
  const Config = await getBotConfigModel();
  const doc = (await Config.findOne({ companyId }).select('operador').lean()) as { operador?: { suspendida?: unknown } } | null;
  const suspendida = doc?.operador?.suspendida === true;
  marcas.set(companyId, { suspendida, hastaMs: ahoraMs + CACHE_SUSPENSION_MS });
  return suspendida;
};

/** Al suspender o levantar desde la consola, la caché se actualiza en el acto. */
export const anotarSuspension = (companyId: string, suspendida: boolean, ahoraMs = Date.now()): void => {
  marcas.set(companyId, { suspendida, hastaMs: ahoraMs + CACHE_SUSPENSION_MS });
};
