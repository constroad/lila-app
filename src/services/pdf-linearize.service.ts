/**
 * Linearización de PDFs ("Fast Web View").
 *
 * Sin linearizar, el índice (xref) vive al FINAL del archivo: cualquier visor
 * tiene que llegar hasta el final antes de pintar el primer píxel. Linearizado,
 * la página 1 se dibuja con los primeros KB — que es lo que hace tolerable abrir
 * un PDF de 3 MB por una red de ~220 KB/s.
 *
 * NUNCA rompe una subida: si `qpdf` no está instalado o falla, el archivo
 * original queda tal cual y solo se registra el aviso. Es una optimización, no
 * un requisito.
 */

import { spawn } from 'child_process';
import fs from 'fs-extra';
import { buildQpdfArgs, shouldLinearize } from './pdf-linearize.helpers.js';
import logger from '../utils/logger.js';

const QPDF_TIMEOUT_MS = 60_000;
/** qpdf 3 = advertencias (el PDF salió igual); >3 = error real. */
const QPDF_MAX_OK_CODE = 3;

let qpdfAvailable: boolean | null = null;

const run = (command: string, args: string[], timeoutMs: number): Promise<number> =>
  new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`qpdf excedió ${timeoutMs} ms`));
    }, timeoutMs);

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== null && code <= QPDF_MAX_OK_CODE) {
        resolve(code);
        return;
      }
      reject(new Error(stderr || `qpdf salió con código ${code}`));
    });
  });

/** ¿Está qpdf en el sistema? Se resuelve una vez por proceso. */
export async function isQpdfAvailable(): Promise<boolean> {
  if (qpdfAvailable !== null) return qpdfAvailable;
  try {
    await run('qpdf', ['--version'], 5_000);
    qpdfAvailable = true;
  } catch {
    qpdfAvailable = false;
    logger.warn('[pdf-linearize] qpdf no disponible: los PDFs se guardan sin linearizar');
  }
  return qpdfAvailable;
}

/**
 * Linealiza el PDF en su lugar. Devuelve `true` solo si el archivo quedó
 * reemplazado. Escribe en un temporal y recién entonces renombra, para que un
 * fallo a mitad de camino nunca deje el archivo del usuario corrupto.
 */
export async function linearizePdfInPlace(
  filePath: string,
  meta: { fileName?: string; mimeType?: string } = {}
): Promise<boolean> {
  if (!shouldLinearize({ fileName: meta.fileName || filePath, mimeType: meta.mimeType })) {
    return false;
  }
  if (!(await isQpdfAvailable())) return false;

  const tempPath = `${filePath}.linearizing`;
  try {
    await run('qpdf', buildQpdfArgs(filePath, tempPath), QPDF_TIMEOUT_MS);
    const stat = await fs.stat(tempPath);
    if (stat.size <= 0) throw new Error('qpdf produjo un archivo vacío');

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
  }
}
