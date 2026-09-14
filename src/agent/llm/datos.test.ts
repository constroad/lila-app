import { patronDeBusqueda } from './datos';

describe('patronDeBusqueda', () => {
  it('contiene todas las palabras, sin importar tildes, mayúsculas ni orden', () => {
    const p = patronDeBusqueda('cobeñas');
    expect(p.test('FERNANDO COBEÑAS')).toBe(true);
    expect(p.test('fernando cobenas')).toBe(true); // y al revés: «cobenas» encuentra a COBEÑAS
    expect(patronDeBusqueda('cobenas').test('FERNANDO COBEÑAS')).toBe(true);
    expect(patronDeBusqueda('los pinos consorcio').test('CONSORCIO LOS PINOS ')).toBe(true);
    expect(patronDeBusqueda('julio licas').test('JULIO LICAS')).toBe(true);
    expect(patronDeBusqueda('julio licas').test('JULIO PEREZ')).toBe(false);
    expect(patronDeBusqueda('petróleo').test('PETROLEO HIGHWAY')).toBe(true);
    expect(patronDeBusqueda('petroleo').test('PETRÓLEO HIGHWAY')).toBe(true);
  });

  it('lo que escribió la persona no es una regex, y sin palabras no encuentra nada', () => {
    expect(patronDeBusqueda('.*').test('cualquiera')).toBe(false);
    expect(patronDeBusqueda('(a|b)+').test('a')).toBe(false);
    expect(patronDeBusqueda('').test('cualquiera')).toBe(false);
    expect(patronDeBusqueda('arena (primaria)').test('ARENA PRIMARIA')).toBe(true);
  });
});
