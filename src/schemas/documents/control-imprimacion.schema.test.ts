jest.mock('../../services/storage-path.service.js', () => ({
  storagePathService: {
    getFullPath: jest.fn(),
    normalizePath: jest.fn((value: string) => value),
  },
}));

jest.mock('../../utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { controlImprimacionSchema } from './control-imprimacion.schema.js';
import { controlPistaSchema } from './control-pista.schema.js';
import { actaConformidadSchema } from './acta-conformidad.schema.js';
import { informeAreaAdicionalSchema } from './informe-area-adicional.schema.js';
import { informeProduccionPlantaSchema } from './informe-produccion-planta.schema.js';
import { ReportHtmlRenderer } from '../../services/report-html-renderer.service.js';

describe('controlImprimacionSchema defaults', () => {
  it('starts with a single empty control and conditional sections', () => {
    const data: any = controlImprimacionSchema.defaultData;

    expect(data.general.cliente).toBe('');
    expect(data.general.proyecto).toBe('');
    expect(data.controles).toHaveLength(1);
    expect(data.controles[0].material.ligante).toBe('MC-30');
    expect(data.controles[0].equipo.camionLabel).toBe('Camión');
    expect(data.controles[0].bandeja.pesoBandejaSinAsfalto.uno).toBe('');
    expect(data.controles[0].camionImprimador.lecturaInicial).toBe('');
    expect(data.firmas.responsable.nombre).toBe('');
    expect(data.registroFotografico.fotos).toEqual([]);
  });
});

describe('controlImprimacionSchema renderer', () => {
  it('renders one sheet per control and hides empty photo/signature sections', async () => {
    const renderer = new ReportHtmlRenderer(controlImprimacionSchema, {
      header: {
        fecha: '2026-04-30',
      },
      general: {
        cliente: 'Consorcio Puentes G & D',
        proyecto: 'Servicio general de instalación de puente modular',
        ubicacion: 'Sector Los Girasoles - Chaclacayo',
        responsable: 'Luis Contreras',
      },
      controles: [
        {
          tramo: 'Vía del puente Morón',
          material: { ligante: 'MC-30' },
        },
        {
          tramo: 'Acceso sur',
          material: { ligante: 'MC-70' },
        },
      ],
      registroFotografico: { fotos: [] },
      firmas: {
        responsable: { nombre: '', cargo: 'Responsable', empresa: '', cip: '' },
        supervisadoPor: { nombre: '', cargo: 'Supervisor', empresa: '', cip: '' },
        cliente: { nombre: '', cargo: 'Cliente', empresa: '', cip: '' },
      },
    });

    const html = await renderer.render();

    expect(html).toContain('TASA DE RIEGO DEL IMPRIMANTE');
    expect(html).toContain('Vía del puente Morón');
    expect(html).toContain('Acceso sur');
    expect(html).toContain('MC-30');
    expect(html).toContain('MC-70');
    expect(html).not.toContain('Panel Fotografico');
    expect(html).not.toContain('<h2>Firmas</h2>');
  });
});

describe('actaConformidadSchema pdf behavior', () => {
  it('starts photo panel and signatures on a new page', () => {
    const photoSection = actaConformidadSchema.sections.find(
      (section) => section.id === 'registroFotografico'
    );
    const signaturesSection = actaConformidadSchema.sections.find(
      (section) => section.id === 'firmas'
    );

    expect(photoSection?.pageBreakBefore).toBe(true);
    expect(signaturesSection?.pageBreakBefore).toBe(true);
  });
});

describe('controlPistaSchema pdf behavior', () => {
  it('hides empty photo panel and empty signatures', async () => {
    const renderer = new ReportHtmlRenderer(controlPistaSchema, {
      control: { fecha: '2026-05-06', tramo: 'Tramo 1' },
      controlPista: [],
      registroFotografico: { fotos: [] },
      firmas: {
        elaboradoPor: { nombre: '', cargo: 'Supervisor de Campo', cip: '' },
        aprobadoPor: { nombre: '', cargo: 'Supervisor de Calidad', cip: '' },
      },
    });

    const html = await renderer.render();

    expect(html).not.toContain('Panel Fotografico');
    expect(html).not.toContain('<h2>Firmas</h2>');
  });

  it('starts photo panel on a new page and keeps signatures together', async () => {
    const photoSection = controlPistaSchema.sections.find(
      (section) => section.id === 'registroFotografico'
    );
    const renderer = new ReportHtmlRenderer(controlPistaSchema, {
      control: { fecha: '2026-05-06', tramo: 'Tramo 1' },
      registroFotografico: {
        fotos: [
          {
            filename: 'foto.png',
            base64:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      },
      firmas: {
        elaboradoPor: { nombre: 'Juan Perez', cargo: 'Supervisor', cip: '12345' },
      },
    });

    const html = await renderer.render();

    expect(photoSection?.pageBreakBefore).toBe(true);
    expect(html).toContain('page-break');
    expect(html).toContain('signature-section');
  });
});

describe('informeAreaAdicionalSchema behavior', () => {
  it('removes redundant project fields from the visible schema', () => {
    const projectSection = informeAreaAdicionalSchema.sections.find(
      (section) => section.id === 'datosProyecto'
    );
    const keys = projectSection?.fields?.map((field) => field.key) || [];

    expect(keys).not.toContain('proyecto.cui');
    expect(keys).not.toContain('proyecto.contrato');
    expect(keys).not.toContain('proyecto.ordenCompra');
    expect(keys).not.toContain('proyecto.ubicacion');
    expect(keys).not.toContain('proyecto.frente');
  });

  it('renders grouped photos by additional area row', async () => {
    const renderer = new ReportHtmlRenderer(informeAreaAdicionalSchema, {
      cuadroMetrado: [
        {
          id: 'area-lluta',
          item: '1',
          ubicacion: 'Lluta',
          descripcion: 'Bacheo localizado',
          area: 12.97,
        },
      ],
      panelFotografico: {
        fotos: [
          {
            category: 'area-lluta',
            descripcion: 'Area: 11.02m2',
            base64:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      },
      firmas: {},
    });

    const html = await renderer.render();

    expect(html).toContain('Lluta - Area: 12.97 m2');
    expect(html).toContain('TOTAL ADICIONAL');
    expect(html).toContain('Area: 11.02m2');
  });
});

describe('informeProduccionPlantaSchema behavior', () => {
  it('renders production summary before dispatch registry', async () => {
    const renderer = new ReportHtmlRenderer(informeProduccionPlantaSchema, {
      resumenProduccion: { totalDespachos: 1 },
      registroDespachos: [{ item: 1, placa: 'ABC-123', nroCubos: 20 }],
      observaciones: '',
    });

    const html = await renderer.render();

    expect(html.indexOf('II. Resumen de Produccion')).toBeGreaterThan(-1);
    expect(html.indexOf('III. Registro de Despachos')).toBeGreaterThan(-1);
    expect(html.indexOf('II. Resumen de Produccion')).toBeLessThan(
      html.indexOf('III. Registro de Despachos')
    );
    expect(html).not.toContain('VI. Observaciones');
  });

  it('starts dispatch registry on a new page', () => {
    const dispatchSection = informeProduccionPlantaSchema.sections.find(
      (section) => section.id === 'registroDespachos'
    );

    expect(dispatchSection?.pageBreakBefore).toBe(true);
  });
});
