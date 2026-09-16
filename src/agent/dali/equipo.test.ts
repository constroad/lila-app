import { CUPO_MIEMBROS, EquipoInvalido, invitacionDe, jidsDe, miembroLegible, quedaSinDueno } from './equipo';

/**
 * EQUIPO (A16): quién entra al panel y quién recibe los avisos. La invitación
 * se normaliza y valida antes de tocar la base; un miembro es «pendiente»
 * hasta su primer ingreso; el último dueño no se puede quitar ni degradar; y
 * los avisos van a los miembros con celular y los avisos activos.
 */
const ahora = Date.parse('2026-09-15T20:00:00Z');
const base = {
  id: 'm1',
  companyId: 'constroad',
  identity: '51903124919',
  name: 'José',
  role: 'owner' as const,
  receivesAlerts: true,
  lastLoginAt: new Date('2026-09-15T14:12:00Z'),
  createdAt: new Date('2026-09-01T00:00:00Z'),
};

describe('miembroLegible', () => {
  it('con ingreso registrado está activo; sin ingreso, pendiente desde que se lo invitó', () => {
    expect(miembroLegible(base, ahora)).toEqual({
      id: 'm1',
      nombre: 'José',
      identidad: '51903124919',
      rol: 'owner',
      recibeAvisos: true,
      pendiente: false,
      ultimoIngreso: '2026-09-15T14:12:00.000Z',
      invitadoEl: '2026-09-01T00:00:00.000Z',
    });
    expect(miembroLegible({ ...base, id: 'm2', lastLoginAt: undefined, createdAt: new Date('2026-09-13T20:00:00Z') }, ahora)).toMatchObject({
      pendiente: true,
      ultimoIngreso: undefined,
      invitadoEl: '2026-09-13T20:00:00.000Z',
    });
  });
});

describe('invitacionDe', () => {
  it('normaliza el celular (9 cifras → 51…) o el correo, y limpia el nombre', () => {
    expect(invitacionDe({ destino: '987 111 222', nombre: '  Carla Ríos ', rol: 'sales', recibeAvisos: true })).toEqual({
      identity: '51987111222',
      name: 'Carla Ríos',
      role: 'sales',
      receivesAlerts: true,
    });
    expect(invitacionDe({ destino: 'Ana@Constroad.com', nombre: 'Ana', rol: 'viewer', recibeAvisos: false })).toEqual({
      identity: 'ana@constroad.com',
      name: 'Ana',
      role: 'viewer',
      receivesAlerts: false,
    });
  });

  it('rechaza un destino que no es celular ni correo, un rol desconocido o un nombre vacío', () => {
    expect(() => invitacionDe({ destino: '12', nombre: 'X', rol: 'sales', recibeAvisos: true })).toThrow(EquipoInvalido);
    expect(() => invitacionDe({ destino: '987111222', nombre: 'X', rol: 'jefe', recibeAvisos: true })).toThrow(EquipoInvalido);
    expect(() => invitacionDe({ destino: '987111222', nombre: '   ', rol: 'sales', recibeAvisos: true })).toThrow(EquipoInvalido);
  });
});

describe('quedaSinDueno', () => {
  const equipo = [base, { ...base, id: 'm2', identity: '51987111222', name: 'Carla', role: 'sales' as const }];
  it('quitar o degradar al único dueño deja a la empresa sin dueño; a un vendedor, no', () => {
    expect(quedaSinDueno(equipo, 'm1')).toBe(true);
    expect(quedaSinDueno(equipo, 'm2')).toBe(false);
    expect(quedaSinDueno([...equipo, { ...base, id: 'm3', identity: 'otro@constroad.com' }], 'm1')).toBe(false);
  });
});

describe('jidsDe y el cupo', () => {
  it('avisa a los miembros con celular y avisos activos (el correo no recibe WhatsApp)', () => {
    const equipo = [
      base,
      { ...base, id: 'm2', identity: '51987111222', receivesAlerts: false },
      { ...base, id: 'm3', identity: 'ana@constroad.com' },
      { ...base, id: 'm4', identity: '51900000001' },
    ];
    expect(jidsDe(equipo)).toEqual(['51903124919@s.whatsapp.net', '51900000001@s.whatsapp.net']);
  });
  it('el piloto admite hasta cinco personas por empresa', () => {
    expect(CUPO_MIEMBROS).toBe(5);
  });
});
