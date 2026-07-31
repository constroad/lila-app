jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { protocoloTopoCompletoSchema } from './protocolo-topo-completo.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';
import { structureDataForReportType } from '../../services/report-data-aggregator.service.js';

const seccion = (id: string) =>
  protocoloTopoCompletoSchema.sections.find((section) => section.id === id);

const columna = (seccionId: string, key: string) =>
  (seccion(seccionId)?.columns || []).find((column) => column.key === key);

const campoComputado = (key: string) =>
  (protocoloTopoCompletoSchema.computedFields || []).find((field) => field.key === key);

const aggregate = () =>
  structureDataForReportType('TOP-CMP', {
    service: { projectName: 'Rehabilitacion vial' },
    client: { name: 'Consorcio Vial' },
    orders: [], dispatches: [], certificates: [], invoices: [], payments: [],
    financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [],
  } as never);

describe('protocoloTopoCompletoSchema', () => {
  it('metadata y registro', () => {
    expect(protocoloTopoCompletoSchema.code).toBe('TOP-CMP');
    expect(getSchemaByCode('TOP-CMP')).toBe(protocoloTopoCompletoSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('el protocolo declara CONTRA QUE se compara', () => {
    // Sin coordenada de proyecto ni tolerancia, el protocolo no dictamina nada:
    // el "SI" del resumen queda a criterio del que tipea.
    const campos = (seccion('topoInfo')?.fields || []).map((field) => field.key);
    expect(campos).toContain('topografia.toleranciaPlanimetrica');
    expect(campos).toContain('topografia.toleranciaAltimetrica');
    expect(columna('planimetria', 'esteProyecto')?.editable).toBe(true);
    expect(columna('planimetria', 'norteProyecto')?.editable).toBe(true);
    expect(columna('altimetria', 'cotaProyecto')?.editable).toBe(true);
  });

  it('el ERROR de replanteo es derivado, no se tipea', () => {
    const error = columna('planimetria', 'error');
    expect(error?.computed).toBe(true);
    expect(error?.editable).toBeFalsy();
    expect(error?.formula).toContain('Math.sqrt');
  });

  it('la DIFERENCIA de cota es derivada', () => {
    const diferencia = columna('altimetria', 'diferencia');
    expect(diferencia?.computed).toBe(true);
    expect(diferencia?.formula).toContain('num(row.cotaProyecto)');
  });

  it('CUMPLE se computa DESPUES del error/diferencia que lee', () => {
    const plani = (seccion('planimetria')?.columns || []).map((column) => column.key);
    const alti = (seccion('altimetria')?.columns || []).map((column) => column.key);
    expect(plani.indexOf('error')).toBeLessThan(plani.indexOf('cumple'));
    expect(alti.indexOf('diferencia')).toBeLessThan(alti.indexOf('cumple'));
    expect(columna('planimetria', 'cumple')?.computed).toBe(true);
    expect(columna('altimetria', 'cumple')?.computed).toBe(true);
  });

  it('el dictamen de altimetria usa VALOR ABSOLUTO', () => {
    // Quedarse corto rompe la rasante igual que pasarse.
    expect(columna('altimetria', 'cumple')?.formula).toContain('Math.abs');
  });

  it('el resumen se deriva de lo CRUDO, no de las columnas computadas', () => {
    expect(campoComputado('resumen.errorMaximo')?.formula).not.toContain("'error'");
    expect(campoComputado('resumen.errorMaximo')?.formula).toContain('punto.esteProyecto');
    expect(campoComputado('resumen.fueraTolerancia')?.formula).toContain('data.altimetria');
  });

  it('las formulas coinciden LITERALMENTE con las probadas en Portal', () => {
    expect(columna('planimetria', 'error')?.formula).toBe(
      "num(row.esteProyecto) || num(row.norteProyecto) ? round(Math.sqrt(Math.pow(num(row.este) - num(row.esteProyecto), 2) + Math.pow(num(row.norte) - num(row.norteProyecto), 2)), 3) : ''"
    );
    expect(columna('planimetria', 'cumple')?.formula).toBe(
      "num((data.topografia || {}).toleranciaPlanimetrica) > 0 && row.error !== '' ? (num(row.error) <= num((data.topografia || {}).toleranciaPlanimetrica) ? 'SI' : 'NO') : ''"
    );
    expect(columna('altimetria', 'diferencia')?.formula).toBe(
      "num(row.cotaProyecto) ? round(num(row.cota) - num(row.cotaProyecto), 3) : ''"
    );
    expect(columna('altimetria', 'cumple')?.formula).toBe(
      "num((data.topografia || {}).toleranciaAltimetrica) > 0 && row.diferencia !== '' ? (Math.abs(num(row.diferencia)) <= num((data.topografia || {}).toleranciaAltimetrica) ? 'SI' : 'NO') : ''"
    );
  });

  it('el agregador siembra la fecha del levantamiento', () => {
    const data = aggregate();
    expect(data.topografia.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.proyecto.obra).toBe('Rehabilitacion vial');
  });

  it('el agregador NO inventa puntos: los da el equipo', () => {
    expect(aggregate().planimetria).toBeUndefined();
    expect(aggregate().altimetria).toBeUndefined();
  });
});
