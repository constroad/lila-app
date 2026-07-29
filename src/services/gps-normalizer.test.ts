import { MAX_INGEST_BATCH, normalizeGpsBatch } from './gps-normalizer.js';

/**
 * Normalizador de GPS del proveedor (Flota F4 §3.4).
 *
 * Estos tests fijan las MISMAS invariantes que
 * `Portal/src/server/fleet/gpsNormalizer.test.ts`: el archivo es un espejo
 * deliberado (los repos no comparten paquete) y esta suite es la que hace que una
 * divergencia salga en rojo en vez de aparecer como un rastro sucio en producción.
 *
 * Lo que se protege: el equipo sin fix (0,0) no entra, el epoch en segundos no
 * manda el punto a 1970, la fecha futura por reloj adelantado se cae, y el lote
 * tiene techo.
 */

const NOW = new Date('2026-07-28T15:00:00.000Z');

describe('normalizeGpsBatch · alias de proveedores', () => {
  it('traduce placa/latitude/ts (epoch en segundos)', () => {
    // Arrange: forma típica de un proveedor peruano.
    const payload = {
      positions: [
        { placa: 'abc-123', latitude: -12.05, longitud: -77.03, ts: 1785250800, velocidad: '42,5' },
      ],
    };

    // Act
    const result = normalizeGpsBatch(payload, { now: NOW });

    // Assert: placa en mayúsculas, coma decimal resuelta, epoch en segundos → ms.
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({ plate: 'ABC-123', lat: -12.05, lng: -77.03, speedKph: 42.5 });
    expect(result.points[0].at.getUTCFullYear()).toBe(2026);
  });

  it('acepta un punto suelto sin envoltorio', () => {
    // Arrange
    const payload = { plate: 'XYZ-999', lat: -12, lng: -77, at: '2026-07-28T14:00:00.000Z' };

    // Act + Assert
    expect(normalizeGpsBatch(payload, { now: NOW }).points).toHaveLength(1);
  });

  it('usa la placa por defecto cuando el punto no la trae', () => {
    // Arrange: proveedores que la mandan en la URL.
    const payload = [{ lat: -12, lng: -77, at: '2026-07-28T14:00:00.000Z' }];

    // Act
    const result = normalizeGpsBatch(payload, { now: NOW, defaultPlate: 'def-456' });

    // Assert
    expect(result.points[0].plate).toBe('DEF-456');
  });
});

describe('normalizeGpsBatch · descartes en la frontera', () => {
  it('descarta el (0,0) del equipo sin fix', () => {
    // Arrange
    const payload = [{ placa: 'ABC-123', lat: 0, lng: 0, at: '2026-07-28T14:00:00.000Z' }];

    // Act
    const result = normalizeGpsBatch(payload, { now: NOW });

    // Assert
    expect(result.points).toHaveLength(0);
    expect(result.rejected['coordenada-invalida']).toBe(1);
  });

  it('descarta la fecha futura por reloj adelantado', () => {
    // Arrange: 2 horas en el futuro.
    const payload = [{ placa: 'ABC-123', lat: -12, lng: -77, at: '2026-07-28T17:00:00.000Z' }];

    // Act
    const result = normalizeGpsBatch(payload, { now: NOW });

    // Assert
    expect(result.rejected['fecha-futura']).toBe(1);
  });

  it('descarta el punto más viejo que el TTL (el TTL lo borraría igual)', () => {
    // Arrange: 200 días atrás.
    const payload = [{ placa: 'ABC-123', lat: -12, lng: -77, at: '2026-01-01T00:00:00.000Z' }];

    // Act
    const result = normalizeGpsBatch(payload, { now: NOW });

    // Assert
    expect(result.rejected['fecha-expirada']).toBe(1);
  });

  it('descarta el punto sin placa', () => {
    // Arrange
    const payload = [{ lat: -12, lng: -77, at: '2026-07-28T14:00:00.000Z' }];

    // Act + Assert
    expect(normalizeGpsBatch(payload, { now: NOW }).rejected['sin-placa']).toBe(1);
  });

  it('cuenta el duplicado exacto (misma placa y mismo instante)', () => {
    // Arrange: el equipo reenvía al recuperar señal.
    const point = { placa: 'ABC-123', lat: -12, lng: -77, at: '2026-07-28T14:00:00.000Z' };

    // Act
    const result = normalizeGpsBatch([point, { ...point }], { now: NOW });

    // Assert
    expect(result.points).toHaveLength(1);
    expect(result.rejected['duplicado']).toBe(1);
  });

  it('corta el lote en el tope y reporta el excedente', () => {
    // Arrange: 520 puntos válidos.
    const payload = Array.from({ length: MAX_INGEST_BATCH + 20 }, (_, index) => ({
      placa: 'ABC-123',
      lat: -12,
      lng: -77,
      at: new Date(NOW.getTime() - index * 60000).toISOString(),
    }));

    // Act
    const result = normalizeGpsBatch(payload, { now: NOW });

    // Assert
    expect(result.points).toHaveLength(MAX_INGEST_BATCH);
    expect(result.rejected['sobre-el-tope']).toBe(20);
  });
});

describe('normalizeGpsBatch · orden y fuente', () => {
  it('devuelve los puntos ordenados por instante y marcados como del proveedor', () => {
    // Arrange: llegan desordenados.
    const payload = [
      { placa: 'ABC-123', lat: -12, lng: -77, at: '2026-07-28T14:30:00.000Z' },
      { placa: 'ABC-123', lat: -12.01, lng: -77, at: '2026-07-28T14:00:00.000Z' },
    ];

    // Act
    const result = normalizeGpsBatch(payload, { now: NOW });

    // Assert
    expect(result.points.map((point) => point.at.toISOString())).toEqual([
      '2026-07-28T14:00:00.000Z',
      '2026-07-28T14:30:00.000Z',
    ]);
    expect(result.points.every((point) => point.source === 'provider')).toBe(true);
  });
});
