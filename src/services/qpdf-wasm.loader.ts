/**
 * Carga del qpdf compilado a WASM. Vive APARTE a propósito.
 *
 * `@neslinesli93/qpdf-wasm` es CommonJS y hay que resolver la ruta del `.wasm`
 * en disco, así que hace falta `createRequire(import.meta.url)`. Y `import.meta`
 * es lo que obliga a que este archivo sea ESM: en el proyecto CJS de Jest ni
 * siquiera PARSEA.
 *
 * Por eso `pdf-linearize.service` no lo importa de forma estática, sino con
 * `await import(...)` dentro de la función que lo usa: así el grafo estático del
 * servicio queda libre de `import.meta` y cualquier test —CJS o ESM— puede
 * importar el servicio sin mockearlo. Este módulo solo se evalúa cuando de
 * verdad se va a linearizar un PDF.
 */
import { createRequire } from 'module';

const requireFromHere = createRequire(import.meta.url);

export type QpdfModule = {
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
    unlink: (path: string) => void;
  };
  callMain: (args: string[]) => number;
};

export const loadQpdfWasm = async (): Promise<QpdfModule> => {
  const factory = requireFromHere('@neslinesli93/qpdf-wasm');
  const wasmPath = requireFromHere.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
  const create = typeof factory === 'function' ? factory : factory.default;
  return (await create({ locateFile: () => wasmPath })) as QpdfModule;
};
