import { evidenciaPorUnidad, textoEvidencia } from './evidencia';
import type { UnidadDelDia } from './vista';
import type { FotoInforme } from './fotos-informe';

const esVideo = (url: string) => /\.mp4$/.test(url);
const u = (n: number, plate: string, extra: Partial<UnidadDelDia> = {}): UnidadDelDia => ({ dispatchId: `d${n}`, unitNumber: n, plate, driverName: '', state: 'despachado', quantity: 25, picturesCount: 0, departedAt: 1, ...extra });
const f = (seccion: string, n: number, video = false): FotoInforme[] => Array.from({ length: n }, (_, i) => ({ url: `/x/${seccion}-${i}.${video ? 'mp4' : 'jpg'}`, descripcion: '', hora: '', seccion }));

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
    expect(t).toContain('no puedo decir cuál falta');
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
