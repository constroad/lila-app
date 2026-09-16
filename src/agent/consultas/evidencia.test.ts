import { evidenciaPorUnidad, focoDe, marcasDe, textoEvidencia } from './evidencia';
import type { UnidadDelDia } from './vista';
import type { FotoInforme } from './fotos-informe';

const esVideo = (url: string) => /\.mp4$/.test(url);
const u = (n: number, plate: string, extra: Partial<UnidadDelDia> = {}): UnidadDelDia => ({ dispatchId: `d${n}`, unitNumber: n, plate, driverName: '', state: 'despachado', quantity: 25, picturesCount: 0, departedAt: 1, ...extra });
const f = (seccion: string, n: number, video = false, descripcion = ''): FotoInforme[] => Array.from({ length: n }, (_, i) => ({ url: `/x/${seccion}-${descripcion.replace(/\W/g, '')}-${i}.${video ? 'mp4' : 'jpg'}`, descripcion, hora: '', seccion }));

describe('evidencia de campo por unidad', () => {
  const units = [u(1, 'AZJ 910', { arrivalAt: 2 }), u(2, 'C2A 772', { arrivalAt: 2 }), u(3, 'ALC 812', { arrivalAt: 2 }), u(4, 'BBE 942'), u(5, 'XYZ 123', { state: 'progreso', departedAt: undefined })];
  const fotos = [...f('unitPhotos_d1', 3), ...f('unitPhotos_d2', 1), ...f('unitPhotos_d2', 1, true), ...f('unitPhotos_d3', 0)];

  it('cuenta fotos (no videos) contra el mínimo de 3, solo de las despachadas', () => {
    const e = evidenciaPorUnidad(units, fotos, esVideo);
    expect(e.map((x) => [x.unitNumber, x.fotos, x.videos, x.incompleta, x.llego])).toEqual([
      [1, 3, 0, false, true],
      [2, 1, 1, true, true],
      [3, 0, 0, true, true],
      [4, 0, 0, true, false],
    ]);
  });

  it('el resumen dice qué llegó sin el mínimo, qué está en ruta sin fotos, y qué NO puede saber', () => {
    const t = textoEvidencia(evidenciaPorUnidad(units, fotos, esVideo), 'martes 15/09');
    expect(t).toContain('3 unidad(es) llegaron; 1 con las 3 fotos mínimas');
    expect(t).toContain('• Unidad 2 (C2A 772): 1 foto(s), 1 video(s)');
    expect(t).toContain('• Unidad 3 (ALC 812): ninguna foto');
    expect(t).not.toContain('Unidad 1 (AZJ 910)');
    expect(t).toContain('En ruta, todavía sin fotos: unidad 4');
    expect(t).toContain('«–» es sin marcar, no sin foto');
  });

  it('de una unidad: cuántas tiene y si cubre el mínimo', () => {
    const e = evidenciaPorUnidad(units, fotos, esVideo);
    expect(textoEvidencia(e, 'hoy', e[0])).toContain('✅ *Unidad 1* (AZJ 910), hoy: 3 foto(s) en el control de pista — cubre el mínimo de 3');
    expect(textoEvidencia(e, 'hoy', e[1])).toContain('⚠️ *Unidad 2* (C2A 772), hoy: 1 foto(s) y 1 video(s) en el control de pista — por debajo del mínimo de 3: faltan 2');
    expect(textoEvidencia(e, 'hoy', e[3])).toContain('❌ *Unidad 4* (BBE 942), hoy: 0 foto(s) en el control de pista — sin evidencia de campo (todavía en ruta)');
  });

  it('sin despachos lo dice', () => {
    expect(textoEvidencia([], 'hoy')).toBe('No hay unidades despachadas hoy.');
  });
});

describe('las marcas que escribe el ingeniero (medido 15/09 sobre un mes de Globofast)', () => {
  it('temperatura, salida vacía e ingreso, con tilde, sin tilde y con errores', () => {
    expect(marcasDe('Unidad 7 F2B 725 temperatura')).toEqual(['temperatura']);
    expect(marcasDe('temperatura del 8tvo volquete')).toEqual(['temperatura']);
    expect(marcasDe('Unidad 2 volquete saliendo')).toEqual(['vacio']);
    expect(marcasDe('vacioo')).toEqual(['vacio']);
    expect(marcasDe('Unidad 3 volquete vacío')).toEqual(['vacio']);
    expect(marcasDe('ingreso a descarga')).toEqual(['ingreso']);
    expect(marcasDe('Unidad 9 A1Y825')).toEqual([]);
    expect(marcasDe('control con escantillon')).toEqual([]);
  });

  it('el foco de la pregunta', () => {
    expect(focoDe('qué unidad no tiene foto de temperatura')).toBe('temperatura');
    expect(focoDe('qué unidades salieron sin foto de la tolva vacía')).toBe('vacio');
    expect(focoDe('cuáles no tienen foto de ingreso a descarga')).toBe('ingreso');
    expect(focoDe('qué unidades llegaron sin fotos')).toBeNull();
  });

  it('con foco: quién tiene la marca, quién no, y que sin marca no es sin foto', () => {
    const units = [u(7, 'F2B 725', { arrivalAt: 2 }), u(9, 'A1Y825', { arrivalAt: 2 })];
    const fotos = [...f('unitPhotos_d7', 2, false, 'Unidad 7 F2B 725'), ...f('unitPhotos_d7', 1, false, 'Unidad 7 F2B 725 temperatura'), ...f('unitPhotos_d9', 4, false, 'Unidad 9 A1Y825')];
    const e = evidenciaPorUnidad(units, fotos, esVideo);
    expect(e[0].marcadas).toEqual({ ingreso: 0, temperatura: 1, vacio: 0 });
    const t = textoEvidencia(e, 'hoy', undefined, 'temperatura');
    expect(t).toContain('Con «temperatura» escrito por el ingeniero: unidad 7 ✓');
    expect(t).toContain('Las otras 1 (9) tienen 4–4 fotos cada una sin decir cuál es cuál: *quizá la foto de temperatura está, pero no se registró como tal*. Conviene revisarlas.');
    expect(t).not.toMatch(/sin la marca/i);
    expect(textoEvidencia(e, 'hoy', e[0])).toContain('Marcadas por el ingeniero: ingreso / descarga – · temperatura ✓ · salida vacía –');
  });
});
