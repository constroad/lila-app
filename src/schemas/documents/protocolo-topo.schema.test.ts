jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { protocoloTopoSchema } from './protocolo-topo.schema.js';
import { protocoloTopoCompletoSchema } from './protocolo-topo-completo.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';
import { structureDataForReportType } from '../../services/report-data-aggregator.service.js';

const tabla = () => protocoloTopoSchema.sections.find((section) => section.id === 'puntosControl');
const columna = (key: string) => (tabla()?.columns || []).find((column) => column.key === key);

const completoColumna = (seccionId: string, key: string) =>
  ((protocoloTopoCompletoSchema.sections.find((section) => section.id === seccionId)?.columns) || [])
    .find((column) => column.key === key);

const aggregate = () =>
  structureDataForReportType('TOP-PROT', {
    service: { projectName: 'Rehabilitacion vial' },
    client: { name: 'Consorcio Vial' },
    orders: [], dispatches: [], certificates: [], invoices: [], payments: [],
    financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [],
  } as never);

describe('protocoloTopoSchema (TOP-PROT)', () => {
  it('metadata y registro', () => {
    expect(protocoloTopoSchema.code).toBe('TOP-PROT');
    expect(getSchemaByCode('TOP-PROT')).toBe(protocoloTopoSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('declara CONTRA QUE se compara (proyecto + tolerancias)', () => {
    const campos = (protocoloTopoSchema.sections.find((section) => section.id === 'topoInfo')?.fields || [])
      .map((field) => field.key);
    expect(campos).toContain('topografia.toleranciaPlanimetrica');
    expect(campos).toContain('topografia.toleranciaAltimetrica');
    expect(columna('esteProyecto')?.editable).toBe(true);
    expect(columna('cotaProyecto')?.editable).toBe(true);
  });

  it('ERROR, CUMPLE y DIF. COTA son derivados', () => {
    expect(columna('error')?.computed).toBe(true);
    expect(columna('cumple')?.computed).toBe(true);
    expect(columna('difCota')?.computed).toBe(true);
    expect(columna('error')?.editable).toBeFalsy();
  });

  it('CUMPLE se computa DESPUES del error que lee', () => {
    const claves = (tabla()?.columns || []).map((column) => column.key);
    expect(claves.indexOf('error')).toBeLessThan(claves.indexOf('cumple'));
  });

  it('las derivadas explican como se mueven', () => {
    expect(columna('error')?.computedHint).toContain('ESTE PROY.');
    expect(columna('cumple')?.computedHint).toContain('TOL. PLANIM.');
  });

  it('usa EXACTAMENTE las formulas de TOP-CMP: es su hermano simple', () => {
    // Dos formulas distintas para el mismo calculo terminan divergiendo. Ya
    // estan probadas contra el evaluador real en
    // `Portal/src/components/documents/topografiaCompletaFormula.test.ts`.
    expect(columna('error')?.formula).toBe(completoColumna('planimetria', 'error')?.formula);
    expect(columna('cumple')?.formula).toBe(completoColumna('planimetria', 'cumple')?.formula);
    expect(columna('difCota')?.formula).toBe(completoColumna('altimetria', 'diferencia')?.formula);
  });

  it('el agregador siembra la fecha del levantamiento', () => {
    expect(aggregate().topografia.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(aggregate().proyecto.obra).toBe('Rehabilitacion vial');
  });

  it('el agregador NO inventa puntos', () => {
    expect(aggregate().puntosControl).toBeUndefined();
  });
});
