jest.mock('../../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

import { levantamientoObsSchema } from './levantamiento-obs.schema.js';
import { getSchemaByCode, validateAllSchemas } from './registry.js';
import { structureDataForReportType } from '../../services/report-data-aggregator.service.js';

const tabla = () =>
  levantamientoObsSchema.sections.find((section) => section.id === 'observaciones');

const columna = (key: string) => (tabla()?.columns || []).find((column) => column.key === key);

const campoComputado = (key: string) =>
  (levantamientoObsSchema.computedFields || []).find((field) => field.key === key);

const aggregate = () =>
  structureDataForReportType('LEV-OBS', {
    service: { projectName: 'Rehabilitacion vial' },
    client: { name: 'Consorcio Vial' },
    orders: [], dispatches: [], certificates: [], invoices: [], payments: [],
    financeEntries: [], financeMedia: [], serviceMedia: [], orderMedia: [],
  } as never);

describe('levantamientoObsSchema', () => {
  it('metadata y registro', () => {
    expect(levantamientoObsSchema.code).toBe('LEV-OBS');
    expect(getSchemaByCode('LEV-OBS')).toBe(levantamientoObsSchema);
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('la observacion se puede GESTIONAR: responsable y plazo', () => {
    // Sin responsable ni plazo el cuadro es una lista de quejas: no se puede
    // reclamar el levantamiento a nadie ni saber si llego tarde.
    expect(columna('responsable')?.editable).toBe(true);
    expect(columna('plazo')?.type).toBe('date');
  });

  it('el CODIGO es correlativo del documento, no se tipea', () => {
    const codigo = columna('codigo');
    expect(codigo?.computed).toBe(true);
    expect(codigo?.editable).toBeFalsy();
    expect(codigo?.formula).toContain('rows.length + 1');
  });

  it('el ESTADO se deriva de la evidencia y conserva sus opciones', () => {
    const estado = columna('estado');
    expect(estado?.computed).toBe(true);
    expect(estado?.formula).toContain('row.fechaLevantamiento');
    expect(estado?.formula).toContain('row.accionCorrectiva');
    // El renderer de `select` muestra la ETIQUETA de la opcion: la formula
    // devuelve VALORES ('EN_PROCESO'), no etiquetas.
    expect((estado?.options || []).map((option) => option.value))
      .toEqual(['PENDIENTE', 'EN_PROCESO', 'LEVANTADO']);
  });

  it('los DIAS DE ATRASO no dependen de "hoy"', () => {
    // Un documento firmado que se reimprime no puede cambiar de numeros.
    const dias = columna('diasAtraso');
    expect(dias?.computed).toBe(true);
    expect(dias?.formula).toContain('(data.control || {}).fecha');
    expect(dias?.formula).not.toContain('new Date()');
    expect(dias?.formula).not.toContain('Date.now');
  });

  it('el resumen no cuenta filas en blanco', () => {
    expect(campoComputado('resumen.total')?.formula).toContain('obs.descripcion');
    expect(campoComputado('resumen.levantadas')?.formula).toContain('obs.fechaLevantamiento');
  });

  it('el porcentaje no divide por cero', () => {
    expect(campoComputado('resumen.porcentaje')?.formula).toContain('Math.max(1');
  });

  it('las formulas coinciden LITERALMENTE con las probadas en Portal', () => {
    // El comportamiento se prueba contra el evaluador REAL en
    // `Portal/src/components/documents/levantamientoObsFormula.test.ts`.
    expect(columna('codigo')?.formula).toBe("'OBS-' + String(rows.length + 1).padStart(2, '0')");
    expect(columna('estado')?.formula).toBe(
      "row.fechaLevantamiento ? 'LEVANTADO' : (String(row.accionCorrectiva || '').trim() ? 'EN_PROCESO' : 'PENDIENTE')"
    );
    expect(columna('diasAtraso')?.formula).toBe(
      "row.plazo ? Math.round((Date.parse(String(row.fechaLevantamiento || (data.control || {}).fecha || row.plazo)) - Date.parse(String(row.plazo))) / 86400000) : ''"
    );
    expect(campoComputado('resumen.porcentaje')?.formula).toBe(
      'round((num(data.resumen.levantadas) / Math.max(1, num(data.resumen.total))) * 100, 0)'
    );
  });

  it('el agregador siembra la fecha del control (referencia del atraso)', () => {
    const data = aggregate();
    expect(data.control.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.proyecto.obra).toBe('Rehabilitacion vial');
  });

  it('el agregador NO inventa observaciones: nacen en campo', () => {
    expect(aggregate().observaciones).toBeUndefined();
  });
});
