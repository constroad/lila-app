import { _resetRegistros, companyIdDe, confirmarRegistro, datosDeRegistro, iniciarRegistro, RegistroInvalido, RUBROS } from './registro';

/**
 * REGISTRO (P4→P6): la empresa se crea recién cuando la persona escribe el
 * código que le llegó a su WhatsApp; hasta entonces es un borrador en
 * memoria (15 min). Solo el rubro Asfalto tiene pack hoy; los demás se ven y
 * no se eligen. El companyId sale del nombre y no pisa a nadie.
 */
beforeEach(() => _resetRegistros());

describe('datosDeRegistro', () => {
  it('normaliza el celular a 51…, recorta textos y usa «Dali» si no ponen nombre a la asistente', () => {
    expect(datosDeRegistro({ negocio: '  Asfaltos del Sur ', rubro: 'asphalt', zona: 'Ica', nombre: 'Ana Paredes', whatsapp: '987 111 222', asistente: '' })).toEqual({
      negocio: 'Asfaltos del Sur',
      rubro: 'asphalt',
      zona: 'Ica',
      nombre: 'Ana Paredes',
      whatsapp: '51987111222',
      asistente: 'Dali',
    });
  });

  it('rechaza lo que falta o no vale: nombre corto, rubro sin pack, celular que no es peruano', () => {
    const base = { negocio: 'Asfaltos del Sur', rubro: 'asphalt', zona: 'Ica', nombre: 'Ana', whatsapp: '987111222', asistente: 'Dali' };
    expect(() => datosDeRegistro({ ...base, negocio: 'A' })).toThrow(RegistroInvalido);
    expect(() => datosDeRegistro({ ...base, rubro: 'restaurant' })).toThrow(/todavía/);
    expect(() => datosDeRegistro({ ...base, whatsapp: '12345' })).toThrow(RegistroInvalido);
    expect(() => datosDeRegistro({ ...base, zona: '' })).toThrow(RegistroInvalido);
  });

  it('los rubros: asfalto disponible, el resto todavía no', () => {
    expect(RUBROS.map((r) => `${r.id}:${r.disponible}`)).toEqual(['asphalt:true', 'restaurant:false', 'grifo:false', 'lubricentro:false', 'otro:false']);
  });
});

describe('companyIdDe', () => {
  it('es el nombre en minúsculas sin tildes ni símbolos, y con sufijo si ya existe', () => {
    expect(companyIdDe('Asfaltos del Sur S.A.C.', () => false)).toBe('asfaltos-del-sur-sac');
    expect(companyIdDe('Constroad', (id) => id === 'constroad')).toBe('constroad-2');
    expect(companyIdDe('Constroad', (id) => id === 'constroad' || id === 'constroad-2')).toBe('constroad-3');
  });
});

describe('iniciar y confirmar', () => {
  const datos = { negocio: 'Asfaltos del Sur', rubro: 'asphalt', zona: 'Ica', nombre: 'Ana Paredes', whatsapp: '987111222', asistente: 'Sol' };

  it('el borrador queda con un token y un código en el log; el mismo celular no puede pedir otro enseguida', () => {
    const r = iniciarRegistro(datos, { generar: () => '424242', ahoraMs: 1_000 });
    expect(r.token).toHaveLength(24);
    expect(r.reintentoEnMs).toBe(30_000);
    expect(() => iniciarRegistro(datos, { ahoraMs: 2_000 })).toThrow(/Espera/);
  });

  it('con el código correcto crea la empresa (una sola vez) y devuelve al dueño; con uno incorrecto, no', async () => {
    const creadas: unknown[] = [];
    const crear = async (d: ReturnType<typeof datosDeRegistro>) => {
      creadas.push(d);
      return { id: 'm1', companyId: 'asfaltos-del-sur', identity: d.whatsapp, name: d.nombre, role: 'owner' as const };
    };
    const { token } = iniciarRegistro(datos, { generar: () => '424242', ahoraMs: 1_000 });
    expect(await confirmarRegistro(token, '000000', { crear, ahoraMs: 2_000 })).toEqual({ ok: false, motivo: 'incorrecto' });
    const ok = await confirmarRegistro(token, '424242', { crear, ahoraMs: 3_000 });
    expect(ok).toEqual({ ok: true, miembro: { id: 'm1', companyId: 'asfaltos-del-sur', identity: '51987111222', name: 'Ana Paredes', role: 'owner' } });
    expect(creadas).toHaveLength(1);
    expect(await confirmarRegistro(token, '424242', { crear, ahoraMs: 4_000 })).toEqual({ ok: false, motivo: 'sin-registro' }); // un solo uso
  });

  it('el código vence a los 10 minutos y se quema a los cinco intentos', async () => {
    const crear = async () => ({ id: 'm1', companyId: 'x', identity: '51987111222', name: 'Ana', role: 'owner' as const });
    const { token } = iniciarRegistro(datos, { generar: () => '424242', ahoraMs: 1_000 });
    expect(await confirmarRegistro(token, '424242', { crear, ahoraMs: 1_000 + 11 * 60_000 })).toEqual({ ok: false, motivo: 'vencido' });
    const { token: t2 } = iniciarRegistro({ ...datos, whatsapp: '987111223' }, { generar: () => '424242', ahoraMs: 1_000 });
    for (let i = 0; i < 4; i += 1) expect((await confirmarRegistro(t2, '111111', { crear, ahoraMs: 2_000 })).ok).toBe(false);
    expect(await confirmarRegistro(t2, '111111', { crear, ahoraMs: 2_000 })).toEqual({ ok: false, motivo: 'bloqueado' });
    expect(await confirmarRegistro(t2, '424242', { crear, ahoraMs: 2_000 })).toEqual({ ok: false, motivo: 'sin-registro' });
  });
});
