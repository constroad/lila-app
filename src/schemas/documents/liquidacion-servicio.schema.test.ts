import { liquidacionServicioSchema } from './liquidacion-servicio.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';

describe('liquidacionServicioSchema', () => {
  it('has correct metadata', () => {
    expect(liquidacionServicioSchema.code).toBe('LIQ-SRV');
    expect(liquidacionServicioSchema.id).toBe('liquidacion-servicio');
    expect(liquidacionServicioSchema.category).toBe('Financial');
    expect(liquidacionServicioSchema.orientation).toBe('portrait');
    expect(liquidacionServicioSchema.pageSize).toBe('A4');
  });

  it('registers in the schema registry', () => {
    expect(getSchemaByCode('LIQ-SRV')).toBe(liquidacionServicioSchema);
  });

  it('has no duplicate section ids', () => {
    const ids = liquidacionServicioSchema.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has required liquidation sections', () => {
    const ids = liquidacionServicioSchema.sections.map((section) => section.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'header',
        'datosGenerales',
        'cotizacionInicial',
        'pagos',
        'montoEjecutado',
        'saldo',
        'vouchers',
        'observaciones',
        'firmas',
      ])
    );
  });

  it('has editable executed amount columns', () => {
    const section = liquidacionServicioSchema.sections.find(
      (candidate) => candidate.id === 'montoEjecutado'
    );
    const keys = (section?.columns || []).map((column) => column.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'descripcion',
        'metrado',
        'precioUnitario',
        'parcial',
      ])
    );
  });

  it('has default empty optional sections', () => {
    expect(liquidacionServicioSchema.defaultData.observaciones).toBe('');
    expect(liquidacionServicioSchema.defaultData.firmas).toEqual({});
    expect(liquidacionServicioSchema.defaultData.vouchers).toEqual({ fotos: [] });
  });

  it('passes global schema validation', () => {
    expect(() => validateAllSchemas()).not.toThrow();
  });
});
