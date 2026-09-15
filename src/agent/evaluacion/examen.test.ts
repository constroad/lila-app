/**
 * EL GATE: cada pregunta real del corpus, por el mismo camino que un mensaje.
 *
 * Un caso que falla acá es un error que ya pasó una vez en el grupo y volvió.
 * Se arregla el código, no el caso — salvo que la expectativa estuviera mal, y
 * eso se dice en el commit. Los `pendiente: true` se informan y no bloquean.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ahoraDe, contiene, examinar, formatear, juzgar, type Caso } from './examen';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(path.join(aqui, 'corpus.json'), 'utf8')) as Caso[];

describe('corpus', () => {
  it('los ids son únicos y cada caso trae pregunta, hoy y esperado', () => {
    const ids = corpus.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of corpus) {
      expect(c.pregunta.trim()).not.toBe('');
      expect(c.hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.esperado.ruta).toBeTruthy();
    }
  });

  it('«ahora» del caso es el mediodía de Lima de ese día', () => {
    expect(new Date(ahoraDe('2026-09-15')).toISOString()).toBe('2026-09-15T17:00:00.000Z');
  });
});

describe('juzgar', () => {
  it('compara ruta y, por subconjunto, argumentos', () => {
    const caso: Caso = { id: 'x', pregunta: 'p', hoy: '2026-09-15', esperado: { ruta: 'catalogo', clave: 'unit_media', params: { plate: 'A1Y825' } } };
    expect(juzgar(caso, { tipo: 'catalogo', clave: 'unit_media', params: { day: 'today', plate: 'A1Y825', unitNumber: undefined } }).ok).toBe(true);
    expect(juzgar(caso, { tipo: 'catalogo', clave: 'unit_media', params: { day: 'today' } })).toMatchObject({ ok: false, motivo: 'argumentos' });
    expect(juzgar(caso, { tipo: 'catalogo', clave: 'unit_driver', params: { day: 'today' } })).toMatchObject({ ok: false, motivo: 'ruta' });
    // `null` esperado = ausente o null; un valor presente no cumple.
    expect(contiene({ a: 1, b: undefined }, { b: null })).toBe(true);
    expect(contiene({ a: 1, b: 2 }, { b: null })).toBe(false);
    expect(contiene({ a: 1 }, { a: 1 })).toBe(true);
  });
});

describe('examen sin modelo', () => {
  const informe = examinar(corpus);

  it('informa', () => {
    const lineas = [`ruta ${informe.ruta} % · argumentos ${informe.argumentos} % · ${informe.ok}/${informe.total} ok · ${informe.pendientes.length} pendiente(s)`];
    for (const v of informe.fallidos) lineas.push(formatear(v));
    for (const v of informe.pendientes.filter((p) => !p.ok)) lineas.push(`  ⏳ pendiente ${v.id}: esperado ${v.esperado}, obtenido ${v.obtenido}`);
    // eslint-disable-next-line no-console
    console.log(lineas.join('\n'));
  });

  it('ningún caso vigente falla (el error ya pasó una vez; no vuelve)', () => {
    expect(informe.fallidos.map(formatear).join('\n')).toBe('');
  });
});
