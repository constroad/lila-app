import {
  VIGENCIA_MS,
  _resetPropuestas,
  anotarMensaje,
  decidir,
  esVoto,
  hidratarPropuestas,
  pendientes,
  porMensaje,
  proponer,
  vencidasAhora,
  yaPropuesta,
} from './sugerencias';

/**
 * UNA PERSONA EN EL MEDIO, Y LA CORRECTA. José, 13/09/2026: «estamos en un
 * grupo. ¿Qué pasa si el contador escribe inmediatamente después de este
 * mensaje?». Estos tests fijan que un «1» solo aprueba si CITA la propuesta,
 * si la propuesta sigue pendiente, y si quien lo escribe puede aprobar.
 */
const base = {
  tipo: 'aviso-planta' as const,
  fecha: '2026-09-13',
  firma: '2026-09-13|aviso',
  destino: '120363288945205546@g.us',
  nombreDestino: 'Inframaq Planta',
  texto: '📢 Producción programada…',
};

const admin = { quien: 'jose@s.whatsapp.net', esAprobador: true };
const contador = { quien: 'contador@s.whatsapp.net', esAprobador: false };

beforeEach(() => _resetPropuestas());

describe('decidir por cita', () => {
  it('un «1» citando la propuesta, de un admin, la aprueba', () => {
    const p = proponer(base, 1_000);
    anotarMensaje(p.id, 'MSG-1');

    const r = decidir({ voto: '1', citaMsgId: 'MSG-1', ...admin }, 2_000);

    expect(r.ok && r.propuesta.id).toBe(p.id);
    expect(r.ok && r.propuesta.estado).toBe('aprobada');
    expect(r.ok && r.propuesta.decididaPor).toBe('jose@s.whatsapp.net');
  });

  it('un «1» SIN cita no aprueba nada, aunque haya una pendiente', () => {
    const p = proponer(base, 1_000);
    anotarMensaje(p.id, 'MSG-1');

    const r = decidir({ voto: '1', citaMsgId: '', ...admin }, 2_000);

    expect(r).toEqual({ ok: false, motivo: 'sin-cita' });
    expect(pendientes(2_000)).toHaveLength(1);
  });

  it('un «1» citando OTRO mensaje tampoco', () => {
    const p = proponer(base, 1_000);
    anotarMensaje(p.id, 'MSG-1');

    expect(decidir({ voto: '1', citaMsgId: 'MSG-DEL-CONTADOR', ...admin }, 2_000)).toEqual({
      ok: false,
      motivo: 'cita-desconocida',
    });
  });

  it('el contador no aprueba, aunque cite bien', () => {
    const p = proponer(base, 1_000);
    anotarMensaje(p.id, 'MSG-1');

    expect(decidir({ voto: '1', citaMsgId: 'MSG-1', ...contador }, 2_000)).toEqual({
      ok: false,
      motivo: 'no-aprobador',
    });
    expect(p.estado).toBe('pendiente');
  });

  it('con dos propuestas, la cita elige cuál — no «la última»', () => {
    const a = proponer(base, 1_000);
    anotarMensaje(a.id, 'MSG-A');
    const b = proponer({ ...base, tipo: 'checklist-admin', firma: 'x' }, 2_000);
    anotarMensaje(b.id, 'MSG-B');

    const r = decidir({ voto: '3', citaMsgId: 'MSG-A', ...admin }, 3_000);

    expect(r.ok && r.propuesta.id).toBe(a.id);
    expect(a.estado).toBe('descartada');
    expect(b.estado).toBe('pendiente');
  });

  it('una propuesta ya decidida no se decide otra vez', () => {
    const p = proponer(base, 1_000);
    anotarMensaje(p.id, 'MSG-1');
    decidir({ voto: '1', citaMsgId: 'MSG-1', ...admin }, 2_000);

    expect(decidir({ voto: '3', citaMsgId: 'MSG-1', ...admin }, 3_000)).toEqual({
      ok: false,
      motivo: 'no-pendiente',
    });
    expect(p.estado).toBe('aprobada');
  });

  it('solo «1» y «3» son votos', () => {
    for (const [texto, esperado] of [['1', true], ['3', true], [' 1 ', true], ['11', false], ['si', false], ['', false]] as const) {
      expect(esVoto(texto)).toBe(esperado);
    }
  });
});

describe('vigencia, repetición y memoria', () => {
  it('a las 6 h sin respuesta vence, se avisa una vez, y ya no se puede aprobar', () => {
    const p = proponer(base, 0);
    anotarMensaje(p.id, 'MSG-1');

    expect(vencidasAhora(VIGENCIA_MS + 1).map((v) => v.id)).toEqual([p.id]);
    expect(vencidasAhora(VIGENCIA_MS + 2)).toEqual([]);
    expect(decidir({ voto: '1', citaMsgId: 'MSG-1', ...admin }, VIGENCIA_MS + 3)).toEqual({
      ok: false,
      motivo: 'no-pendiente',
    });
  });

  it('lo ya propuesto no se vuelve a proponer… salvo que haya vencido', () => {
    proponer(base, 0);
    expect(yaPropuesta('aviso-planta', base.firma, 1_000)).toBe(true);
    expect(yaPropuesta('aviso-planta', base.firma, VIGENCIA_MS + 1)).toBe(false);
  });

  it('rehidratar reemplaza la memoria con lo guardado, y las citas siguen funcionando', () => {
    hidratarPropuestas([
      { ...base, id: 'guardada', creadaMs: 1_000, estado: 'pendiente', msgId: 'MSG-G' },
    ]);

    expect(porMensaje('MSG-G')?.id).toBe('guardada');
    expect(decidir({ voto: '1', citaMsgId: 'MSG-G', ...admin }, 2_000).ok).toBe(true);
  });
});
