jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { actaConformidadSchema } from './acta-conformidad.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';
import { structureDataForReportType } from '../../services/report-data-aggregator.service.js';

const aggregate = (overrides: Record<string, unknown> = {}) =>
  structureDataForReportType('ACT-CNF', {
    service: {
      projectName: 'Corredor Vial',
      subcontratista: 'CONSTROAD SAC',
      rucSubcontratista: '20512345678',
      partidas: [{ itemCode: '01', description: 'Carpeta', unit: 'm2', quantity: 100, unitPrice: 50, total: 5000 }],
      ...overrides,
    },
    client: { name: 'Consorcio Vial', ruc: '20601234567', legalRepresentative: 'Ing. Torres' },
    company: null, orders: [], dispatches: [], certificates: [], invoices: [], payments: [],
    financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [],
  } as never);

describe('actaConformidadSchema', () => {
  it('metadata y registro', () => {
    expect(actaConformidadSchema.code).toBe('ACT-CNF');
    expect(getSchemaByCode('ACT-CNF')).toBe(actaConformidadSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('las dos variantes estan gated por `acta.tipo`', () => {
    const porTipo = actaConformidadSchema.sections.filter((section) => section.showIf);
    const valores = new Set(porTipo.map((section) => String(section.showIf?.value)));

    expect(porTipo.every((section) => section.showIf?.field === 'acta.tipo')).toBe(true);
    expect([...valores].sort()).toEqual(['SERVICIO', 'VENTA']);
  });

  it('siembra las PARTES del acta (antes salian vacias si nadie abria el editor)', () => {
    const data = aggregate();

    expect(data.contratista).toEqual({
      razonSocial: 'Consorcio Vial',
      ruc: '20601234567',
      representante: 'Ing. Torres',
    });
    expect(data.subcontratista).toEqual({
      razonSocial: 'CONSTROAD SAC',
      ruc: '20512345678',
      representanteLegal: '',
    });
  });

  it('el monto de la valorizacion sale de las partidas', () => {
    expect(aggregate().valorizacion).toEqual({ presupuestoMatriz: '', monto: 5000 });
  });

  it('sin partidas NO inventa un monto', () => {
    expect(aggregate({ partidas: [] }).valorizacion).toBeUndefined();
  });

  it('lleva la obra y su CUI', () => {
    const data = aggregate({ cui: 'CUI-99' });
    expect(data.obra).toEqual({ nombre: 'Corredor Vial', cui: 'CUI-99' });
  });
});
