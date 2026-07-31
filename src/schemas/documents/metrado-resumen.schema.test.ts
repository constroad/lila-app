jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { metradoResumenSchema } from './metrado-resumen.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';
import { structureDataForReportType } from '../../services/report-data-aggregator.service.js';

const aggregate = () =>
  structureDataForReportType('MET-RES', {
    service: {
      projectName: 'Rehabilitacion vial',
      partidas: [
        { itemCode: '01', description: 'Carpeta asfaltica', unit: 'm2', quantity: 16850, unitPrice: 48.5, total: 817225 },
        { itemCode: '02', description: 'Imprimacion', unit: 'm2', quantity: 16850, unitPrice: 3.2, total: 53920 },
      ],
    },
    client: { name: 'Consorcio Vial' },
    orders: [], dispatches: [], certificates: [], invoices: [], payments: [],
    financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [],
  } as never);

describe('metradoResumenSchema', () => {
  it('metadata y registro', () => {
    expect(metradoResumenSchema.code).toBe('MET-RES');
    expect(getSchemaByCode('MET-RES')).toBe(metradoResumenSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('PARCIAL es derivado (metrado x P.U.), no editable', () => {
    const tabla = metradoResumenSchema.sections.find((section) => section.id === 'metrado');
    const parcial = (tabla?.columns || []).find((column) => column.key === 'parcial');

    // `computed: true` es obligatorio: sin el la formula es inerte EN SILENCIO.
    expect(parcial?.computed).toBe(true);
    expect(parcial?.formula).toContain('num(row.metrado)');
    expect(parcial?.formula).toContain('num(row.precioUnitario)');
    expect(parcial?.editable).toBeFalsy();
  });

  it('los totales del resumen se derivan de la tabla', () => {
    const claves = (metradoResumenSchema.computedFields || []).map((field) => field.key);
    expect(claves).toEqual(['resumen.totalMetrado', 'resumen.totalParcial']);
  });

  it('el TOTAL PARCIAL no depende de la columna computada', () => {
    // `parcial` se persiste solo al editar la tabla en el canvas: sumar la
    // columna daba un total falso sobre data sembrada por el agregador o la API.
    const total = (metradoResumenSchema.computedFields || [])[1].formula;
    expect(total).not.toContain("'parcial'");
    expect(total).toContain('num(fila.metrado) * num(fila.precioUnitario)');
  });

  it('el agregador siembra el cuadro desde las partidas del servicio', () => {
    const data = aggregate();

    expect(data.metrado).toHaveLength(2);
    expect(data.metrado[0]).toEqual({
      item: '01',
      descripcion: 'Carpeta asfaltica',
      unidad: 'm2',
      metrado: 16850,
      precioUnitario: 48.5,
      parcial: 817225,
    });
    expect(data.proyecto.obra).toBe('Rehabilitacion vial');
  });

  it('los totales sembrados cuadran con las filas', () => {
    const data = aggregate();
    expect(data.resumen.totalMetrado).toBe(33700);
    expect(data.resumen.totalParcial).toBe(871145);
  });

  it('sin partidas NO inventa filas (solo datos del proyecto)', () => {
    const data = structureDataForReportType('MET-RES', {
      service: { projectName: 'Obra sin partidas' },
      client: null, orders: [], dispatches: [], certificates: [], invoices: [],
      payments: [], financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [],
    } as never);

    expect(data.metrado).toBeUndefined();
    expect(data.proyecto.obra).toBe('Obra sin partidas');
  });
});
