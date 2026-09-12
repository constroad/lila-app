jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { solicitudImprimacionSchema } from './solicitud-imprimacion.schema.js';
import { aprobacionAdicionalSchema } from './aprobacion-adicional.schema.js';
import { informeReclamoSchema } from './informe-reclamo.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';

const seccion = (id: string) =>
  solicitudImprimacionSchema.sections.find((section) => section.id === id);

const columna = (seccionId: string, key: string) =>
  (seccion(seccionId)?.columns || []).find((column) => column.key === key);

const campoComputado = (key: string) =>
  (solicitudImprimacionSchema.computedFields || []).find((field) => field.key === key);

/** El evaluador real vive en Portal; aca se prueba la REGLA de cada formula. */
const evaluar = (formula: string, contexto: Record<string, unknown>) => {
  const num = (value: unknown) => Number(value) || 0;
  const round = (value: number, decimals = 2) =>
    Math.round(value * 10 ** decimals) / 10 ** decimals;
  const claves = Object.keys(contexto);
  const valores = claves.map((clave) => contexto[clave]);
  // eslint-disable-next-line no-new-func
  return new Function('num', 'round', ...claves, `return (${formula});`)(num, round, ...valores);
};

/**
 * Los tipos de seccion que el canvas de Portal sabe pintar. Se repite a
 * proposito (el import cruzado entre repos rompe CI); este test avisa si el
 * schema se sale de la lista. Un tipo desconocido no da error: pinta un hueco.
 */
const TIPOS_QUE_PORTAL_PINTA = [
  'header',
  'projectData',
  'simpleFields',
  'dataTable',
  'checklist',
  'richText',
  'photoPanel',
  'photoSection',
  'signatures',
  'summary',
];

