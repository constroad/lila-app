import { GUION_ASFALTO, guionDe, regexDePalabras } from '../ventas/guion.asfalto';
import { aGuion, editableDe, slugDe, type GuionEditable } from './servicios';

/**
 * EL GUION COMO LO VE EL PANEL (A8/A9/A10) y cómo vuelve al motor: palabras
 * en vez de regex, un modo por servicio, y al guardar se conserva lo experto
 * del pack mientras nadie lo toque.
 */
describe('editableDe', () => {
  it('el pack se lee con sus palabras, su modo y sus preguntas', () => {
    const e = editableDe(GUION_ASFALTO);
    expect(e.preguntaServicio).toBe('¿Qué necesitas: solo la mezcla asfáltica, que la coloquemos (asfaltado), o transporte?');
    const colocacion = e.servicios.find((s) => s.id === 'colocacion')!;
    expect(colocacion).toMatchObject({ nombre: 'asfaltado (colocación)', modo: 'preguntas', activo: true });
    expect(colocacion.palabras).toContain('asfaltar');
    expect(colocacion.preguntas[0]).toMatchObject({ campo: 'area', etiqueta: 'Área', tipo: 'numero' });
    const base = colocacion.preguntas.find((p) => p.campo === 'base')!;
    expect(base.opciones.map((o) => o.valor)).toEqual(['terreno natural', 'preparada']);
    expect(base.opciones[1].palabras).toContain('afirmado');
    expect(e.servicios.find((s) => s.id === 'fabricacion')).toMatchObject({ modo: 'derivar', preguntas: [] });
    expect(e.cierre.map((p) => p.campo)).toEqual(['fecha', 'nombre']);
  });
});

describe('aGuion', () => {
  it('lo que no se tocó vuelve con los regex del pack; lo editado, con sus palabras', () => {
    const e = editableDe(GUION_ASFALTO);
    const colocacion = e.servicios.find((s) => s.id === 'colocacion')!;
    colocacion.palabras = [...colocacion.palabras, 'bacheo'];
    const base = colocacion.preguntas.find((p) => p.campo === 'base')!;
    base.opciones[1].palabras = ['preparada', 'afirmado'];
    const g = aGuion(e);
    expect(guionDe(g)).toBe(g); // tiene la forma
    expect(g.servicios.find((s) => s.id === 'colocacion')!.preguntas.map((p) => p.campo)).toEqual(GUION_ASFALTO.servicios.find((s) => s.id === 'colocacion')!.preguntas.map((p) => p.campo)); // los campos son identificadores: tal cual
    const venta = g.servicios.find((s) => s.id === 'venta')!;
    expect(venta.alias).toBe(GUION_ASFALTO.servicios.find((s) => s.id === 'venta')!.alias); // intacto
    const col = g.servicios.find((s) => s.id === 'colocacion')!;
    expect(col.alias).toBeUndefined();
    expect(col.palabras).toContain('bacheo');
    const opciones = col.preguntas.find((p) => p.campo === 'base')!.opciones!;
    expect(opciones[0].alias).toBeDefined(); // terreno natural: sin tocar
    expect(opciones[1]).toMatchObject({ valor: 'preparada', palabras: ['preparada', 'afirmado'] });
    expect(opciones[1].alias).toBeUndefined();
    expect(opciones[1].senal).toBeDefined(); // lo inequívoco del pack se conserva
  });

  it('un servicio nuevo lleva slug, sus palabras limpias, y derivar si es el modo; sí/no sin opciones las recibe del pack', () => {
    const e: GuionEditable = {
      preguntaServicio: '',
      servicios: [
        {
          id: '',
          nombre: '  Sellado de grietas ',
          palabras: [' Sellado', 'grietas', 'sellado', ''],
          activo: true,
          modo: 'preguntas',
          preguntas: [
            { campo: '', etiqueta: 'Metros lineales', pregunta: '¿Cuántos metros lineales?', tipo: 'numero', opciones: [] },
            { campo: '', etiqueta: 'Metros lineales', pregunta: '¿Otra vez metros?', tipo: 'texto', opciones: [] },
            { campo: 'urgente', etiqueta: 'Urgente', pregunta: '¿Es urgente?', tipo: 'sino', opciones: [] },
          ],
        },
        { id: 'estudio', nombre: 'Estudio de suelos', palabras: ['estudio de suelos'], activo: false, modo: 'derivar', preguntas: [] },
      ],
      cierre: [],
    };
    const g = aGuion(e);
    expect(g.preguntaServicio).toBeUndefined();
    expect(g.servicios[0]).toMatchObject({ id: 'sellado-de-grietas', nombre: 'Sellado de grietas', palabras: ['Sellado', 'grietas'], activo: true });
    expect(g.servicios[0].derivar).toBeUndefined();
    expect(g.servicios[0].preguntas.map((p) => p.campo)).toEqual(['metros-lineales', 'metros-lineales-2', 'urgente']);
    expect(g.servicios[0].preguntas[2].opciones!.map((o) => o.valor)).toEqual(['no', 'sí']); // lo negativo primero, como en el pack
    expect(g.servicios[0].preguntas[2].opciones![0].alias).toBeDefined();
    expect(g.servicios[1]).toMatchObject({ id: 'estudio', activo: false, derivar: 'Estudio de suelos: lo ve un asesor' });
    expect(guionDe(g)).toBe(g);
  });

  it('un slug se arma sin tildes ni espacios', () => {
    expect(slugDe('Sellado de grietas')).toBe('sellado-de-grietas');
    expect(slugDe('  Imprimación / riego  ')).toBe('imprimacion-riego');
    expect(slugDe('')).toBe('');
  });

  it('las palabras editadas del pack se ven como llegaron, pero el regex sale de ellas', () => {
    const e = editableDe(GUION_ASFALTO);
    const transporte = e.servicios.find((s) => s.id === 'transporte')!;
    transporte.palabras = ['flete'];
    const g = aGuion(e);
    const t = g.servicios.find((s) => s.id === 'transporte')!;
    expect(t.alias).toBeUndefined();
    expect(t.palabras).toEqual(['flete']);
    expect(regexDePalabras(t.palabras!)).toBe('(?<!\\w)(?:flet)');
  });
});
