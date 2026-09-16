import { cambiosDeNotificaciones, EVENTOS_DE_AVISO, grupoLegible, NotificacionesInvalidas, notificacionesDe, textoDePruebaDeAviso } from './notificaciones';

/**
 * NOTIFICACIONES (A18): por dónde avisa Dali (el grupo de la línea o un
 * número), qué avisa (los tres casos reales) y el horario de descanso. Los
 * grupos salen del store de la sesión; el elegido es `ownerNotifyTarget`.
 */
const grupos = [
  { id: '120363@g.us', name: 'Ventas CONSTROAD', participants: ['51903124919@s.whatsapp.net', '51987111222@s.whatsapp.net'] },
  { id: '120364@g.us', name: undefined, participants: [] },
];

describe('notificacionesDe', () => {
  it('arma el canal, el grupo elegido (aunque ya no esté en la lista), el número, los casos y el descanso', () => {
    const n = notificacionesDe({ ownerNotifyTarget: '120363@g.us', avisos: { canal: 'grupo', numeroDueno: '51903124919', casos: { fallo: false } } }, grupos, '51949376824');
    expect(n.canal).toBe('grupo');
    expect(n.grupo).toEqual({ jid: '120363@g.us', nombre: 'Ventas CONSTROAD', miembros: 2 });
    expect(n.grupos.map((g) => g.nombre)).toEqual(['Ventas CONSTROAD', 'Grupo sin nombre']);
    expect(n.numeroDueno).toBe('51903124919');
    expect(n.casos).toEqual({ leadNuevo: true, pideUrgente: true, fallo: false });
    expect(n.descanso).toEqual({ activo: false, desde: '22:00', hasta: '07:00' });
    expect(n.linea).toBe('51949376824');
    expect(n.gruposDisponibles).toBe(true);

    const huerfano = notificacionesDe({ ownerNotifyTarget: '999@g.us' }, grupos, '51949376824');
    expect(huerfano.grupo).toEqual({ jid: '999@g.us', nombre: 'Grupo conectado desde Portal', miembros: 0 });
    expect(notificacionesDe({}, [], '').gruposDisponibles).toBe(false);
  });
});

describe('cambiosDeNotificaciones', () => {
  it('canal grupo exige un grupo de la lista; canal número exige un celular; el descanso, horas con forma', () => {
    expect(
      cambiosDeNotificaciones({ canal: 'grupo', grupoJid: '120363@g.us', casos: { leadNuevo: false }, descanso: { activo: true, desde: '21:30', hasta: '06:45' } }, grupos)
    ).toEqual({
      ownerNotifyTarget: '120363@g.us',
      avisos: { canal: 'grupo', casos: { leadNuevo: false }, descanso: { activo: true, desde: '21:30', hasta: '06:45' } },
    });
    expect(cambiosDeNotificaciones({ canal: 'dueno', numeroDueno: '903 124 919' }, grupos)).toEqual({ avisos: { canal: 'dueno', numeroDueno: '51903124919' } });
    expect(() => cambiosDeNotificaciones({ canal: 'grupo', grupoJid: '999@g.us' }, grupos)).toThrow(NotificacionesInvalidas);
    expect(() => cambiosDeNotificaciones({ canal: 'dueno', numeroDueno: '12' }, grupos)).toThrow(NotificacionesInvalidas);
    expect(() => cambiosDeNotificaciones({ descanso: { activo: true, desde: '25:00', hasta: '07:00' } }, grupos)).toThrow(NotificacionesInvalidas);
  });

  it('sin grupos cargados (la línea no está conectada) no se puede elegir grupo, pero sí lo demás', () => {
    expect(() => cambiosDeNotificaciones({ canal: 'grupo', grupoJid: '120363@g.us' }, [])).toThrow(/La línea no está conectada/);
    expect(cambiosDeNotificaciones({ casos: { fallo: false } }, [])).toEqual({ avisos: { casos: { fallo: false } } });
  });
});

describe('lo que ve la persona', () => {
  it('los eventos: tres reales con su ejemplo, dos que todavía no existen', () => {
    expect(EVENTOS_DE_AVISO.map((e) => `${e.id}:${e.disponible}`)).toEqual(['leadNuevo:true', 'pideUrgente:true', 'fallo:true', 'desconexion:false', 'resumen:false']);
    expect(EVENTOS_DE_AVISO[0].ejemplo).toContain('🧲');
  });

  it('el grupo se describe con nombre y cuántos son; el mensaje de prueba dice quién lo pidió', () => {
    expect(grupoLegible(grupos[0])).toEqual({ jid: '120363@g.us', nombre: 'Ventas CONSTROAD', miembros: 2 });
    const t = textoDePruebaDeAviso('CONSTROAD SAC', 'José');
    expect(t).toContain('prueba');
    expect(t).toContain('José');
    expect(t).toContain('CONSTROAD SAC');
  });
});
