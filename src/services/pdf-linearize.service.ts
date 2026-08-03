/**
 * Linearización de PDFs ("Fast Web View").
 *
 * Sin linearizar, el índice (xref) vive al FINAL del archivo: cualquier visor
 * tiene que llegar hasta el final antes de pintar el primer píxel. Linearizado,
 * la página 1 se dibuja con los primeros KB — que es lo que hace tolerable abrir
 * un PDF de 3 MB por una red de ~220 KB/s.
 *
 * Usa **qpdf compilado a WASM**, no el binario del sistema: así viaja dentro de
 * `node_modules` y lila sigue funcionando al moverla de máquina, sin pedirle a
 * nadie un `brew install`. Verificado que produce el MISMO archivo que el qpdf
 * nativo (3 427 243 → 3 213 307 bytes, con marcador `/Linearized`).
 *
 * NUNCA rompe una subida: ante cualquier fallo el original queda intacto y solo
 * se registra el aviso. Es una optimización, no un requisito.
 */

import fs from 'fs-extra';
import path from 'path';
import { createRequire } from 'module';
import { shouldLinearize } from './pdf-linearize.helpers.js';
import logger from '../utils/logger.js';

/**
 * Tope de tamaño: el WASM trabaja en memoria, así que un PDF enorme se saltea
 * en vez de arriesgar la RAM del proceso que además sirve archivos y WhatsApp.
 */
const MAX_LINEARIZE_BYTES = 60 * 1024 * 1024;

const require = createRequire(import.meta.url);

type QpdfModule = {
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
    unlink: (path: string) => void;
  };
  callMain: (args: string[]) => number;
};

let modulePromise: Promise<QpdfModule | null> | null = null;

/** Carga el WASM una sola vez por proceso. */
const loadQpdf = async (): Promise<QpdfModule | null> => {
  if (!modulePromise) {
    modulePromise = (async () => {
      try {
        const factory = require('@neslinesli93/qpdf-wasm');
        const wasmPath = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
        const create = typeof factory === 'function' ? factory : factory.default;
        return (await create({ locateFile: () => wasmPath })) as QpdfModule;
      } catch (error) {
        logger.warn('[pdf-linearize] qpdf-wasm no disponible: los PDFs quedan sin linearizar', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })();
  }
  return modulePromise;
};

/** ¿Se puede linearizar en este proceso? */
export async function isQpdfAvailable(): Promise<boolean> {
  return (await loadQpdf()) !== null;
}

/**
 * Linealiza el PDF en su lugar. Devuelve `true` solo si el archivo quedó
 * reemplazado. Escribe en un temporal y recién entonces renombra, para que un
 * fallo a mitad de camino nunca deje corrupto el archivo del usuario.
 */
export async function linearizePdfInPlace(
  filePath: string,
  meta: { fileName?: string; mimeType?: string } = {}
): Promise<boolean> {
  if (!shouldLinearize({ fileName: meta.fileName || filePath, mimeType: meta.mimeType })) {
    return false;
  }

  const qpdf = await loadQpdf();
  if (!qpdf) return false;

  const tempPath = `${filePath}.linearizing`;
  const virtualIn = `/in-${path.basename(filePath)}`;
  const virtualOut = `${virtualIn}.lin`;

  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_LINEARIZE_BYTES) {
      logger.warn('[pdf-linearize] PDF demasiado grande, se deja como está', {
        filePath,
        bytes: stat.size,
      });
      return false;
    }

    qpdf.FS.writeFile(virtualIn, await fs.readFile(filePath));
    // qpdf: 0 = ok, 3 = advertencias (el PDF salió igual). >3 = error real.
    const code = qpdf.callMain(['--linearize', virtualIn, virtualOut]);
    if (code > 3) throw new Error(`qpdf salió con código ${code}`);

    const output = qpdf.FS.readFile(virtualOut);
    if (!output?.length) throw new Error('qpdf produjo un archivo vacío');

    await fs.writeFile(tempPath, Buffer.from(output));
    await fs.move(tempPath, filePath, { overwrite: true });
    return true;
  } catch (error) {
    // Un PDF cifrado o corrupto no debe hacer fallar la subida.
    logger.warn('[pdf-linearize] No se pudo linearizar, se conserva el original', {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    await fs.remove(tempPath).catch(() => undefined);
    return false;
  } finally {
    // El FS del WASM es un disco en RAM: sin limpiar, cada PDF queda residente.
    [virtualIn, virtualOut].forEach((name) => {
      try {
        qpdf.FS.unlink(name);
      } catch {
        /* no existía */
      }
    });
  }
}
