import { GUION_ASFALTO, aliasDeOpcion, guionDe, palabrasDeOpcion, palabrasDeServicio, raizDe, regexDePalabras, regexDeServicio, type Guion } from './guion.asfalto';
import { interpretarRespuesta, normalizar, servicioEnTexto } from './guiado';

/**
 * EL GUION SE EDITA CON PALABRAS, NO CON REGEX (A8/A9/A10): la empresa
 * escribe «asfaltar», «colocación», «flete», y el motor arma el patrón. Los
 * regex expertos del pack de asfalto siguen valiendo mientras nadie edite.
 */
describe('raizDe', () => {
  it('quita la terminación si queda una raíz; una palabra corta o una frase quedan tal cual', () => {
    expect(['asfaltar', 'asfaltado', 'colocación', 'pavimentación', 'cubos', 'flete', 'transporte', 'base', 'm3', 'riego de liga', 'lista'].map(raizDe)).toEqual([
      'asfalt', 'asfalt', 'coloc', 'paviment', 'cubo', 'flet', 'transport', 'base', 'm3', 'riego de liga', 'list',
    ]);
  });
});

describe('regexDePalabras', () => {
  it('cada palabra se reconoce desde su inicio si es larga, entera si es corta; sin tildes; frases enteras', () => {
    const r = new RegExp(regexDePalabras(['Asfaltar', 'colocación', 'm3', 'riego de liga', 'mc']));
    expect(r.test(normalizar('quiero asfaltado el patio'))).toBe(true); // «asfaltar» → raíz «asfalt»
    expect(r.test(normalizar('la colocacion la hacen ustedes?'))).toBe(true);
    expect(r.test(normalizar('lo colocan ustedes?'))).toBe(true); // «colocación» → raíz «coloc»
    expect(r.test(normalizar('40 m3 puestos en obra'))).toBe(true);
    expect(r.test(normalizar('40 m30'))).toBe(false); // corta: entera
    expect(r.test(normalizar('con riego de liga'))).toBe(true);
    expect(r.test(normalizar('mcdonalds'))).toBe(false);
    expect(r.test(normalizar('desasfaltar'))).toBe(false); // al inicio de palabra
  });

  it('para CAMBIAR de servicio no valen las unidades ni los números («40 cubos» no vuelve venta un asfaltado)', () => {
    expect(regexDePalabras(['mezcla', 'cubos', 'm3', 'comprar', '2 pulgadas'], 'cambio')).toBe(regexDePalabras(['mezcla', 'comprar']));
    expect(new RegExp(regexDePalabras(['cubos', 'toneladas', 'transporte']))).toEqual(new RegExp('(?<!\\w)(?:cubo|tonel|transport)'));
    expect(regexDePalabras([], 'cambio')).toBe('');
    expect(regexDePalabras(['m3'], 'cambio')).toBe('');
  });

  it('escapa lo que en regex significa otra cosa', () => {
    expect(new RegExp(regexDePalabras(['2"', 'c++'])).test('van 2" de espesor')).toBe(true);
  });
});

describe('regexDeServicio y palabrasDeServicio', () => {
  const colocacion = GUION_ASFALTO.servicios.find((s) => s.id === 'colocacion')!;

  it('con el pack, manda el regex experto; las palabras son solo para mostrar', () => {
    expect(regexDeServicio(colocacion)).toBe(colocacion.alias);
    expect(regexDeServicio(colocacion, 'cambio')).toBe(colocacion.cambio);
    expect(palabrasDeServicio(colocacion)).toContain('asfaltar');
  });

  it('editado (sin regex), el patrón sale de las palabras', () => {
    const editado = { ...colocacion, alias: undefined, cambio: undefined, palabras: ['asfaltar', 'bacheo'] };
    expect(regexDeServicio(editado)).toBe(regexDePalabras(['asfaltar', 'bacheo']));
    expect(servicioEnTexto(normalizar('necesito bacheo en la av principal'), { ...GUION_ASFALTO, servicios: [editado] })).toBe('colocacion');
  });

  it('un servicio apagado no se reconoce, y uno inexistente en el texto no rompe nada', () => {
    const apagado: Guion = { ...GUION_ASFALTO, servicios: GUION_ASFALTO.servicios.map((s) => (s.id === 'transporte' ? { ...s, activo: false } : s)) };
    expect(servicioEnTexto(normalizar('necesito un flete'), GUION_ASFALTO)).toBe('transporte');
    expect(servicioEnTexto(normalizar('necesito un flete'), apagado)).toBeUndefined();
  });
});