describe('solicitudImprimacionSchema (SOL-IMP)', () => {
  it('no usa ningun tipo de seccion que el canvas no sepa pintar', () => {
    const desconocidos = solicitudImprimacionSchema.sections
      .map((section) => section.type)
      .filter((tipo) => !TIPOS_QUE_PORTAL_PINTA.includes(tipo));

    expect(desconocidos).toEqual([]);
  });

  it('metadata y registro', () => {
    expect(solicitudImprimacionSchema.code).toBe('SOL-IMP');
    expect(getSchemaByCode('SOL-IMP')).toBe(solicitudImprimacionSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('LO FIRMA EL CLIENTE: sin esa firma el documento no existe', () => {
    // Es su unica razon de ser. CTL-IMP prueba la tasa y lo firma la empresa;
    // ninguno registra que el cambio de material lo pidio el cliente.
    const firmas = seccion('firmas')?.signatures || [];

    expect(firmas.map((firma) => firma.key)).toEqual(['solicitadoPor', 'recibidoPor']);
    expect(firmas[0].sublabel).toMatch(/cliente/i);
    expect(firmas[0].required).toBe(true);
  });

  it('NO trae los calculos de control: eso es de CTL-IMP', () => {
    // Dos papeles calculando el mismo riego terminan en desacuerdo. Aca se pide
    // el material; la tasa real se mide despues, en el control.
    const claves = JSON.stringify(solicitudImprimacionSchema.sections);

    expect(claves).not.toMatch(/bandeja/i);
    expect(claves).not.toMatch(/pesoEspecifico/i);
    expect(claves).not.toMatch(/volumenCorregido/i);
  });

  it('la tasa solicitada va en lt/m2 y queda editable, sin rango', () => {
    // Juzgarla contra el rango del riego de liga (0.2-0.7) la marcaria fuera de
    // rango por un criterio que no es el suyo: aca todavia no se rego nada.
    const tasa = (seccion('solicitud')?.fields || []).find(
      (field) => field.key === 'solicitud.tasaSolicitada'
    );

    expect(tasa?.label).toContain('lt/m2');
    expect(tasa?.validation).toBeUndefined();
  });

  it('deja escrito que la emulsion REEMPLAZA al material del proyecto', () => {
    const reemplaza = (seccion('solicitud')?.fields || []).find(
      (field) => field.key === 'solicitud.reemplaza'
    );

    expect(reemplaza?.defaultValue).toBe('MC-30');
  });

  describe('area de la zona', () => {
    const formula = () => String(columna('zonas', 'area')?.formula);

    it('es largo por ancho', () => {
      expect(evaluar(formula(), { row: { largo: 12.5, ancho: 3.2 } })).toBe(40);
    });

    it('sin ancho queda VACIA, no en cero', () => {
      // Un 0 en la columna de area se lee como zona sin area, no como zona sin
      // medir. La fila recien sembrada tiene que quedar en blanco.
      expect(evaluar(formula(), { row: { largo: 12.5 } })).toBe('');
      expect(evaluar(formula(), { row: {} })).toBe('');
    });

    it('no se puede tipear encima', () => {
      expect(columna('zonas', 'area')?.computed).toBe(true);
      expect(columna('zonas', 'area')?.editable).toBeFalsy();
    });
  });

  describe('resumen de lo solicitado', () => {
    const zonas = [
      { largo: 12.5, ancho: 3.2 },
      { largo: 0, ancho: 0 },
      // Fila medida sobre foto: trae area y no trae largo ni ancho.
      { area: 25 },
    ];

    it('no cuenta las filas en blanco', () => {
      expect(evaluar(String(campoComputado('resumen.zonas')?.formula), { data: { zonas } })).toBe(2);
    });

    it('suma el area, y respeta la zona que ya viene medida', () => {
      expect(
        evaluar(String(campoComputado('resumen.areaTotal')?.formula), { data: { zonas } })
      ).toBe(65);
    });

    it('sin tasa NO estima material: un "0 lt" al lado de 65 m2 miente', () => {
      const formula = String(campoComputado('resumen.emulsionEstimada')?.formula);

      expect(evaluar(formula, { data: { zonas, resumen: { areaTotal: 65 }, solicitud: {} } })).toBe('');
    });

    it('con tasa, estima area por tasa', () => {
      const formula = String(campoComputado('resumen.emulsionEstimada')?.formula);
      const data = { zonas, resumen: { areaTotal: 65 }, solicitud: { tasaSolicitada: 1.2 } };

      expect(evaluar(formula, { data })).toBe(78);
    });

    it('el area se calcula ANTES que la estimacion, que la usa', () => {
      // `applyComputedFields` corre en orden y va acumulando: invertirlos daria
      // siempre cero litros sobre un documento recien abierto.
      const claves = (solicitudImprimacionSchema.computedFields || []).map((field) => field.key);

      expect(claves.indexOf('resumen.areaTotal')).toBeLessThan(
        claves.indexOf('resumen.emulsionEstimada')
      );
    });
  });
});

describe('aprobacionAdicionalSchema (APR-ADI)', () => {
  const seccionApr = (id: string) =>
    aprobacionAdicionalSchema.sections.find((section) => section.id === id);

  it('no usa ningun tipo de seccion que el canvas no sepa pintar', () => {
    const desconocidos = aprobacionAdicionalSchema.sections
      .map((section) => section.type)
      .filter((tipo) => !TIPOS_QUE_PORTAL_PINTA.includes(tipo));

    expect(desconocidos).toEqual([]);
  });

  it('metadata y registro', () => {
    expect(aprobacionAdicionalSchema.code).toBe('APR-ADI');
    expect(getSchemaByCode('APR-ADI')).toBe(aprobacionAdicionalSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('NO repite el cuadro contratado vs ejecutado de REC-EXC', () => {
    // Es el solapamiento que se decidio evitar (Jose, 10/09/2026): REC-EXC ya
    // trae metradoContrato/metradoEjecutado/excedente. Dos papeles con el mismo
    // metrado tipeado dos veces terminan diciendo numeros distintos.
    const reclamo = (
      informeReclamoSchema.sections.find((section) => section.id === 'metradoReclamo')?.columns || []
    ).map((column) => column.key);
    expect(reclamo).toEqual(expect.arrayContaining(['metradoContrato', 'metradoEjecutado', 'excedente']));

    // Se miran las CLAVES, no el texto: "REC-EXC - Informe tecnico reclamo
    // excedente" es el rotulo del documento que se referencia, y esa mencion es
    // justamente lo que este acta si debe tener.
    const claves = aprobacionAdicionalSchema.sections.flatMap((section) => [
      ...(section.fields || []).map((field) => field.key),
      ...(section.columns || []).map((column) => column.key),
    ]);

    expect(claves).not.toContain('metradoContrato');
    expect(claves).not.toContain('metradoEjecutado');
    expect(claves.filter((clave) => /excedente/i.test(clave))).toEqual([]);
  });

  it('REFERENCIA el sustento: tipo, numero y fecha', () => {
    const campos = (seccionApr('sustento')?.fields || []).map((field) => field.key);

    expect(campos).toEqual(expect.arrayContaining([
      'sustento.tipo',
      'sustento.numero',
      'sustento.fecha',
    ]));
  });

  it('el selector de sustento ofrece los documentos que de verdad existen', () => {
    const tipo = (seccionApr('sustento')?.fields || []).find((field) => field.key === 'sustento.tipo');
    const codigos = (tipo?.options || []).map((option) => option.value).filter((value) => value !== 'OTRO');

    codigos.forEach((codigo) => expect(getSchemaByCode(codigo)).toBeDefined());
  });

  it('LO FIRMA EL CLIENTE: es lo unico que no existe en otro papel', () => {
    const firmas = seccionApr('firmas')?.signatures || [];

    expect(firmas.map((firma) => firma.key)).toEqual(['presentadoPor', 'aprobadoPor']);
    expect(firmas[1].sublabel).toMatch(/cliente/i);
    expect(firmas[1].required).toBe(true);
  });

  it('el detalle por partida se OCULTA vacio: el caso normal es una sola cifra', () => {
    expect(seccionApr('detalle')?.hideWhenEmpty).toBe(true);
    expect(seccionApr('detalle')?.minRows).toBe(0);
    expect(aprobacionAdicionalSchema.defaultData.detalle).toEqual([]);
  });

  describe('monto aprobado', () => {
    const formula = () =>
      String(
        (aprobacionAdicionalSchema.computedFields || []).find(
          (field) => field.key === 'adicional.montoAprobado'
        )?.formula
      );

    it('sin detalle, es cantidad por precio unitario', () => {
      const data = { detalle: [], adicional: { cantidad: 18.5, precioUnitario: 420 } };

      expect(evaluar(formula(), { data })).toBe(7770);
    });

    it('con detalle, MANDA el detalle', () => {
      const data = {
        detalle: [
          { cantidad: 10, precioUnitario: 420 },
          { cantidad: 5, precioUnitario: 100 },
        ],
        adicional: { cantidad: 18.5, precioUnitario: 420 },
      };

      expect(evaluar(formula(), { data })).toBe(4700);
    });

    it('un detalle con filas en blanco no borra la cifra de arriba', () => {
      // `minRows: 0` no impide que el canvas deje una fila vacia al agregar y
      // arrepentirse: si esa fila mandara, el monto caeria a cero solo.
      const data = {
        detalle: [{ descripcion: '', cantidad: 0, precioUnitario: 0 }],
        adicional: { cantidad: 18.5, precioUnitario: 420 },
      };

      expect(evaluar(formula(), { data })).toBe(7770);
    });

    it('sobre un documento recien abierto da 0, no revienta', () => {
      expect(evaluar(formula(), { data: {} })).toBe(0);
    });
  });

  it('el importe de la fila queda VACIO hasta tener cantidad y precio', () => {
    const importe = (seccionApr('detalle')?.columns || []).find((column) => column.key === 'importe');
    const evaluarFila = (row: Record<string, unknown>) =>
      evaluar(String(importe?.formula), { row });

    expect(evaluarFila({ cantidad: 10, precioUnitario: 420 })).toBe(4200);
    expect(evaluarFila({ cantidad: 10 })).toBe('');
    expect(importe?.computed).toBe(true);
  });
});
