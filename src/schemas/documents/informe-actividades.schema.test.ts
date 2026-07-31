jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { informeActividadesSchema } from './informe-actividades.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';
import { structureDataForReportType } from '../../services/report-data-aggregator.service.js';

const base = {
  service: { projectName: 'Corredor Vial' },
  client: { name: 'Consorcio Vial' },
  orders: [], certificates: [], invoices: [], payments: [],
  financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [],
};

const aggregate = (dispatches: unknown[]) =>
  structureDataForReportType('INF-ACT', { ...base, dispatches } as never);

describe('informeActividadesSchema', () => {
  it('metadata y registro', () => {
    expect(informeActividadesSchema.code).toBe('INF-ACT');
    expect(getSchemaByCode('INF-ACT')).toBe(informeActividadesSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('agrupa por DIA, no por viaje', () => {
    // Un dia con 3 viajes es UNA actividad de 3 viajes, no 3 filas.
    const data = aggregate([
      { date: '2026-06-18T12:15:00.000Z', quantity: 60, obra: 'Pachacutec', plate: 'D2P-890' },
      { date: '2026-06-18T14:15:00.000Z', quantity: 60, obra: 'Pachacutec', plate: 'B8F-624' },
      { date: '2026-06-18T16:15:00.000Z', quantity: 60, obra: 'Pachacutec', plate: 'D2P-890' },
    ]);

    expect(data.actividades).toHaveLength(1);
    expect(data.actividades[0]).toEqual({
      fecha: '2026-06-18',
      actividad: 'Despacho y colocacion de mezcla asfaltica',
      descripcion: '3 viaje(s) despachado(s)',
      cantidad: 180,
      unidad: 'm3',
      ubicacion: 'Pachacutec',
    });
  });

  it('la fecha es date-only de LIMA (no el dia UTC)', () => {
    // 02:00Z del 19 son las 21:00 del 18 en Lima: la actividad es del 18.
    const data = aggregate([{ date: '2026-06-19T02:00:00.000Z', quantity: 20, obra: 'X', plate: 'A-1' }]);
    expect(data.actividades[0].fecha).toBe('2026-06-18');
  });

  it('ordena por fecha y arma el periodo con los extremos', () => {
    const data = aggregate([
      { date: '2026-06-20T15:00:00.000Z', quantity: 10, obra: 'X', plate: 'A-1' },
      { date: '2026-06-18T15:00:00.000Z', quantity: 10, obra: 'X', plate: 'A-2' },
    ]);

    expect(data.actividades.map((row: { fecha: string }) => row.fecha)).toEqual([
      '2026-06-18',
      '2026-06-20',
    ]);
    expect(data.periodo.inicio).toBe('2026-06-18');
    expect(data.periodo.fin).toBe('2026-06-20');
  });

  it('los equipos son las PLACAS reales, sin repetir', () => {
    const data = aggregate([
      { date: '2026-06-18T15:00:00.000Z', quantity: 10, obra: 'X', plate: 'D2P-890' },
      { date: '2026-06-18T16:00:00.000Z', quantity: 10, obra: 'X', plate: 'D2P-890' },
      { date: '2026-06-18T17:00:00.000Z', quantity: 10, obra: 'X', plate: 'B8F-624' },
    ]);

    expect(data.resumen.equipos).toBe('D2P-890, B8F-624');
  });

  it('NO inventa personal, horas ni avance', () => {
    const data = aggregate([{ date: '2026-06-18T15:00:00.000Z', quantity: 10, obra: 'X', plate: 'A-1' }]);
    expect(data.resumen.personal).toBe(0);
    expect(data.resumen.horas).toBe(0);
    expect(data.resumen.avance).toBe(0);
  });

  it('sin despachos NO inventa filas', () => {
    const data = aggregate([]);
    expect(data.actividades).toBeUndefined();
    expect(data.proyecto.obra).toBe('Corredor Vial');
  });

  it('ignora despachos sin fecha valida', () => {
    const data = aggregate([
      { date: 'no-es-fecha', quantity: 99, obra: 'X', plate: 'A-1' },
      { date: '2026-06-18T15:00:00.000Z', quantity: 10, obra: 'X', plate: 'A-2' },
    ]);
    expect(data.actividades).toHaveLength(1);
    expect(data.actividades[0].cantidad).toBe(10);
  });
});
