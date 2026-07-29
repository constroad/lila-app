import { resolveWriteErrorCode } from './gps-ingest.service.js';

/**
 * Regresión del ingest de GPS (Flota F4 §3.4).
 *
 * Este test existe por un bug REAL que se encontró verificando contra la DB: el
 * `MongoBulkWriteError` que lanza `insertMany` trae el código del duplicado
 * ANIDADO (`writeErrors[i].err.code`), no plano. Al leer solo la forma plana, el
 * reenvío legítimo del equipo (reintenta cuando recupera señal) se veía como error
 * de DB, el endpoint devolvía 503 y el proveedor reintentaba en bucle — el bucle
 * que el endpoint dice evitar.
 */
describe('resolveWriteErrorCode', () => {
  it('lee el código ANIDADO de mongoose (la forma que llega de insertMany)', () => {
    // Arrange: forma real observada contra `constroad_db`.
    const writeError = { index: 0, err: { code: 11000, errmsg: 'E11000 duplicate key' } };

    // Act + Assert
    expect(resolveWriteErrorCode(writeError)).toBe(11000);
  });

  it('lee el código plano del driver', () => {
    // Arrange
    const writeError = { index: 0, code: 11000 };

    // Act + Assert
    expect(resolveWriteErrorCode(writeError)).toBe(11000);
  });

  it('sin código devuelve undefined (y el lote NO se toma por duplicado)', () => {
    // Arrange: un error de conexión no tiene código de duplicado.
    const writeError = { index: 0, err: {} };

    // Act + Assert
    expect(resolveWriteErrorCode(writeError)).toBeUndefined();
    expect(resolveWriteErrorCode(undefined)).toBeUndefined();
  });
});
