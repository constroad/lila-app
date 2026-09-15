import { TEMAS, menuAyuda, temaPorPalabra, textoTema } from './ayuda';

/** La ayuda por niveles: menú corto, un tema por número o por palabra. */
describe('ayuda', () => {
  it('el menú es corto y numera los seis temas', () => {
    const m = menuAyuda();
    expect(m.split('\n').length).toBeLessThanOrEqual(11);
    TEMAS.forEach((t, i) => expect(m).toContain(`${i + 1}. ${t.titulo}`));
    expect(m).toContain('Responde con el número');
  });

  it('cada tema trae sus ejemplos y cómo seguir; «cómo funciona» trae lo transversal', () => {
    expect(textoTema(1)).toContain('*2. Planta*');
    expect(textoTema(1)).toContain('• cuántos agregados llegaron hoy (por proveedor)');
    expect(textoTema(1)).toContain('Otro tema: responde su número.');
    expect(textoTema(5)).toContain('@lila off');
    expect(textoTema(5)).toContain('Responder');
    expect(textoTema(5)).toContain('No respondo precios');
    expect(textoTema(9)).toBe(menuAyuda());
  });

  it('«ayuda clima» va directo al tema; «ayuda» solo, al menú', () => {
    expect(temaPorPalabra('@lila ayuda clima')).toBe(3);
    expect(temaPorPalabra('ayuda con los certificados')).toBe(2);
    expect(temaPorPalabra('ayuda de planta')).toBe(1);
    expect(temaPorPalabra('menu clientes')).toBe(4);
    expect(temaPorPalabra('ayuda')).toBeNull();
    expect(temaPorPalabra('ayuda con algo raro')).toBeNull();
  });

  it('tuteo peruano, sin voseo', () => {
    const todo = [menuAyuda(), ...TEMAS.map((_, i) => textoTema(i))].join('\n');
    expect(todo).not.toMatch(/\b(decime|respondé|mantené|probá|podés|escribime)\b/);
  });
});
