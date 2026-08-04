import {
  buildRescueFileName,
  buildRescuePath,
  chunk,
  isTelegramUrl,
} from './telegram-rescue.helpers.js';

describe('qué medias hay que rescatar', () => {
  // Verificado 04/08/2026: las 13 196 medias con URL de Telegram daban 404, pero
  // el 100% conserva su `fileId` y Telegram todavía sirve el archivo.
  it('reconoce una URL de Telegram', () => {
    expect(isTelegramUrl('https://api.telegram.org/file/botX/documents/file_1')).toBe(true);
  });

  it('deja en paz lo que ya vive en el storage propio', () => {
    // Idempotencia: correr el script dos veces no debe tocar lo ya rescatado.
    expect(isTelegramUrl('https://cloud.example.net/files/companies/x/a.pdf')).toBe(false);
    expect(isTelegramUrl('')).toBe(false);
    expect(isTelegramUrl(undefined)).toBe(false);
  });
});

describe('dónde aterriza cada archivo', () => {
  it('agrupa por tipo para que el disco quede navegable', () => {
    expect(buildRescuePath({ type: 'VALE', mediaId: 'abc123' })).toBe(
      'rescatado-telegram/vale/abc123'
    );
  });

  it('sin tipo, va a una carpeta genérica', () => {
    expect(buildRescuePath({ mediaId: 'abc123' })).toBe('rescatado-telegram/otros/abc123');
  });

  it('sanea tipo e id: nunca escapan de su carpeta', () => {
    const path = buildRescuePath({ type: '../../etc', mediaId: '../passwd' });

    expect(path).not.toContain('..');
    expect(path.startsWith('rescatado-telegram/')).toBe(true);
  });
});

describe('nombre del archivo rescatado', () => {
  it('conserva el original: es lo que el usuario ve al descargar', () => {
    expect(
      buildRescueFileName({ name: 'Despacho_B1T848.pdf', mediaId: 'm1' })
    ).toBe('Despacho_B1T848.pdf');
  });

  it('sin nombre, usa el de Telegram', () => {
    expect(
      buildRescueFileName({ telegramFilePath: 'documents/file_32737', mediaId: 'm1' })
    ).toBe('file_32737');
  });

  it('sin nada, el id: nunca un archivo sin nombre', () => {
    expect(buildRescueFileName({ mediaId: 'm1' })).toBe('m1.bin');
  });

  it('sanea nombres que romperían la ruta', () => {
    expect(buildRescueFileName({ name: 'a/b:c*.pdf', mediaId: 'm1' })).toBe('a_b_c_.pdf');
  });
});

describe('tandas para no chocar con el rate limit', () => {
  // Telegram limita a ~30 req/s y son 13 196 archivos: sin tandas llegan los 429.
  it('parte la lista en grupos del tamaño pedido', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('una lista vacía no genera tandas', () => {
    expect(chunk([], 5)).toEqual([]);
  });
});
