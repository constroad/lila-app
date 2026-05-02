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
import { actaConformidadSchema } from './acta-conformidad.schema.js';
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
