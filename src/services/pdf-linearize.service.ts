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
import { spawn } from 'child_process';
import type { QpdfModule } from './qpdf-wasm.loader.js';
import {
  WASM_MAX_BYTES,
  buildQpdfInstallHint,
  resolveLinearizeEngine,
  shouldLinearize,
} from './pdf-linearize.helpers.js';
import logger from '../utils/logger.js';

/** Timeout del binario nativo con archivos grandes. */
const NATIVE_TIMEOUT_MS = 10 * 60_000;
/** qpdf: 0 = ok, 3 = advertencias (el PDF salió igual). >3 = error real. */
const QPDF_MAX_OK_CODE = 3;

let nativeAvailable: boolean | null = null;

let modulePromise: Promise<QpdfModule | null> | null = null;

/**
 * Carga el WASM una sola vez por proceso.
 *
 * El `import` es DINÁMICO por diseño: `qpdf-wasm.loader` usa `import.meta`, que
 * no parsea en CommonJS. Manteniéndolo fuera del grafo estático, este servicio
 * se puede importar desde cualquier test sin mockearlo, y el loader solo se
 * evalúa cuando de verdad hay un PDF que linearizar.
 */
const loadQpdf = async (): Promise<QpdfModule | null> => {
  if (!modulePromise) {
    modulePromise = (async () => {
      try {
        const { loadQpdfWasm } = await import('./qpdf-wasm.loader.js');
        return await loadQpdfWasm();
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

/** Corre el binario del sistema. Solo se usa con archivos que el WASM no aguanta. */
const runNativeQpdf = (args: string[]): Promise<number> =>
  new Promise((resolve, reject) => {
    const proc = spawn('qpdf', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`qpdf nativo excedió ${NATIVE_TIMEOUT_MS} ms`));
    }, NATIVE_TIMEOUT_MS);

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== null && code <= QPDF_MAX_OK_CODE) resolve(code);
      else reject(new Error(stderr || `qpdf nativo salió con código ${code}`));
    });
  });

/** ¿Está el binario `qpdf` en esta máquina? Se resuelve una vez por proceso. */
export async function isNativeQpdfAvailable(): Promise<boolean> {
  if (nativeAvailable !== null) return nativeAvailable;
  try {
    await runNativeQpdf(['--version']);
    nativeAvailable = true;
  } catch {
    nativeAvailable = false;
  }
  return nativeAvailable;
}

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
    const engine = resolveLinearizeEngine({
      bytes: stat.size,
      nativeAvailable: await isNativeQpdfAvailable(),
    });

    if (engine === 'skip') {
      logger.warn('[pdf-linearize] PDF demasiado grande para el motor disponible', {
        filePath,
        bytes: stat.size,
        limiteWasm: WASM_MAX_BYTES,
        remedio: `instalar el binario qpdf para cubrir archivos grandes: ${buildQpdfInstallHint()}`,
      });
      return false;
    }

    if (engine === 'native') {
      // El binario no carga el archivo en RAM: es el único que aguanta lo que
      // `tus` permite subir (hasta 2 GB).
      await runNativeQpdf(['--linearize', filePath, tempPath]);
      const nativeStat = await fs.stat(tempPath);
      if (nativeStat.size <= 0) throw new Error('qpdf nativo produjo un archivo vacío');
      await fs.move(tempPath, filePath, { overwrite: true });
      return true;
    }

    qpdf.FS.writeFile(virtualIn, await fs.readFile(filePath));
    const code = qpdf.callMain(['--linearize', virtualIn, virtualOut]);
    if (code > QPDF_MAX_OK_CODE) throw new Error(`qpdf salió con código ${code}`);

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

/**
 * Reporta al arrancar qué motores de linearización hay.
 *
 * El WASM viaja con el proyecto, pero el binario nativo NO: al mover lila a otra
 * máquina —o al meterla en un contenedor— es lo primero que se olvida. En vez de
 * confiar en la memoria de alguien, lila lo dice cada vez que arranca, con el
 * remedio y el tamaño exacto que queda sin cubrir.
 */
export async function logLinearizeCapabilities(): Promise<void> {
  const [wasm, native] = await Promise.all([isQpdfAvailable(), isNativeQpdfAvailable()]);
  const wasmMb = Math.round(WASM_MAX_BYTES / (1024 * 1024));

  if (wasm && native) {
    logger.info(`📄 Linearización de PDF: WASM + binario nativo (sin límite práctico)`);
    return;
  }
  if (wasm) {
    logger.warn(
      `📄 Linearización de PDF: solo WASM. Los PDF de más de ${wasmMb} MB quedarán SIN ` +
        `linearizar (el visitante espera la descarga completa para ver la página 1).\n` +
        `   Para cubrirlos, instalar el binario qpdf en esta máquina:\n` +
        `     ${buildQpdfInstallHint()}\n` +
        `   Verificar con: qpdf --version   ·   luego reiniciar lila.\n` +
        `   En un contenedor va en el Dockerfile (ej. RUN apt-get update && apt-get install -y qpdf).`
    );
    return;
  }
  logger.error(
    '📄 Linearización de PDF NO disponible: falta el paquete @neslinesli93/qpdf-wasm. ' +
      'Los PDF se guardan sin linearizar. Remedio: yarn install.'
  );
}
