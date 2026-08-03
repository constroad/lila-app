import { ZIP_COMPRESSION_LEVEL } from './drive-folder-export.helpers.js';

describe('nivel de compresión del ZIP del drive', () => {
  // Medido contra producción el 03/08/2026 con los 15 PDFs reales del
  // Almirante (11.7 MB):
  //   - deflate nivel 6 → 10.3 MB en 200 s (51 KB/s)
  //   - descarga directa del mismo material → 141 KB/s
  // O sea: comprimir cuesta ~2.8x de velocidad para ahorrar 12%, porque un PDF
  // ya viene comprimido. El visitante espera 3 minutos para ahorrar 1.4 MB.
  it('guarda sin comprimir: el drive es casi todo PDF y JPG', () => {
    expect(ZIP_COMPRESSION_LEVEL).toBe(0);
  });
});
