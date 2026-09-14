import { numerosDe, respetaLosDatos } from './redaccion';

/**
 * «Redacta pero nunca inventa datos» se verifica: cada número de la frase
 * tiene que estar en la ficha o en la pregunta.
 */
describe('numerosDe', () => {
  it('lee miles y decimales en los dos estilos, teléfonos y fechas', () => {
    expect(numerosDe('1,563.75 m³')).toContain(1563.75);
    expect(numerosDe('1.563,75 m³')).toContain(1563.75);
    expect(numerosDe('tel 987654321.')).toContain(987654321);
    expect(numerosDe('13/09')).toEqual(expect.arrayContaining([13, 9]));
    expect(numerosDe('sin números')).toEqual([]);
  });
});

describe('respetaLosDatos', () => {
  const ficha = '👤 *FERNANDO COBEÑAS* · Globofast\nRUC 10412345678\nContacto: Fernando · 987654321\nÚltimos pedidos: 13/09 PISTA 91 m³; 30/08 LOSA 40 m³';

  it('acepta números de la ficha, en cualquier formato', () => {
    expect(respetaLosDatos('El teléfono de *COBEÑAS* es *987654321*.', ficha)).toBe(true);
    expect(respetaLosDatos('Su último pedido fue el 13/09: 91 m³.', ficha)).toBe(true);
    expect(respetaLosDatos('El RUC es 10412345678', ficha)).toBe(true);
  });

  it('rechaza un teléfono cambiado, un total inventado o un porcentaje calculado', () => {
    expect(respetaLosDatos('El teléfono es 987654322.', ficha)).toBe(false);
    expect(respetaLosDatos('En total le despachamos 131 m³.', ficha)).toBe(false);
    expect(respetaLosDatos('Es el 70 % del pedido.', ficha)).toBe(false);
  });

  it('un número de la pregunta también vale', () => {
    expect(respetaLosDatos('Los últimos 3 pedidos son…', ficha, 'dame los últimos 3 pedidos de cobeñas')).toBe(true);
  });

  it('una frase sin números siempre respeta', () => {
    expect(respetaLosDatos('No tiene correo registrado.', ficha)).toBe(true);
  });
});
