jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { informeReclamoSchema } from './informe-reclamo.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';
import { structureDataForReportType } from '../../services/report-data-aggregator.service.js';

const tabla = () =>
  informeReclamoSchema.sections.find((section) => section.id === 'metradoReclamo');

const columna = (key: string) => (tabla()?.columns || []).find((column) => column.key === key);

const aggregate = () =>
  structureDataForReportType('REC-EXC', {
    service: {
      projectName: 'Rehabilitacion vial',
      partidas: [
        { itemCode: '01', description: 'Carpeta asfaltica', unit: 'm2', quantity: 16850, unitPrice: 48.5, total: 817225 },
        { itemCode: '02', description: 'Imprimacion', unit: 'm2', quantity: 16850, unitPrice: 3.2, total: 53920 },
      ],
    },
    client: { name: 'Consorcio Vial' },
    orders: [], dispatches: [], certificates: [], invoices: [], payments: [],
    financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [], reports: [],
  } as never);

const aggregateConIaa = (reports: unknown[]) =>
  structureDataForReportType('REC-EXC', {
    service: {
      projectName: 'Rehabilitacion vial',
      partidas: [
        { itemCode: '01', description: 'Carpeta asfaltica', unit: 'm2', quantity: 16850, unitPrice: 48.5, total: 817225 },
      ],
    },
    client: { name: 'Consorcio Vial' },
    orders: [], dispatches: [], certificates: [], invoices: [], payments: [],
    financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [], reports,
  } as never);

