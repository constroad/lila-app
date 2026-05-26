jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { contratoServicioSchema } from './contrato-servicio.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';
import { structureDataForReportType } from '../../services/report-data-aggregator.service.js';

describe('contratoServicioSchema', () => {
  it('has correct metadata', () => {
    expect(contratoServicioSchema.code).toBe('CONT-SRV');
    expect(contratoServicioSchema.id).toBe('contrato-servicio');
    expect(contratoServicioSchema.category).toBe('Administrative');
    expect(contratoServicioSchema.orientation).toBe('portrait');
    expect(contratoServicioSchema.pageSize).toBe('A4');
    expect(contratoServicioSchema.backgroundImageEnabled).toBe(true);
  });

  it('registers in the schema registry', () => {
    expect(getSchemaByCode('CONT-SRV')).toBe(contratoServicioSchema);
  });

  it('has no duplicate section ids', () => {
    const ids = contratoServicioSchema.sections.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('has all required sections', () => {
    const ids = contratoServicioSchema.sections.map((s) => s.id);
    expect(ids).toContain('partes');
    expect(ids).toContain('clausula1');
    expect(ids).toContain('clausula2Obra');
    expect(ids).toContain('preciosUnitarios');
    expect(ids).toContain('clausula3Monto');
    expect(ids).toContain('cuentasBancarias');
    expect(ids).toContain('clausula4FormaPago');
    expect(ids).toContain('sectoresPago');
    expect(ids).toContain('clausula5Plazos');
    expect(ids).toContain('clausula5Texto');
    expect(ids).toContain('firmas');
    expect(ids).toContain('cierre');
  });

  it('preciosUnitarios section comes after clausula3Monto in sections array', () => {
    const ids = contratoServicioSchema.sections.map((s) => s.id);
    expect(ids.indexOf('clausula3Monto')).toBeLessThan(ids.indexOf('preciosUnitarios'));
  });

  it('has sectoresPago with required columns', () => {
    const section = contratoServicioSchema.sections.find((s) => s.id === 'sectoresPago');
    expect(section).toBeDefined();
    const colKeys = (section?.columns || []).map((c) => c.key);
    expect(colKeys).toContain('sector');
    expect(colKeys).toContain('descripcion');
    expect(colKeys).toContain('metrado');
    expect(colKeys).toContain('precioUnit');
    expect(colKeys).toContain('parcial');
  });

  it('has clausula2Trabajos default text with a) b) c) subsections', () => {
    const text = String(contratoServicioSchema.defaultData.clausula2Trabajos || '');
    expect(text).toContain('a)');
    expect(text).toContain('b)');
    expect(text).toContain('c)');
    expect(text).toContain('imprimación asfáltica MC-30');
    expect(text).toContain('Norma Técnica de Edificaciones CE 010');
  });

  it('has defaultData with provider and client empty structs', () => {
    const { defaultData } = contratoServicioSchema;
    expect(defaultData.proveedor).toBeDefined();
    expect(defaultData.proveedor.razonSocial).toBe('');
    expect(defaultData.cliente).toBeDefined();
    expect(defaultData.cliente.razonSocial).toBe('');
    expect(defaultData.branding.backgroundImageUrl).toBe('');
  });

  it('keeps an editable pricing row before partidas exist', () => {
    expect(contratoServicioSchema.defaultData.preciosUnitarios).toHaveLength(1);
    expect(contratoServicioSchema.defaultData.sectoresPago).toHaveLength(1);
  });

  it('hydrates client fields and partida costs from the service', () => {
    const structuredData = structureDataForReportType('CONT-SRV', {
      service: {
        projectName: 'Rehabilitacion vial',
        partidas: [
          {
            itemCode: '01',
            description: 'Colocacion de asfalto',
            unit: 'm2',
            quantity: 25,
            unitPrice: 48.5,
            total: 1212.5,
          },
        ],
      },
      client: {
        name: 'Constructora Los Andes SAC',
        ruc: '20567891234',
        address: 'Av. Central 123',
      },
      orders: [],
      dispatches: [],
      certificates: [],
      invoices: [],
      payments: [],
      financeEntries: [],
      financeMedia: [],
      serviceMedia: [],
      orderMedia: [],
    });

    expect(structuredData.cliente).toEqual(
      expect.objectContaining({
        razonSocial: 'Constructora Los Andes SAC',
        ruc: '20567891234',
        domicilio: 'Av. Central 123',
      })
    );
    expect(structuredData.monto.total).toBe(1212.5);
    expect(structuredData.preciosUnitarios[0]).toEqual({
      detalle: 'Colocacion de asfalto',
      unidad: 'm2',
      costo: 48.5,
    });
    expect(structuredData.sectoresPago[0]).toEqual(
      expect.objectContaining({
        itemCode: '01',
        metrado: 25,
        parcial: 1212.5,
      })
    );
  });

  it('has default legal clause text in clausula1', () => {
    expect(typeof contratoServicioSchema.defaultData.clausula1).toBe('string');
    expect(contratoServicioSchema.defaultData.clausula1.length).toBeGreaterThan(10);
  });

  it('includes generic responsibility and arbitration provisions', () => {
    const responsibilities = String(contratoServicioSchema.defaultData.clausula7Responsabilidades);
    const arbitration = String(contratoServicioSchema.defaultData.clausula8Arbitraje);

    expect(responsibilities).toContain('temperatura mínima de 135 °C');
    expect(responsibilities).toContain('espesor de la carpeta asfáltica');
    expect(responsibilities).toContain('artículo 40 de la Ley');
    expect(arbitration).toContain('artículo 52 de la Ley');
    expect(arbitration).toContain('artículo 214 del Reglamento');
  });

  it('passes global schema validation', () => {
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('exports pdf and docx', () => {
    expect(contratoServicioSchema.exportOptions?.pdf).toBe(true);
    expect(contratoServicioSchema.exportOptions?.docx).toBe(true);
  });

  it('firmas section has cliente and proveedor signature blocks', () => {
    const firmasSection = contratoServicioSchema.sections.find((s) => s.id === 'firmas');
    expect(firmasSection).toBeDefined();
    const keys = (firmasSection?.signatures || []).map((s) => s.key);
    expect(keys).toContain('firmas.cliente');
    expect(keys).toContain('firmas.proveedor');
  });
});
