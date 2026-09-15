import { fichaDe, cambiosDeFicha } from './negocio';

/**
 * LA FICHA DEL NEGOCIO (A7): lo guardado en `bot_configs.negocio` más lo que
 * ya sabe la empresa de Portal, limpio y con largos; al guardar, lo que llega
 * se mezcla campo a campo y la zona va al perfil (A6), que es la misma.
 */
describe('fichaDe', () => {
  it('sin nada guardado sale de la empresa de Portal y del perfil', () => {
    const f = fichaDe(undefined, { name: 'CONSTROAD SAC', ruc: '20601234567', address: 'Av. Las Torres s/n', phone: '014801928', email: 'ventas@constroad.com', whatsappConfig: { sender: '51949376824' } }, 'Lima y alrededores');
    expect(f).toEqual({
      nombreComercial: 'CONSTROAD SAC',
      descripcion: '',
      ruc: '20601234567',
      web: '',
      direccion: 'Av. Las Torres s/n',
      zona: 'Lima y alrededores',
      comoLlegar: '',
      contacto: { whatsapp: '51949376824', telefono: '014801928', correo: 'ventas@constroad.com', redSocial: '' },
      ofrece: [],
      noOfrece: [],
    });
  });

  it('lo guardado manda sobre lo de Portal y se recorta', () => {
    const f = fichaDe({ nombreComercial: ' CONSTROAD ', descripcion: 'x'.repeat(300), ruc: '20601234567', web: 'constroad.com', direccion: 'Planta en Cajamarquilla', comoLlegar: 'km 11.5', contacto: { telefono: '(01) 480-1928', correo: 'a@b.pe', redSocial: '@constroad.pe' }, ofrece: [' emulsiones', 'emulsiones', ''], noOfrece: ['alquiler de maquinaria'] }, { name: 'X' }, 'Lima');
    expect(f.nombreComercial).toBe('CONSTROAD');
    expect(f.descripcion).toHaveLength(240);
    expect(f.web).toBe('constroad.com');
    expect(f.contacto).toEqual({ whatsapp: '', telefono: '(01) 480-1928', correo: 'a@b.pe', redSocial: '@constroad.pe' });
    expect(f.ofrece).toEqual(['emulsiones']);
    expect(f.noOfrece).toEqual(['alquiler de maquinaria']);
  });
});

describe('cambiosDeFicha', () => {
  it('mezcla campo a campo, ignora lo que no se puede editar y separa la zona', () => {
    const actual = { nombreComercial: 'CONSTROAD', descripcion: 'vieja', contacto: { telefono: '1', correo: 'a@b.pe' } };
    const { negocio, zona } = cambiosDeFicha(actual, { descripcion: 'nueva', zona: 'Lima Norte', contacto: { whatsapp: '999', redSocial: '@x' }, ruc: '20601234567', ofrece: ['emulsiones'] });
    expect(negocio).toEqual({ nombreComercial: 'CONSTROAD', descripcion: 'nueva', ruc: '20601234567', web: '', direccion: '', comoLlegar: '', contacto: { telefono: '1', correo: 'a@b.pe', redSocial: '@x' }, ofrece: ['emulsiones'], noOfrece: [] });
    expect(zona).toBe('Lima Norte');
    expect(cambiosDeFicha(actual, {}).zona).toBeUndefined();
  });

  it('un RUC tiene 11 dígitos o no se guarda', () => {
    expect(cambiosDeFicha({}, { ruc: '123' }).negocio.ruc).toBe('');
    expect(cambiosDeFicha({}, { ruc: ' 20601234567 ' }).negocio.ruc).toBe('20601234567');
  });
});
