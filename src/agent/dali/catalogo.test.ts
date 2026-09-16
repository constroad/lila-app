import { itemEnTexto, itemsDe, precioLegible, respuestaDePrecio } from './catalogo';

/**
 * EL CATÁLOGO (A12): lo que la empresa vende, para que Dali lo conozca. Los
 * precios solo se dicen si la empresa lo permite («Dali puede decir precios»).
 */
const ITEMS = itemsDe([
  { id: 'mac', sku: 'ASF-MAC-01', nombre: 'Mezcla asfáltica en caliente (MAC)', categoria: 'Mezcla asfáltica', unidad: 'm³', precio: 390, disponible: true, descripcion: 'Mezcla densa en caliente.' },
  { id: 'pol', sku: 'ASF-POL-03', nombre: 'Mezcla modificada con polímeros', categoria: 'Mezcla asfáltica', unidad: 'm³', precio: 480, disponible: false, descripcion: '' },
  { id: 'col', nombre: 'Colocación de asfalto 2"', categoria: 'Servicios', unidad: 'm²', disponible: true, descripcion: '' },
]);

describe('itemsDe', () => {
  it('limpia lo guardado: sin nombre no vale, precio numérico o nada, sku e id', () => {
    const items = itemsDe([{ nombre: '  Emulsión ', precio: '12.50', unidad: 'galón' }, { nombre: '', precio: 3 }, { id: 'x', nombre: 'Riego de liga', precio: 'gratis', disponible: false }]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ nombre: 'Emulsión', precio: 12.5, unidad: 'galón', disponible: true, categoria: '', sku: '' });
    expect(items[0].id).toMatch(/^item-/);
    expect(items[1]).toMatchObject({ id: 'x', nombre: 'Riego de liga', disponible: false });
    expect(items[1].precio).toBeUndefined();
  });
});

describe('itemEnTexto', () => {
  it('encuentra el ítem que nombra el mensaje, por las palabras de su nombre', () => {
    expect(itemEnTexto(ITEMS, 'cuánto cuesta la mezcla con polímeros?')?.id).toBe('pol');
    expect(itemEnTexto(ITEMS, 'precio del asfalto en caliente')?.id).toBe('mac');
    expect(itemEnTexto(ITEMS, 'cuánto sale la colocación')?.id).toBe('col');
    expect(itemEnTexto(ITEMS, 'cuánto cuesta')).toBeUndefined();
  });
});

describe('respuestaDePrecio', () => {
  it('con permiso: el precio referencial por unidad; agotado lo dice; sin precio, lo confirma el asesor', () => {
    expect(precioLegible(390)).toBe('S/ 390');
    expect(precioLegible(12.5)).toBe('S/ 12.50');
    expect(respuestaDePrecio(ITEMS[0], true)).toBe('Mezcla asfáltica en caliente (MAC): S/ 390 por m³, precio referencial que el asesor confirma con la cotización.');
    expect(respuestaDePrecio(ITEMS[1], true)).toBe('Mezcla modificada con polímeros: S/ 480 por m³ (referencial); por ahora está bajo pedido especial, el asesor te confirma disponibilidad.');
    expect(respuestaDePrecio(ITEMS[2], true)).toBe('Colocación de asfalto 2": el precio te lo confirma el asesor con la cotización.');
    expect(respuestaDePrecio(ITEMS[0], false)).toBeUndefined();
  });
});
