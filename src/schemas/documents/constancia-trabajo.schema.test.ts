jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { constanciaTrabajoSchema } from './constancia-trabajo.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';

const seccion = (id: string) => constanciaTrabajoSchema.sections.find((s) => s.id === id);
const columna = (key: string) => (seccion('periodos')?.columns || []).find((c) => c.key === key);
const computado = (key: string) =>
  (constanciaTrabajoSchema.computedFields || []).find((f) => f.key === key);

describe('constanciaTrabajoSchema (CONS-TRA)', () => {
  it('metadata y registro', () => {
    expect(constanciaTrabajoSchema.code).toBe('CONS-TRA');
    expect(getSchemaByCode('CONS-TRA')).toBe(constanciaTrabajoSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('tiene las secciones del documento, en orden de carta', () => {
    const ids = constanciaTrabajoSchema.sections.map((s) => s.id);
    expect(ids).toEqual([
      'header',
      'titulo',
      'cuerpo',
      'periodos',
      'cierre',
      'firmas',
      'pie',
    ]);
  });

  describe('se lee como una constancia, no como un informe', () => {
    it('el membrete usa la variante de CARTA: logo grande, sin caja de folio', () => {
      const header = seccion('header');
      expect((header as any)?.headerConfig?.variant).toBe('certificate');
      // Un panel de CODIGO/VERSION/FOLIO a la derecha es chrome de registro
      // interno; es lo que hacia que el documento pareciera un informe.
      expect((header as any)?.headerConfig?.rightFields).toBeUndefined();
    });

    it('lleva un TITULO visible, sembrado donde el renderer lo busca', () => {
      expect(seccion('titulo')?.type).toBe('heading');
      // El heading lee `data[section.id]`, no `section.title`: sin la semilla
      // el documento salia con el placeholder gris "ENCABEZADO".
      expect((constanciaTrabajoSchema.defaultData as any)?.titulo).toBe('CONSTANCIA DE TRABAJO');
    });

    it('lugar y fecha van en el encabezado de la carta, no en una tabla', () => {
      const cfg = (seccion('header') as any)?.headerConfig;
      expect(cfg?.placeKey).toBe('header.lugar');
      expect(cfg?.dateKey).toBe('header.fecha');
    });

    it('NO hay tablas de datos: solo la de cargos', () => {
      // Una constancia se lee corrida. Los cuadros "CONSTANCIA N / LUGAR /
      // FECHA" y "Datos del Trabajador" eran formato de registro interno.
      const tablas = constanciaTrabajoSchema.sections.filter(
        (x) => x.type === 'dataTable' || x.type === 'simpleFields'
      );
      expect(tablas.map((x) => x.id)).toEqual(['periodos']);
    });

    it('la identidad se redacta en el cuerpo', () => {
      expect(seccion('cuerpo')?.type).toBe('richText');
      const ids = constanciaTrabajoSchema.sections.map((s) => s.id);
      expect(ids.indexOf('cuerpo')).toBeLessThan(ids.indexOf('periodos'));
    });
  });

  describe('el empleado se escribe a mano', () => {
    it('nombre y documento son campos editables, no derivados', () => {
      // El legajo NO tiene fecha de ingreso ni historial de cargos, así que la
      // constancia no puede sembrarlos. Se tipean, y por eso deben ser
      // editables: un campo computado sin fuente sale siempre vacío.
      const campos = seccion('empleado')?.fields || [];
      const nombre = campos.find((f) => f.key === 'empleado.nombre');
      const documento = campos.find((f) => f.key === 'empleado.documento');
      expect(nombre?.editable).not.toBe(false);
      expect(documento?.editable).not.toBe(false);
      expect(campos.some((f) => f.type === 'computed')).toBe(false);
    });
  });

  describe('periodos: una fila por cargo', () => {
    it('desde, hasta y puesto se tipean', () => {
      expect(columna('desde')?.type).toBe('date');
      expect(columna('hasta')?.type).toBe('date');
      expect(columna('puesto')?.type).toBe('text');
      expect(columna('puesto')?.editable).toBe(true);
    });

    it('`hasta` NO es obligatorio: un empleado activo no tiene salida', () => {
      expect(columna('hasta')?.required).toBeFalsy();
    });

    it('el tiempo se calcula solo PERO se puede corregir', () => {
      // El calculo en meses es correcto; quien firma a veces necesita decir
      // "27 dias". `computed` a secas dejaria la celda de solo lectura.
      const tiempo = columna('tiempo');
      expect(tiempo?.computed).toBe(true);
      expect(tiempo?.editableComputed).toBe(true);
      expect(tiempo?.computedHint).toContain('escribir encima');
    });

    it('cuenta meses de CALENDARIO, no milisegundos entre fechas', () => {
      // Dividir por un "mes promedio" daba 11 meses para exactamente un anio.
      // En una constancia de trabajo ese redondeo perjudica a la persona. Y de
      // paso: recortar el string no construye Date, asi que no hay zona horaria.
      const formula = String(columna('tiempo')?.formula || '');
      expect(formula).toContain('slice(0, 4)');
      expect(formula).toContain('slice(5, 7)');
      expect(formula).not.toContain('Date.parse');
      expect(formula).not.toMatch(/\/ \d{9,}/);
    });

    it('el periodo abierto se mide contra la fecha del DOCUMENTO, no contra hoy', () => {
      // Un documento firmado no puede cambiar de números al reimprimirse.
      // Misma regla que el atraso de LEV-OBS.
      const formula = String(columna('tiempo')?.formula || '');
      expect(formula).toContain('header');
      expect(formula).toContain('fecha');
      expect(formula).not.toContain('Date.now');
      expect(formula).not.toContain('new Date()');
    });
  });

  describe('resumen derivado', () => {
    it('declara inicio, fin y tiempo total', () => {
      expect(computado('resumen.desde')).toBeTruthy();
      expect(computado('resumen.hasta')).toBeTruthy();
      expect(computado('resumen.tiempoTotal')).toBeTruthy();
    });

    it('ningun computado se ancla a la fecha de ejecucion', () => {
      for (const campo of constanciaTrabajoSchema.computedFields || []) {
        expect(String(campo.formula)).not.toContain('Date.now');
        expect(String(campo.formula)).not.toContain('new Date()');
      }
    });
  });

  describe('textos y firmas predefinidos', () => {
    it('el cierre nace con texto por defecto', () => {
      const texto = String((constanciaTrabajoSchema.defaultData as any)?.cierre || '');
      expect(texto.length).toBeGreaterThan(40);
    });

    it('trae un bloque de firma del representante', () => {
      expect((seccion('firmas') as any)?.signatures?.length).toBeGreaterThan(0);
    });

    it('el defaultData cubre las claves que el documento pinta', () => {
      const data = constanciaTrabajoSchema.defaultData as any;
      expect(data.header).toBeTruthy();
      expect(data.empleado).toBeTruthy();
      expect(Array.isArray(data.periodos)).toBe(true);
      expect(data.resumen).toBeTruthy();
    });
  });
});
