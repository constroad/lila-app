import { contratoServicioSchema } from './contrato-servicio.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';

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
  });

  it('has defaultData with provider and client empty structs', () => {
    const { defaultData } = contratoServicioSchema;
    expect(defaultData.proveedor).toBeDefined();
    expect(defaultData.proveedor.razonSocial).toBe('');
    expect(defaultData.cliente).toBeDefined();
    expect(defaultData.cliente.razonSocial).toBe('');
    expect(defaultData.branding.backgroundImageUrl).toBe('');
  });

  it('has default legal clause text in clausula1', () => {
    expect(typeof contratoServicioSchema.defaultData.clausula1).toBe('string');
    expect(contratoServicioSchema.defaultData.clausula1.length).toBeGreaterThan(10);
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
