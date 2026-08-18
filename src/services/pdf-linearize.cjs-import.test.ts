/**
 * `pdf-linearize.service` tiene que poder IMPORTARSE desde un test del proyecto
 * CJS.
 *
 * Usaba `createRequire(import.meta.url)` en el cuerpo del módulo, y en CJS eso
 * ni siquiera parsea: cualquier test que lo tocara —aunque fuera de rebote, vía
 * `public.controller`, `drive.controller`, `tus-upload`, `pdf-merger`,
 * `folio-generator`, `generator.service` o `pdf-vale.controller`— reventaba la
 * suite entera al cargarla. Se resolvía mockeando el módulo en cada test, uno
 * por uno; este fija el contrato para que no haga falta.
 *
 * Este archivo NO importa los globals de Jest a propósito: usar `jest.` sin esa
 * importación es lo que lo manda al proyecto CJS (ver `jest.config.cjs`). Ojo:
 * el clasificador busca el nombre de ese paquete como TEXTO en todo el archivo,
 * así que ni siquiera se puede nombrar en un comentario sin mandarlo a ESM.
 */
export {};

// `config/environment` y `logger` son el ancla ESM del repo (tienen su propio
// `import.meta`) y TODO test CJS los dobla. Lo que este test prueba es que, con
// esas dos dobladas como siempre, `pdf-linearize.service` ya se importa entero.
jest.mock('../config/environment.js', () => ({
  config: { nodeEnv: 'test', storage: { root: '/tmp/lila-app-test-storage' } },
}));

jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { shouldLinearize } from './pdf-linearize.helpers.js';
import { isQpdfAvailable, linearizePdfInPlace } from './pdf-linearize.service.js';

describe('pdf-linearize desde el proyecto CJS', () => {
  it('se importa y expone su API sin que el módulo reviente al cargarse', () => {
    expect(typeof linearizePdfInPlace).toBe('function');
    expect(typeof isQpdfAvailable).toBe('function');
    expect(shouldLinearize({ mimeType: 'application/pdf' })).toBe(true);
  });

  it('descarta lo que no es PDF sin llegar a cargar el motor', async () => {
    jest.setTimeout(5000);

    await expect(
      linearizePdfInPlace('/tmp/no-existe.jpg', { mimeType: 'image/jpeg' })
    ).resolves.toBe(false);
  });
});
