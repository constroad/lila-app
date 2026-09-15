import { archivosDeFotos, esVideo, fotosDeUnidad, fotosDelInforme, todasLasFotos } from './fotos-informe';

/**
 * LAS FOTOS DE UN INFORME NO SON LAS DEL DESPACHO (15/09, 09:15). Con la forma
 * real del control de pista de ese día: el panel fotográfico con tres fotos y
 * la sección de la unidad 1 (`unitPhotos_<dispatchId>`) con dos de esas tres.
 */
const base = 'https://lila.constroad.com/files/companies/globofas-s8k/services/s1/field-reports/r1/panelFotografico';
const foto = (n: number, descripcion: string, hora: string) => ({ url: `${base}/image_${n}.jpg`, originalUrl: `${base}/orig_${n}.jpg`, mediaId: `m${n}`, descripcion, hora });
const schemaData = {
  header: { logoUrl: 'https://x/logo.jpeg' },
  controlPista: [{ item: 1, placa: 'AZJ 910', _dispatchId: 'd1' }],
  panelFotografico: { fotos: [foto(1, 'Unidad 1 AZJ 910', '08:15'), foto(2, 'Unidad 1 AZJ 910', '08:40'), foto(3, 'Bacheos antes de la colocación de carpeta', '08:41')] },
  registroFotografico: { fotos: [] },
  unitPhotos_d1: { fotos: [foto(1, 'Unidad 1 AZJ 910', '08:15'), foto(2, 'Unidad 1 AZJ 910', '08:40')] },
  unitPhotos_d2: { fotos: [{ url: `${base}/video_9.mp4`, mediaId: 'm9', descripcion: 'Unidad 2 BBE 942', hora: '09:00' }] },
};

describe('fotos de un informe', () => {
  const fotos = fotosDelInforme(schemaData);

  it('recoge todas las secciones con fotos, con la foto SELLADA (url), y sabe de qué sección es cada una', () => {
    expect(fotos).toHaveLength(6);
    expect(fotos[0]).toEqual({ url: `${base}/image_1.jpg`, descripcion: 'Unidad 1 AZJ 910', hora: '08:15', seccion: 'panelFotografico', mediaId: 'm1' });
    expect(fotos.filter((f) => f.seccion === 'unitPhotos_d1')).toHaveLength(2);
  });

  it('sin unidad: todas sin repetir (la de la unidad también está en el panel)', () => {
    expect(todasLasFotos(fotos).map((f) => f.mediaId)).toEqual(['m1', 'm2', 'm3', 'm9']);
  });

  it('con unidad: su sección por dispatchId; sin sección, las que la nombran; nada, vacío', () => {
    expect(fotosDeUnidad(fotos, { dispatchId: 'd1', unitNumber: 1, plate: 'AZJ 910' }).map((f) => f.mediaId)).toEqual(['m1', 'm2']);
    expect(fotosDeUnidad(fotos, { unitNumber: 1 }).map((f) => f.mediaId)).toEqual(['m1', 'm2']); // por la descripción «Unidad 1»
    expect(fotosDeUnidad(fotos, { plate: 'AZJ910' }).map((f) => f.mediaId)).toEqual(['m1', 'm2']); // por la placa
    expect(fotosDeUnidad(fotos, { dispatchId: 'd7', unitNumber: 7 })).toEqual([]);
    expect(fotosDeUnidad(fotos, { unitNumber: 11 })).toEqual([]); // «unidad 1» no es «unidad 11»
  });

  it('un video se manda como video, con su descripción de caption', () => {
    expect(esVideo(`${base}/video_9.mp4`)).toBe(true);
    expect(esVideo(`${base}/image_1.jpg`)).toBe(false);
    const archivos = archivosDeFotos(fotosDeUnidad(fotos, { dispatchId: 'd2' }), 'globofas-s8k');
    expect(archivos).toEqual([{ tipo: 'video', url: `${base}/video_9.mp4`, nombre: 'video_9.mp4', fechaMs: 0, mime: 'video/mp4', companyId: 'globofas-s8k', caption: 'Unidad 2 BBE 942 · 09:00' }]);
  });

  it('un informe sin secciones de fotos no tiene fotos', () => {
    expect(fotosDelInforme({ controlPista: [] })).toEqual([]);
    expect(fotosDelInforme(undefined)).toEqual([]);
  });
});
