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
 * Argumentos de qpdf. Escribe SIEMPRE en un archivo aparte: si el proceso muere
 * a mitad de camino, el archivo que el usuario acaba de subir queda intacto.
 */
export const buildQpdfArgs = (sourcePath: string, targetPath: string): string[] => [
  '--linearize',
  sourcePath,
  targetPath,
];
