import { dossierObraSchema } from './dossier-obra.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';

describe('dossierObraSchema', () => {
  const ids = dossierObraSchema.sections.map((section) => section.id);

  it('metadata y registro', () => {
    expect(dossierObraSchema.code).toBe('DOS-OBR');
    expect(getSchemaByCode('DOS-OBR')).toBe(dossierObraSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('no duplica ids de seccion', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('D4 — vigencias', () => {
    it('la seccion de certificados pide el VENCIMIENTO y esta gated', () => {
      const section = dossierObraSchema.sections.find((entry) => entry.id === 'certificados');
      const keys = (section?.columns || []).map((column) => column.key);

      expect(keys).toEqual(['documento', 'emisor', 'numero', 'emision', 'vencimiento']);
      expect(section?.showIf).toEqual({ field: 'opciones.certificados', operator: 'eq', value: true });
    });
  });

  describe('D5 — bloques faltantes', () => {
    const NUEVAS = ['planosAsBuilt', 'garantias', 'subcontratistas', 'cierreSsoma'];

    it('las 4 secciones existen y van ANTES del panel fotografico', () => {
      const panel = ids.indexOf('registroFotografico');
      NUEVAS.forEach((id) => {
        expect(ids).toContain(id);
        expect(ids.indexOf(id)).toBeLessThan(panel);
      });
    });

    it('cada una esta gated por su flag (dossiers viejos intactos)', () => {
      NUEVAS.forEach((id) => {
        const section = dossierObraSchema.sections.find((entry) => entry.id === id);
        expect(section?.showIf?.field).toMatch(/^opciones\./);
        expect(section?.showIf?.value).toBe(true);
      });
    });

    it('los flags nacen encendidos en los dossiers NUEVOS', () => {
      expect(dossierObraSchema.defaultData.opciones).toEqual({
        certificados: true,
        planos: true,
        garantias: true,
        subcontratistas: true,
        ssoma: true,
      });
    });

    it('las garantias comparten el shape de vigencia con los certificados', () => {
      // Asi el semaforo de D4 las cubre sin codigo nuevo: mismo `vencimiento`.
      const garantias = dossierObraSchema.sections.find((entry) => entry.id === 'garantias');
      const keys = (garantias?.columns || []).map((column) => column.key);

      expect(keys).toContain('documento');
      expect(keys).toContain('emisor');
      expect(keys).toContain('vencimiento');
    });

    it('los as-built piden VERSION: un plano sin version no sirve de as-built', () => {
      const planos = dossierObraSchema.sections.find((entry) => entry.id === 'planosAsBuilt');
      expect((planos?.columns || []).map((column) => column.key)).toContain('version');
    });

    it('el cierre de SSOMA tiene estado tasado', () => {
      const ssoma = dossierObraSchema.sections.find((entry) => entry.id === 'cierreSsoma');
      const estado = (ssoma?.columns || []).find((column) => column.key === 'estado');
      expect((estado?.options || []).map((option) => option.value)).toEqual([
        'CERRADO',
        'PENDIENTE',
        'NO_APLICA',
      ]);
    });
  });
});
