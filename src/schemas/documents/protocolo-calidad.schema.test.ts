jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { protocoloCalidadSchema } from './protocolo-calidad.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';
import { structureDataForReportType } from '../../services/report-data-aggregator.service.js';

const tabla = () => protocoloCalidadSchema.sections.find((section) => section.id === 'ensayos');
const columna = (key: string) => (tabla()?.columns || []).find((column) => column.key === key);
const campoComputado = (key: string) =>
  (protocoloCalidadSchema.computedFields || []).find((field) => field.key === key);

const aggregate = () =>
  structureDataForReportType('CAL-PROT', {
    service: { projectName: 'Rehabilitacion vial' },
    client: { name: 'Consorcio Vial' },
    orders: [], dispatches: [], certificates: [], invoices: [], payments: [],
    financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [],
  } as never);

describe('protocoloCalidadSchema (CAL-PROT)', () => {
  it('metadata y registro', () => {
    expect(protocoloCalidadSchema.code).toBe('CAL-PROT');
    expect(getSchemaByCode('CAL-PROT')).toBe(protocoloCalidadSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('el dictamen CUMPLE es derivado de la especificacion', () => {
    const cumple = columna('cumple');
    expect(cumple?.computed).toBe(true);
    expect(cumple?.editable).toBeFalsy();
    expect(cumple?.formula).toContain('row.especificacion');
    expect(cumple?.formula).toContain('row.resultado');
  });

  it('la formula NUNCA borra lo tipeado: devuelve el valor previo', () => {
    // Con una especificacion cualitativa ("no presenta segregacion") el criterio
    // es del laboratorista. Y el try/catch evita que un fallo vacie la celda.
    const formula = String(columna('cumple')?.formula || '');
    expect(formula).toContain('const previo = row.cumple');
    expect(formula).toContain('catch');
    expect(formula).toContain("return row.cumple || ''");
  });

  it('interpreta los cuatro formatos de especificacion del rubro', () => {
    const formula = String(columna('cumple')?.formula || '');
    expect(formula).toContain('min');
    expect(formula).toContain('max');
    expect(formula).toMatch(/rango/);
    expect(formula).toContain('Math.abs');
  });

  it('explica por que la celda no se tipea', () => {
    expect(columna('cumple')?.computedHint).toContain('ESPECIFICACION');
  });

  it('el resumen dice si el lote se rechaza', () => {
    expect(campoComputado('resumen.noConformes')?.formula).toContain("=== 'NO'");
    expect(campoComputado('resumen.ensayos')?.formula).toContain('fila.ensayo');
    expect(campoComputado('resumen.conformidad')).toBeTruthy();
  });

  it('el % no divide por cero', () => {
    expect(campoComputado('resumen.conformidad')?.formula).toContain('num(data.resumen.ensayos) > 0');
  });

  it('cuenta las condiciones del checklist', () => {
    const formula = String(campoComputado('resumen.condiciones')?.formula || '');
    ['muestrasRotuladas', 'equiposCalibrados', 'cadenaCustodia', 'registroCompleto'].forEach(
      (clave) => expect(formula).toContain(clave)
    );
  });

  it('el agregador siembra la fecha del protocolo', () => {
    expect(aggregate().control.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(aggregate().proyecto.obra).toBe('Rehabilitacion vial');
  });

  it('el agregador NO inventa ensayos: los produce el laboratorio', () => {
    expect(aggregate().ensayos).toBeUndefined();
  });
});