describe('informeReclamoSchema', () => {
  it('metadata y registro', () => {
    expect(informeReclamoSchema.code).toBe('REC-EXC');
    expect(getSchemaByCode('REC-EXC')).toBe(informeReclamoSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('EXCEDENTE es derivado (ejecutado - contrato), no se tipea', () => {
    const excedente = columna('excedente');

    // Sin `computed: true` la formula es inerte EN SILENCIO: la celda se queda
    // con lo guardado y el reclamo puede contradecir a sus dos columnas vecinas.
    expect(excedente?.computed).toBe(true);
    expect(excedente?.formula).toContain('num(row.metradoEjecutado)');
    expect(excedente?.formula).toContain('num(row.metradoContrato)');
    expect(excedente?.editable).toBeFalsy();
  });

  it('IMPORTE es derivado y se computa DESPUES del excedente', () => {
    const columnas = (tabla()?.columns || []).map((column) => column.key);
    const importe = columna('importe');

    expect(importe?.computed).toBe(true);
    expect(importe?.formula).toContain('num(row.excedente)');
    // El motor computa en el ORDEN de las columnas: si `importe` fuera primero,
    // leeria el excedente de la pasada anterior.
    expect(columnas.indexOf('excedente')).toBeLessThan(columnas.indexOf('importe'));
  });

  it('el monto reclamado NO suma una columna computada', () => {
    const monto = (informeReclamoSchema.computedFields || []).find(
      (field) => field.key === 'resumen.montoReclamado'
    );

    // `importe` se persiste solo si alguien edita la tabla en el canvas. Un
    // `sum(metradoReclamo, 'importe')` daria cero sobre el cuadro que siembra el
    // agregador. El total se deriva de los datos crudos que el usuario si tipea.
    expect(monto?.formula).not.toContain("'importe'");
    expect(monto?.formula).toContain('metradoEjecutado');
    expect(monto?.formula).toContain('precioUnitario');
  });

  it('no suma metrados de distinta unidad en un solo total', () => {
    const claves = (informeReclamoSchema.computedFields || []).map((field) => field.key);
    // m2 + m3 + und en una celda es un numero sin significado.
    expect(claves).not.toContain('resumen.totalExcedente');
    expect(claves).toContain('resumen.partidasAfectadas');
  });

  it('las formulas coinciden LITERALMENTE con las probadas en Portal', () => {
    // El comportamiento (vacio vs negativo, deficit que no descuenta) se prueba
    // contra el evaluador REAL en `Portal/src/components/documents/
    // reclamoExcedenteFormula.test.ts`. Si el texto se separa, esa prueba deja
    // de probar lo que este schema ejecuta.
    expect(columna('excedente')?.formula).toBe(
      "num(row.metradoEjecutado) ? round(num(row.metradoEjecutado) - num(row.metradoContrato), 2) : ''"
    );
    expect(columna('importe')?.formula).toBe(
      "num(row.excedente) > 0 ? round(num(row.excedente) * num(row.precioUnitario), 2) : ''"
    );
    expect((informeReclamoSchema.computedFields || [])[0].formula).toBe(
      "round((data.metradoReclamo || []).reduce((total, fila) => total + Math.max(0, num(fila.metradoEjecutado) ? num(fila.metradoEjecutado) - num(fila.metradoContrato) : 0) * num(fila.precioUnitario), 0), 2)"
    );
    expect((informeReclamoSchema.computedFields || [])[1].formula).toBe(
      '(data.metradoReclamo || []).filter((fila) => num(fila.metradoEjecutado) > num(fila.metradoContrato)).length'
    );
  });

  it('el agregador siembra el cuadro desde las partidas del servicio', () => {
    const data = aggregate();

    expect(data.metradoReclamo).toHaveLength(2);
    expect(data.metradoReclamo[0]).toMatchObject({
      item: '01',
      descripcion: 'Carpeta asfaltica',
      unidad: 'm2',
      metradoContrato: 16850,
      precioUnitario: 48.5,
    });
    expect(data.proyecto.obra).toBe('Rehabilitacion vial');
  });

  it('el metrado EJECUTADO nace vacio: no lo sabemos', () => {
    // Sembrarlo igual al contrato haria que el reclamo naciera diciendo
    // "excedente cero" como si fuera un dato verificado.
    expect(aggregate().metradoReclamo[0].metradoEjecutado).toBe(0);
  });

  it('la fecha del reclamo nace hoy, en fecha-solo de Lima', () => {
    expect(aggregate().reclamo.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('cita los informes de AREA ADICIONAL del servicio como sustento', () => {
    // IAA y REC-EXC no son el mismo informe, pero estaban desconectados: el area
    // ya medida con foto se volvia a tipear.
    const data = aggregateConIaa([
      {
        type: 'IAA',
        date: '2026-07-18T15:00:00.000Z',
        schemaData: { cuadroMetrado: [{ area: 120.5 }, { area: 80 }] },
      },
      { type: 'CTL-PIS', date: '2026-07-19T15:00:00.000Z', schemaData: {} },
    ]);

    expect(data.sustento).toContain('area adicional');
    expect(data.sustento).toContain('2026-07-18');
    expect(data.sustento).toContain('2 zona');
    expect(data.sustento).toContain('200.50');
  });

  it('NO siembra el metrado ejecutado desde IAA: seria adivinar', () => {
    // IAA mide por ZONA y el reclamo va por PARTIDA. Mapearlos automaticamente
    // pondria un numero inventado en un documento de cobro.
    const data = aggregateConIaa([
      { type: 'IAA', date: '2026-07-18T15:00:00.000Z', schemaData: { cuadroMetrado: [{ area: 120.5 }] } },
    ]);
    expect(data.metradoReclamo.every((fila: any) => Number(fila.metradoEjecutado) === 0)).toBe(true);
  });

  it('sin informes de area adicional no inventa un sustento', () => {
    expect(aggregateConIaa([]).sustento).toBeUndefined();
    expect(aggregate().sustento).toBeUndefined();
  });

  it('sin partidas NO inventa filas (solo datos del proyecto)', () => {
    const data = structureDataForReportType('REC-EXC', {
      service: { projectName: 'Obra sin partidas' },
      client: null, orders: [], dispatches: [], certificates: [], invoices: [],
      payments: [], financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [],
    } as never);

    expect(data.metradoReclamo).toBeUndefined();
    expect(data.proyecto.obra).toBe('Obra sin partidas');
  });
});
