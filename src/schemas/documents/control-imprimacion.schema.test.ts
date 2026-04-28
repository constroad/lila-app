import { controlImprimacionSchema } from './control-imprimacion.schema.js';
import { actaConformidadSchema } from './acta-conformidad.schema.js';

describe('controlImprimacionSchema defaults', () => {
  it('deja vacios los valores editables que no deben venir precargados', () => {
    const data: any = controlImprimacionSchema.defaultData;

    expect(data.materialesInsumos[0].tipoLigante).toBe('');
    expect(data.materialesInsumos[0].criteriosAceptacion).toBe('');
    expect(data.materialesInsumos[0].fabricante).toBe('');
    expect(data.materialesInsumos[0].certificado).toBe('');

    expect(data.controlRiego[0].resultadoObtenido).toBe('');
    expect(data.controlRiego[0].conforme).toBe(false);
    expect(data.controlRiego[0].responsable).toBe('');
    expect(data.controlRiego[0].observaciones).toBe('');

    expect(data.documentacionAdjunta[0].si).toBe(false);
    expect(data.observacionesProtocolo).toBe('');

    expect(data.tasa.materialBituminoso).toBe('');
    expect(data.tasa.gravedadEspecifica).toBe('');
    expect(data.tasaRegistroDatos[0].a).toBe('');
    expect(data.tasaRegistroDatos[0].b).toBe('');
    expect(data.tasaRegistroDatos[0].c).toBe('');
    expect(data.tasaRegistroDatos[0].observaciones).toBe('');
    expect(data.tasaRegistroDatos[8].observaciones).toBe('');
    expect(data.observacionesTasa).toBe('');
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
