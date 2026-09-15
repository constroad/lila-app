import { coincidenciaLiteral, faqsDe, mejorCoincidencia, UMBRAL_FAQ, type Faq } from './faq';

/**
 * LAS PREGUNTAS FRECUENTES (A11): Dali contesta tal cual la respuesta guardada
 * cuando el mensaje se parece a la pregunta o a una de sus variantes. Con el
 * modelo semántico, por coseno; sin él, por palabras en común.
 */
const FAQS: Faq[] = [
  { id: 'sabados', pregunta: '¿Trabajan los sábados?', respuesta: 'Sí, atendemos de lunes a sábado desde las 7:00.', variantes: ['atienden sábados', 'abren los sábados'], categoria: 'Planta', activa: true, usos: 0 },
  { id: 'planta', pregunta: '¿Dónde está la planta?', respuesta: 'En Cajamarquilla, Lurigancho.', variantes: ['dirección de la planta'], categoria: 'Planta', activa: true, usos: 3 },
  { id: 'apagada', pregunta: '¿Aceptan tarjeta?', respuesta: 'Sí.', variantes: [], categoria: 'Pagos', activa: false, usos: 0 },
];

describe('faqsDe', () => {
  it('limpia y recorta lo guardado; sin id, lo inventa; sin pregunta o respuesta, no vale', () => {
    const f = faqsDe([
      { pregunta: '  ¿Trabajan los sábados? ', respuesta: ' Sí. ', variantes: [' atienden sábados', '', 'atienden sábados'], categoria: 'planta' },
      { id: 'x', pregunta: '', respuesta: 'nada' },
      { id: 'y', pregunta: '¿Y esto?', respuesta: '', activa: false },
      'basura',
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ pregunta: '¿Trabajan los sábados?', respuesta: 'Sí.', variantes: ['atienden sábados'], categoria: 'planta', activa: true, usos: 0 });
    expect(f[0].id).toMatch(/^faq-/);
  });
});

describe('coincidenciaLiteral', () => {
  it('por palabras en común (sin tildes ni signos), contra la pregunta y sus variantes', () => {
    expect(coincidenciaLiteral('trabajan los sabados?', FAQS[0])).toBeGreaterThanOrEqual(0.9);
    expect(coincidenciaLiteral('abren sábados?', FAQS[0])).toBeGreaterThan(0.6);
    expect(coincidenciaLiteral('cuánto cuesta el m2', FAQS[0])).toBeLessThan(0.3);
  });
});

describe('mejorCoincidencia', () => {
  it('con el modelo, la mejor por coseno sobre el umbral; ignora las apagadas', async () => {
    // Un «modelo» de juguete: vectores fijos por texto.
    const vectores: Record<string, number[]> = { 'sábados atienden?': [1, 0], '¿Trabajan los sábados?': [0.99, 0.14], 'atienden sábados': [1, 0], 'abren los sábados': [0.9, 0.43], '¿Dónde está la planta?': [0, 1], 'dirección de la planta': [0.1, 0.99], '¿Aceptan tarjeta?': [1, 0] };
    const embed = async (textos: string[]) => textos.map((t) => vectores[t] ?? [0.5, 0.5]);
    const m = await mejorCoincidencia(FAQS, 'sábados atienden?', embed);
    expect(m).toMatchObject({ faq: { id: 'sabados' }, coincidencia: 1, responde: true });
    const lejos = await mejorCoincidencia(FAQS, 'algo sin relación', embed);
    expect(lejos?.responde).toBe(false);
    expect(lejos!.coincidencia).toBeLessThan(UMBRAL_FAQ);
  });

  it('sin modelo, por palabras; y sin preguntas, nada', async () => {
    const m = await mejorCoincidencia(FAQS, 'dirección de la planta?', null);
    expect(m).toMatchObject({ faq: { id: 'planta' }, responde: true });
    expect(await mejorCoincidencia([], 'hola', null)).toBeNull();
  });
});
