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
    // C3: el cronograma nace con la partida y su metrado; el rendimiento en cero
    // porque lo pacta la empresa (inventarlo seria peor que dejarlo vacio).
    expect(structuredData.cronograma[0]).toEqual({
      item: '01',
      partida: 'Colocacion de asfalto',
      unidad: 'm2',
      metrado: 25,
      rendimiento: 0,
      dias: 0,
      inicio: '',
      fin: '',
    });
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
    // Regimen PRIVADO (Codigo Civil), no el de contrataciones publicas.
    expect(responsibilities).toContain('artículo 1784 del Código Civil');
    expect(responsibilities).toContain('CINCO (5) AÑOS');
    expect(responsibilities).toContain('SESENTA (60) DÍAS');
    expect(arbitration).toContain('Cámara de Comercio de Lima');
    expect(arbitration).toContain('TRATO DIRECTO');
  });

  it('NO cita el regimen de contrataciones publicas ni el septenio (C1)', () => {
    // El texto anterior invocaba la Ley 30225 y su Reglamento -DEROGADOS desde el
    // 22/04/2025 por la Ley 32069- en un contrato ENTRE PRIVADOS, y aceptaba 7
    // años de responsabilidad cuando el Codigo Civil fija 5 en el ambito privado.
    const clauses = [
      contratoServicioSchema.defaultData.clausula6Marco,
      contratoServicioSchema.defaultData.clausula7Responsabilidades,
      contratoServicioSchema.defaultData.clausula8Arbitraje,
    ].join('\n');

    expect(clauses).not.toContain('artículo 40 de la Ley');
    expect(clauses).not.toContain('artículo 146 de su Reglamento');
    expect(clauses).not.toContain('artículo 214 del Reglamento');
    expect(clauses).not.toContain('arbitraje administrativo');
    expect(clauses).not.toContain('7 AÑOS');
  });

  it('declara el sistema de PRECIOS UNITARIOS (mayores metrados se pagan)', () => {
    // En suma alzada los mayores metrados los asume el contratista: el sistema
    // tiene que estar pactado en el texto, no solo en la descripcion del schema.
    const marco = String(contratoServicioSchema.defaultData.clausula6Marco);

    expect(marco).toContain('PRECIOS UNITARIOS');
    expect(marco).toContain('REALMENTE EJECUTADO');
    expect(marco).toContain('mayores metrados');
  });

  it('tope de responsabilidad y exclusion de lucro cesante', () => {
    const responsibilities = String(contratoServicioSchema.defaultData.clausula7Responsabilidades);

    expect(responsibilities).toContain('no excederá el monto contractual');
    expect(responsibilities).toContain('lucro cesante');
  });

  it('passes global schema validation', () => {
    expect(() => validateAllSchemas()).not.toThrow();
  });

  it('exports pdf and docx', () => {
    expect(contratoServicioSchema.exportOptions?.pdf).toBe(true);
    expect(contratoServicioSchema.exportOptions?.docx).toBe(true);
  });

  describe('C2 — clausulas de proteccion', () => {
    const sectionIds = contratoServicioSchema.sections.map((section) => section.id);
    const NEW_SECTIONS = [
      'clausula10Exclusiones',
      'condicionesPrevias',
      'clausula11Ajustes',
      'reajuste',
      'tarifarioEspera',
      'clausula12Pagos',
      'pagos',
      'clausula13Ampliaciones',
    ];

    it('las 8 secciones nuevas existen y van DESPUES de la novena', () => {
      const novena = sectionIds.indexOf('clausula9Domicilios');
      NEW_SECTIONS.forEach((id) => {
        expect(sectionIds).toContain(id);
        expect(sectionIds.indexOf(id)).toBeGreaterThan(novena);
      });
    });

    it('NO renumera las clausulas existentes (contratos ya emitidos intactos)', () => {
      // Insertar en el medio habria cambiado el ordinal de clausulas de documentos
      // ya firmados: el orden viejo se conserva tal cual.
      const titleOf = (id: string) =>
        contratoServicioSchema.sections.find((section) => section.id === id)?.title || '';

      expect(titleOf('clausula6Marco')).toContain('SEXTA');
      expect(titleOf('clausula7Responsabilidades')).toContain('SEPTIMA');
      expect(titleOf('clausula8Arbitraje')).toContain('OCTAVA');
      expect(titleOf('clausula9Domicilios')).toContain('NOVENA');
    });

    it('cada seccion nueva esta gated por un flag de `opciones`', () => {
      NEW_SECTIONS.forEach((id) => {
        const section = contratoServicioSchema.sections.find((entry) => entry.id === id);
        expect(section?.showIf?.field).toMatch(/^opciones\./);
        expect(section?.showIf?.operator).toBe('eq');
        expect(section?.showIf?.value).toBe(true);
      });
    });

    it('los flags nacen encendidos en los contratos NUEVOS', () => {
      expect(contratoServicioSchema.defaultData.opciones).toEqual({
        exclusiones: true,
        ajustes: true,
        pagosGarantias: true,
        ampliaciones: true,
        // C3/C4/C5 usan el mismo mecanismo de gating.
        cronograma: true,
        cotizacion: true,
        cronogramaPagos: true,
        modalidad: true,
      });
    });

    it('los numeros son DATO, no prosa', () => {
      // Cambiar la detraccion de 4% a 12% no puede exigir reescribir un parrafo.
      const { pagos, reajuste } = contratoServicioSchema.defaultData;

      expect(pagos.diasPago).toBe(15);
      expect(pagos.tasaMoraMensual).toBe(1.5);
      expect(pagos.diasSuspension).toBe(30);
      expect(pagos.retencionPct).toBe(5);
      expect(pagos.detraccionPct).toBe(4);
      expect(reajuste.umbralPct).toBe(5);
      expect(reajuste.indice).toContain('INEI');
    });

    it('el texto trae las defensas clave del ejecutor', () => {
      const texts = [
        contratoServicioSchema.defaultData.clausula10Exclusiones,
        contratoServicioSchema.defaultData.clausula11Ajustes,
        contratoServicioSchema.defaultData.clausula12Pagos,
        contratoServicioSchema.defaultData.clausula13Ampliaciones,
      ].join('\n');

      expect(texts).toContain('mora automática');
      expect(texts).toContain('suspender la ejecución');
      expect(texts).toContain('coeficiente K');
      expect(texts).toContain('STAND-BY');
      expect(texts).toContain('factoring');
      expect(texts).toContain('SILENCIO se entenderá como APROBACIÓN');
      expect(texts).toContain('detracción');
    });

    it('C4 — la cotizacion de origen es una seccion propia y gated', () => {
      const section = contratoServicioSchema.sections.find((entry) => entry.id === 'cotizacionOrigen');
      const ids = contratoServicioSchema.sections.map((entry) => entry.id);

      expect(section?.showIf).toEqual({ field: 'opciones.cotizacion', operator: 'eq', value: true });
      expect(ids.indexOf('cotizacionOrigen')).toBeLessThan(ids.indexOf('preciosUnitarios'));
      expect((section?.fields || []).map((field) => field.key)).toEqual([
        'cotizacion.numeros',
        'cotizacion.fecha',
        'cotizacion.observacion',
      ]);
    });

    it('C5 — el cronograma de pagos deriva el monto del % pactado', () => {
      const section = contratoServicioSchema.sections.find((entry) => entry.id === 'cronogramaPagos');
      const monto = (section?.columns || []).find((column) => column.key === 'monto');

      expect(section?.showIf?.field).toBe('opciones.cronogramaPagos');
      // Si % y monto se tipearan por separado, el cuadro contradiria a la clausula tercera.
      expect(monto?.editable).toBeFalsy();
      expect(monto?.computed).toBe(true);
      expect(monto?.formula).toContain('num(monto.total)');
      expect(monto?.formula).toContain('row.porcentaje');
    });

    it('C5 — los hitos por defecto suman 100% y hay adelanto', () => {
      const hitos = contratoServicioSchema.defaultData.cronogramaPagos as Array<{ porcentaje: number }>;
      const total = hitos.reduce((sum, hito) => sum + hito.porcentaje, 0);

      expect(total).toBe(100);
      expect(contratoServicioSchema.defaultData.adelanto.porcentaje).toBe(30);
      expect(contratoServicioSchema.defaultData.adelanto.amortizacionPct).toBe(100);
    });

    it('C3 — el cronograma existe, va tras el plazo y esta gated', () => {
      const section = contratoServicioSchema.sections.find((entry) => entry.id === 'cronograma');
      const ids = contratoServicioSchema.sections.map((entry) => entry.id);

      expect(section?.showIf).toEqual({ field: 'opciones.cronograma', operator: 'eq', value: true });
      expect(ids.indexOf('cronograma')).toBeGreaterThan(ids.indexOf('clausula5Texto'));
      expect(contratoServicioSchema.defaultData.opciones.cronograma).toBe(true);
    });

    it('C3 — el cronograma pide RENDIMIENTO y deriva los dias', () => {
      const section = contratoServicioSchema.sections.find((entry) => entry.id === 'cronograma');
      const columns = section?.columns || [];
      const keys = columns.map((column) => column.key);

      expect(keys).toEqual(['item', 'partida', 'unidad', 'metrado', 'rendimiento', 'dias', 'inicio', 'fin']);
      // `dias` es derivado: si fuera editable, el plazo podria contradecir al rendimiento.
      const dias = columns.find((column) => column.key === 'dias');
      expect(dias?.editable).toBeFalsy();
      // Solo `Math` y el whitelist del evaluador: un identificador suelto (ceil)
      // devuelve cadena vacia EN SILENCIO. Probado en Portal contra el evaluador real.
      // `computed: true` es OBLIGATORIO: sin el, `applyRowComputations` ignora la
      // formula y la columna se queda con el valor guardado (0) EN SILENCIO.
      expect(dias?.computed).toBe(true);
      expect(dias?.formula).toContain('Math.ceil');
      expect(dias?.formula).toContain('num(row.rendimiento) > 0');
    });

    it('C3 — el texto del plazo ata el cumplimiento al rendimiento pactado', () => {
      const texto = String(contratoServicioSchema.defaultData.clausula5Texto);

      expect(texto).toContain('RENDIMIENTO PACTADO');
      expect(texto).toContain('Anexo 2');
      expect(texto).toContain('frentes parciales');
    });

    it('C6 — el back-to-back solo aparece en modalidad SUBCONTRATO', () => {
      const clausula = contratoServicioSchema.sections.find((entry) => entry.id === 'clausula14Backtoback');
      const selector = contratoServicioSchema.sections.find((entry) => entry.id === 'modalidadContrato');

      expect(clausula?.showIf).toEqual({
        field: 'contrato.modalidad',
        operator: 'eq',
        value: 'SUBCONTRATO',
      });
      // Por defecto DIRECTO: un contrato normal no arrastra la clausula.
      expect(contratoServicioSchema.defaultData.contrato.modalidad).toBe('DIRECTO');
      // Los datos del contrato principal solo se piden en subcontrato.
      const entidad = (selector?.fields || []).find((field) => field.key === 'contrato.entidad');
      expect(entidad?.showIf?.value).toBe('SUBCONTRATO');
    });

    it('C6 — el back-to-back es ASIMETRICO: hereda lo tecnico, no lo demas', () => {
      const texto = String(contratoServicioSchema.defaultData.clausula14Backtoback);

      expect(texto).toContain('obligaciones TÉCNICAS');
      expect(texto).toContain('Lo que no se entregó no se incorpora');
      // Lo que NO se hereda, explicito: penalidades, septenio, arbitraje y fianzas.
      expect(texto).toContain('penalidades pactadas entre EL CLIENTE y la Entidad');
      expect(texto).toContain('siete (7) años');
      expect(texto).toContain('CINCO (5) AÑOS');
      expect(texto).toContain('cartas fianza');
    });

    it('C6 — rechaza el pago condicionado (pay-when-paid)', () => {
      // Es la clausula mas valiosa del subcontrato: sin ella cobramos cuando la
      // Entidad le pague al contratista principal, que puede ser nunca.
      const texto = String(contratoServicioSchema.defaultData.clausula14Backtoback);

      expect(texto).toContain('INDEPENDIENTE y AUTÓNOMA');
      expect(texto).toContain('pay-when-paid');
      expect(texto).toContain('no suspende, difiere ni extingue');
    });

    it('las condiciones previas y el tarifario nacen con filas semilla', () => {
      expect(contratoServicioSchema.defaultData.condicionesPrevias.length).toBeGreaterThan(2);
      expect(contratoServicioSchema.defaultData.tarifarioEspera.length).toBeGreaterThan(2);
      // Tarifa en cero: la pone la empresa, no la inventa el schema.
      contratoServicioSchema.defaultData.tarifarioEspera.forEach((row: { tarifa: number }) => {
        expect(row.tarifa).toBe(0);
      });
    });
  });

  it('firmas section has cliente and proveedor signature blocks', () => {
    const firmasSection = contratoServicioSchema.sections.find((s) => s.id === 'firmas');
    expect(firmasSection).toBeDefined();
    const keys = (firmasSection?.signatures || []).map((s) => s.key);
    expect(keys).toContain('firmas.cliente');
    expect(keys).toContain('firmas.proveedor');
  });
});
