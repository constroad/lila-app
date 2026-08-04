/**
 * Helpers puros del rescate de archivos alojados en Telegram.
 *
 * Hasta mar-2026 los adjuntos (vales, guías, facturas, fotos de despacho) se
 * guardaban en Telegram y en Mongo quedaba su URL. Esas URLs **caducan**: las
 * 13 196 medias de `constroad` daban 404 (verificado 04/08/2026). El archivo NO
 * está perdido —Telegram lo conserva y se recupera con `getFile` a partir del
 * `fileId`, que el 100% de esas filas tiene— pero hay que traerlo al storage
 * propio y reescribir la URL.
 *
 * Aparte del 404, esas URLs llevan el TOKEN del bot incrustado: sacarlas de la
 * base es también higiene de seguridad.
 */

/** ¿Esta media todavía apunta a Telegram? */
export const isTelegramUrl = (url: unknown): boolean =>
  typeof url === 'string' && url.includes('api.telegram.org');

/**
 * Carpeta destino dentro del storage de la company, según el tipo de media.
 * Se agrupa por tipo para que el disco quede navegable, no un volcado plano.
 */
export const buildRescuePath = ({
  type,
  mediaId,
}: {
  type?: string;
  mediaId: string;
}): string => {
  const safeType = String(type || 'otros')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
  const safeId = String(mediaId).replace(/[^a-zA-Z0-9_-]/g, '');
  return `rescatado-telegram/${safeType}/${safeId}`;
};

/**
 * Nombre de archivo final. Conserva el original cuando se puede —es lo que ve
 * el usuario al descargar— y cae al `file_path` de Telegram si no hay nombre.
 */
export const buildRescueFileName = ({
  name,
  telegramFilePath,
  mediaId,
}: {
  name?: string;
  telegramFilePath?: string;
  mediaId: string;
}): string => {
  const original = String(name || '').trim();
  if (original) return original.replace(/[\\/:"*?<>|]+/g, '_');

  const fromTelegram = String(telegramFilePath || '').split('/').pop() || '';
  if (fromTelegram) return fromTelegram.replace(/[\\/:"*?<>|]+/g, '_');

  return `${mediaId}.bin`;
};

/**
 * Reparte el trabajo en tandas.
 *
 * Telegram limita a ~30 requests/segundo y son 13 196 archivos: sin tandas, el
 * rescate se come el rate limit y empieza a recibir 429.
 */
export const chunk = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};
