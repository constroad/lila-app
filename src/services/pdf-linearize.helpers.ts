import path from 'path';

/**
 * ¿Este archivo se puede linearizar?
 *
 * Linearizar ("Fast Web View") reordena el PDF para que el índice quede al
 * PRINCIPIO: así un visor pinta la página 1 con los primeros KB en vez de tener
 * que llegar al final del archivo. Solo aplica a PDF — pasarle un JPG a qpdf lo
 * rompería.
 */
export const shouldLinearize = ({
  fileName,
  mimeType,
}: {
  fileName?: string;
  mimeType?: string;
}): boolean => {
  if (String(mimeType ?? '').toLowerCase().includes('pdf')) return true;
  return path.extname(String(fileName ?? '')).toLowerCase() === '.pdf';
};

/**
 * Tope del motor WASM: trabaja en memoria (entrada + salida), así que un PDF
 * enorme se lo lleva puesto junto con el proceso que sirve archivos y WhatsApp.
 */
export const WASM_MAX_BYTES = 220 * 1024 * 1024;

export type LinearizeEngine = 'wasm' | 'native' | 'skip';

/**
 * Motor para cada archivo.
 *
 * - `wasm`: qpdf compilado, viaja en `node_modules`. Funciona en cualquier
 *   máquina sin instalar nada — el caso normal.
 * - `native`: el binario `qpdf` del sistema. No carga el archivo en RAM (usa
 *   acceso aleatorio a disco), así que es el único que aguanta los PDFs que
 *   `tus` permite subir al drive (hasta 2 GB).
 * - `skip`: grande y sin binario. Se conserva el original: mejor un PDF lento
 *   de abrir que un proceso muerto por falta de memoria.
 */
export const resolveLinearizeEngine = ({
  bytes,
  nativeAvailable,
}: {
  bytes: number;
  nativeAvailable: boolean;
}): LinearizeEngine => {
  if (!bytes || bytes <= 0) return 'skip';
  if (bytes <= WASM_MAX_BYTES) return 'wasm';
  return nativeAvailable ? 'native' : 'skip';
};

/**
 * Comando concreto para instalar el binario `qpdf`, según la plataforma.
 *
 * El aviso de arranque decía "instalar el binario qpdf" y nada más: quien lo lee
 * al mover lila a otra máquina tenía que salir a buscar el comando. Un aviso sin
 * remedio accionable no sirve de nada.
 */
export const buildQpdfInstallHint = (platform: string = process.platform): string => {
  if (platform === 'darwin') return 'brew install qpdf';
  if (platform === 'linux') {
    return 'sudo apt-get update && sudo apt-get install -y qpdf   (Alpine: apk add qpdf)';
  }
  return 'descargar desde https://qpdf.sourceforge.io';
};