describe('opciones con palabras', () => {
  const base = GUION_ASFALTO.servicios.find((s) => s.id === 'colocacion')!.preguntas.find((p) => p.campo === 'base')!;

  it('las palabras de una opción del pack se leen sin la sintaxis del regex', () => {
    const espesor = GUION_ASFALTO.servicios.find((s) => s.id === 'colocacion')!.preguntas.find((p) => p.campo === 'espesor')!;
    expect(palabrasDeOpcion(espesor.opciones![0])).toEqual(['3 pulgada', 'tres pulgada', 'pesad', 'camion', 'trailer', 'maquinaria', 'industrial']);
    expect(palabrasDeOpcion(base.opciones![1])).toEqual(['preparad', 'afirmado', 'compactad', 'lista', 'ya esta', 'ya tengo', 'ya cuento', 'pavimento', 'asfalto', 'concreto']);
  });

  it('una opción editada se reconoce por sus palabras (y por el ordinal, como siempre)', () => {
    const pregunta = { ...base, opciones: [{ valor: 'terreno natural', palabras: ['natural', 'tierra'] }, { valor: 'preparada', palabras: ['preparada', 'afirmado', 'lista'] }] };
    expect(aliasDeOpcion(pregunta.opciones[1])).toEqual([regexDePalabras(['preparada']), regexDePalabras(['afirmado']), regexDePalabras(['lista'])]);
    expect(interpretarRespuesta(pregunta, 'ya está afirmado')).toBe('preparada');
    expect(interpretarRespuesta(pregunta, 'es pura tierra')).toBe('terreno natural');
    expect(interpretarRespuesta(pregunta, 'la segunda')).toBe('preparada');
    expect(interpretarRespuesta(pregunta, 'no sé')).toBeUndefined();
  });
});

describe('guionDe con lo editable', () => {
  it('acepta servicios y opciones definidos por palabras, ids nuevos, apagados y la pregunta de servicio', () => {
    const g: Guion = {
      preguntaServicio: '¿Qué necesitas: mezcla, colocación o transporte?',
      servicios: [
        { id: 'sellado', nombre: 'sellado de grietas', palabras: ['sellado', 'grietas'], activo: true, preguntas: [{ campo: 'metros', etiqueta: 'Metros', pregunta: '¿Cuántos metros lineales?', tipo: 'numero' }] },
        { id: 'colocacion', nombre: 'asfaltado', palabras: ['asfaltar'], preguntas: [{ campo: 'base', etiqueta: 'Base', pregunta: '¿Base lista?', tipo: 'sino', opciones: [{ valor: 'sí', palabras: ['si'] }, { valor: 'no', palabras: ['no'] }] }] },
      ],
      cierre: [],
    };
    expect(guionDe(g)).toBe(g);
  });

  it('sin forma, el pack: sin palabras ni regex, opciones vacías, id inválido', () => {
    expect(guionDe({ servicios: [{ id: 'x', nombre: 'x', preguntas: [] }], cierre: [] })).toBe(GUION_ASFALTO);
    expect(guionDe({ servicios: [{ id: 'Mal id!', nombre: 'x', palabras: ['x'], preguntas: [] }], cierre: [] })).toBe(GUION_ASFALTO);
    expect(guionDe({ servicios: [{ id: 'x', nombre: 'x', palabras: ['x'], preguntas: [{ campo: 'a', etiqueta: 'A', pregunta: '¿?', tipo: 'opcion', opciones: [{ valor: 'a' }] }] }], cierre: [] })).toBe(GUION_ASFALTO);
    expect(guionDe(null)).toBe(GUION_ASFALTO);
  });
});
