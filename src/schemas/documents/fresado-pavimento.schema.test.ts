jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import {
  FRESADO_IRI_MAXIMOS,
  FRESADO_TOLERANCIA_COTA_MM,
  fresadoPavimentoSchema,
} from './fresado-pavimento.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';

const seccion = (id: string) =>
  fresadoPavimentoSchema.sections.find((section) => section.id === id);

const columna = (seccionId: string, key: string) =>
  (seccion(seccionId)?.columns || []).find((column) => column.key === key);

const campoComputado = (key: string) =>
  (fresadoPavimentoSchema.computedFields || []).find((field) => field.key === key);

/** El evaluador real vive en Portal; acá se prueba la REGLA de cada fórmula. */
const evaluar = (formula: string, contexto: Record<string, unknown>) => {
  const num = (value: unknown) => Number(value) || 0;
  const round = (value: number, decimals = 2) =>
    Math.round(value * 10 ** decimals) / 10 ** decimals;
  const claves = Object.keys(contexto);
  const valores = claves.map((clave) => contexto[clave]);
  // eslint-disable-next-line no-new-func
  return new Function('num', 'round', ...claves, `return (${formula});`)(num, round, ...valores);
};

describe('fresadoPavimentoSchema', () => {
  it('metadata y registro', () => {
    expect(fresadoPavimentoSchema.code).toBe('FRE-PAV');
    expect(getSchemaByCode('FRE-PAV')).toBe(fresadoPavimentoSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('cita la norma que lo rige', () => {
    expect((fresadoPavimentoSchema.normativeReference || []).join(' ')).toContain('435');
  });

  describe('area: metro cuadrado al entero (435.09)', () => {
    const formula = () => String(columna('tramos', 'areaM2')?.formula);

    it('es largo por ancho', () => {
      expect(evaluar(formula(), { row: { progInicial: 0, progFinal: 120, anchoM: 3.5 } })).toBe(420);
    });

    it('APROXIMA AL ENTERO, que es la unidad de medida de la norma', () => {
      // 100,4 m2 se paga como 100: dejarlo con decimales seria mas "preciso" y
      // no seria lo que dice 435.09.
      expect(evaluar(formula(), { row: { progInicial: 0, progFinal: 28.7, anchoM: 3.5 } })).toBe(100);
    });

    it('un tramo invertido no resta area', () => {
      expect(evaluar(formula(), { row: { progInicial: 120, progFinal: 0, anchoM: 3.5 } })).toBe(0);
    });

    it('sin ancho todavía no hay área', () => {
      expect(evaluar(formula(), { row: { progInicial: 0, progFinal: 120 } })).toBe(0);
    });
  });

  describe('volumen retirado (no es unidad de pago)', () => {
    const formula = () => String(columna('tramos', 'volumenM3')?.formula);

    it('es el area por el espesor MEDIDO, en m3', () => {
      // 420 m2 x 5 cm = 21 m3.
      expect(
        evaluar(formula(), {
          row: { progInicial: 0, progFinal: 120, anchoM: 3.5, espesorMedidoCm: 5 },
        })
      ).toBe(21);
    });

    it('sin espesor medido no inventa volumen', () => {
      expect(
        evaluar(formula(), { row: { progInicial: 0, progFinal: 120, anchoM: 3.5 } })
      ).toBe(0);
    });
  });

  describe('control de cotas: la tolerancia es la de 435.08 b.1', () => {
    const desviacion = () => String(columna('controlCotas', 'desviacionMm')?.formula);
    const conforme = () => String(columna('controlCotas', 'conforme')?.formula);

    it('la tolerancia declarada es 5 mm', () => {
      expect(FRESADO_TOLERANCIA_COTA_MM).toBe(5);
      expect(conforme()).toContain('5');
    });

    it('la desviación se expresa en milímetros', () => {
      expect(evaluar(desviacion(), { row: { cotaProyecto: 100.0, cotaResultante: 100.004 } })).toBe(4);
    });

    it('4 mm es conforme y 6 mm no', () => {
      expect(evaluar(conforme(), { row: { cotaProyecto: 100, cotaResultante: 100.004 } })).toBe(
        'CONFORME'
      );
      expect(evaluar(conforme(), { row: { cotaProyecto: 100, cotaResultante: 100.006 } })).toBe(
        'NO CONFORME'
      );
    });

    it('la tolerancia es en LOS DOS sentidos: 5 mm por debajo también pasa', () => {
      expect(evaluar(conforme(), { row: { cotaProyecto: 100, cotaResultante: 99.995 } })).toBe(
        'CONFORME'
      );
    });

    it('sin medición no dice nada: un CONFORME vacío es peor que el silencio', () => {
      expect(evaluar(conforme(), { row: {} })).toBe('');
      expect(evaluar(conforme(), { row: { cotaProyecto: 100 } })).toBe('');
    });

    it('la conformidad NO se puede tipear', () => {
      expect(columna('controlCotas', 'conforme')?.computed).toBe(true);
      expect(columna('controlCotas', 'conforme')?.editable).toBeFalsy();
    });
  });

  describe('rugosidad: Tabla 435-01', () => {
    it('los máximos son 1,9 / 2,5 / 3,0', () => {
      expect(FRESADO_IRI_MAXIMOS.map((fila) => fila.iri)).toEqual([1.9, 2.5, 3.0]);
    });

    it('ubica cada medición en su umbral', () => {
      const formula = String(columna('rugosidad', 'dentroDe')?.formula);

      expect(evaluar(formula, { row: { iri: 1.8 } })).toBe('<= 1,9');
      expect(evaluar(formula, { row: { iri: 2.4 } })).toBe('<= 2,5');
      expect(evaluar(formula, { row: { iri: 3 } })).toBe('<= 3,0');
      expect(evaluar(formula, { row: { iri: 3.4 } })).toBe('EXCEDE');
    });

    it('es OPCIONAL: solo aplica si encima va una capa nueva', () => {
      expect(seccion('rugosidad')?.minRows).toBe(0);
      expect(String(seccion('rugosidad')?.subtitle)).toMatch(/carpeta|tratamiento/i);
    });
  });

  describe('resumen de la jornada', () => {
    const tramos = [
      { calle: 'Av. El Sol', progInicial: 0, progFinal: 120, anchoM: 3.5, espesorMedidoCm: 5 },
      { calle: '', progInicial: 0, progFinal: 0, anchoM: 0 },
    ];

    it('no cuenta las filas en blanco', () => {
      expect(evaluar(String(campoComputado('resumen.tramos')?.formula), { data: { tramos } })).toBe(1);
    });

    it('suma el área de la jornada', () => {
      expect(evaluar(String(campoComputado('resumen.areaM2')?.formula), { data: { tramos } })).toBe(
        420
      );
    });

    it('el rendimiento sale del HORÓMETRO, no de la jornada', () => {
      const formula = String(campoComputado('resumen.rendimientoM2Hora')?.formula);

      expect(
        evaluar(formula, {
          data: { resumen: { areaM2: 420 }, equipo: { horometroInicio: 10, horometroFin: 14 } },
        })
      ).toBe(105);
    });

    it('sin horómetro no divide por cero', () => {
      const formula = String(campoComputado('resumen.rendimientoM2Hora')?.formula);

      expect(evaluar(formula, { data: { resumen: { areaM2: 420 }, equipo: {} } })).toBe(0);
    });
  });

  describe('lo que el informe no puede perder', () => {
    it('la fila es el TRAMO: lleva progresivas, no solo la calle', () => {
      // La misma calle puede fresarse en dos tramos separados el mismo día.
      expect(columna('tramos', 'progInicial')).toBeDefined();
      expect(columna('tramos', 'progFinal')).toBeDefined();
    });

    it('el destino del material es una COLUMNA: el RAP es del contratante (435.05)', () => {
      expect(columna('materialRetirado', 'destino')?.editable).toBe(true);
      expect(String(seccion('materialRetirado')?.subtitle)).toMatch(/propiedad/i);
    });

    it('el mapa del área fresada tiene su propia sección', () => {
      expect(seccion('mapaArea')?.type).toBe('photoSection');
      expect((seccion('mapaArea')?.categories || []).map((categoria) => categoria.key)).toEqual([
        'MAPA',
      ]);
    });

    it('las fotos se agrupan en antes / durante / después', () => {
      expect((seccion('evidencias')?.categories || []).map((categoria) => categoria.key)).toEqual([
        'ANTES',
        'DURANTE',
        'DESPUES',
      ]);
    });

    it('el checklist de cierre exige lo que la norma exige', () => {
      const claves = (seccion('superficieResultante')?.items || []).map((item) => item.key);

      expect(claves).toEqual(
        expect.arrayContaining(['bordesTratados', 'limpieza', 'estructurasProtegidas', 'senalizacion'])
      );
    });
  });
});
