import {

  anotarTextoPublicado,
  plantaYaAvisada,
  _resetPropuestas,
  anotarMensaje,
  cerrarSuperadas,
  decidir,
  esVoto,
  hidratarPropuestas,
  pendientes,
  porMensaje,
  proponer,
  vencidasAhora,
  VIGENCIA_MS,
  yaEnviada,
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

describe('plantaYaAvisada — el aviso va antes que el checklist', () => {
  it('solo cuenta un aviso APROBADO del día; uno vencido o pendiente no es un aviso', () => {
    const firma = '2026-09-16|04:30 Globofast Solkali 200|aviso';
    expect(plantaYaAvisada(firma)).toBe(false);
    const pendiente = proponer({ tipo: 'aviso-planta', fecha: '2026-09-16', firma, destino: 'p@g.us', nombreDestino: 'planta', texto: '…' }, 1_000);
    expect(plantaYaAvisada(firma)).toBe(false);
    pendiente.estado = 'vencida';
    expect(plantaYaAvisada(firma)).toBe(false);
    const manual = proponer({ tipo: 'aviso-planta', fecha: '2026-09-16', firma: `${firma}|manual|2000`, destino: 'p@g.us', nombreDestino: 'planta', texto: '…' }, 2_000);
    manual.estado = 'aprobada';
    expect(plantaYaAvisada(firma)).toBe(true);
  });
});

describe('decidir por el TEXTO citado cuando el id no llegó', () => {
  it('19:21 del 15/09: envío encolado, sin msgId; el «1» citando el texto aprueba igual', () => {
    _resetPropuestas();
    const p = proponer({ tipo: 'aviso-planta', fecha: '2026-09-16', firma: 'f', destino: 'p@g.us', nombreDestino: 'planta', texto: '📢 Producción programada — miércoles 16/09' }, 1_000);
    anotarTextoPublicado(p.id, '📢 *Producción programada — miércoles 16/09*\n\n• 04:30 — *Globofast Solkali* (CONSORCIO LOMAS) · 225 m³ · reunión 04:00\n\n📨 Para «Inframaq Planta»: responde…');
    // Sin id: solo el texto que WhatsApp manda con la cita (puede venir con espacios distintos).
    expect(decidir({ voto: '1', citaMsgId: 'id-que-nadie-anoto', citaTexto: '📢 *Producción programada — miércoles 16/09*\n\n• 04:30 — *Globofast Solkali* (CONSORCIO LOMAS) · 225 m³ · reunión 04:00\n\n📨 Para «Inframaq Planta»: responde…', quien: 'jose', esAprobador: true }, 2_000)).toMatchObject({ ok: true });
    expect(p.estado).toBe('aprobada');
    // Una propuesta de ANTES (sin texto publicado guardado) se reconoce por su cuerpo, que es el comienzo del mensaje.
    const vieja = proponer({ tipo: 'checklist-planta', fecha: '2026-09-16', firma: 'g', destino: 'p@g.us', nombreDestino: 'planta', texto: '⏰ *Planta, sigue sin confirmar* — miércoles 16/09 · 04:30 Globofast Solkali 200 m³' }, 1_000);
    expect(decidir({ voto: '3', citaMsgId: 'otro-id', citaTexto: '⏰ *Planta, sigue sin confirmar* — miércoles 16/09 · 04:30 Globofast Solkali 200 m³ · arranca en 11 h\nSegún Portal…\n📨 Para «Inframaq Planta»: responde…', quien: 'jose', esAprobador: true }, 2_000)).toMatchObject({ ok: true });
    expect(vieja.estado).toBe('descartada');
    // Un texto que no es de ninguna propuesta sigue siendo cita desconocida; uno muy corto tampoco cuenta.
    expect(decidir({ voto: '1', citaMsgId: 'x', citaTexto: 'Hola, ¿cómo va?', quien: 'jose', esAprobador: true }, 2_000)).toMatchObject({ ok: false, motivo: 'cita-desconocida' });
  });
});

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
    hidratarPropuestas([{ ...base, id: 'guardada', creadaMs: 1_000, estado: 'pendiente', msgId: 'MSG-G' }], 2_000);

    expect(porMensaje('MSG-G')?.id).toBe('guardada');
    expect(decidir({ voto: '1', citaMsgId: 'MSG-G', ...admin }, 2_000).ok).toBe(true);
  });

  // 14/09, 21:20 y 21:40: cada reinicio volvía a «vencer» las mismas tres propuestas y lo avisaba.
  it('rehidratar vence en silencio lo que ya venció, y lo devuelve para persistirlo; después ya no «vence» otra vez', () => {
    const vencidas = hidratarPropuestas(
      [
        { ...base, id: 'vieja', creadaMs: 0, estado: 'pendiente' },
        { ...base, id: 'fresca', firma: 'otra', creadaMs: VIGENCIA_MS, estado: 'pendiente' },
      ],
      VIGENCIA_MS + 1
    );
    expect(vencidas.map((p) => p.id)).toEqual(['vieja']);
    expect(vencidas[0].estado).toBe('vencida');
    expect(vencidasAhora(VIGENCIA_MS + 2).map((p) => p.id)).toEqual([]);
  });
});

describe('lo ya mandado no se vuelve a proponer (14/09 23:00 y 15/09 05:00: el aviso a planta salió tres veces)', () => {
  it('yaEnviada encuentra la aprobada aunque sea la manual; cerrarSuperadas cierra las demás pendientes del mismo día y destino', () => {
    _resetPropuestas();
    const firmaBase = '2026-09-15|abc:04:30:275|aviso';
    const automatica = proponer({ ...base, fecha: '2026-09-15', firma: firmaBase }, 0);
    const manual = proponer({ ...base, fecha: '2026-09-15', firma: `${firmaBase}|manual|123` }, 1_000);
    expect(yaEnviada('aviso-planta', firmaBase)).toBeUndefined();
    manual.estado = 'aprobada';
    expect(yaEnviada('aviso-planta', firmaBase)?.id).toBe(manual.id);
    const cerradas = cerrarSuperadas(manual, 2_000);
    expect(cerradas.map((p) => p.id)).toEqual([automatica.id]);
    expect(automatica.estado).toBe('descartada');
    expect(vencidasAhora(VIGENCIA_MS + 10)).toEqual([]); // ya no vence: no hay aviso que dar
  });

  it('una vencida no se vuelve a proponer sola', () => {
    _resetPropuestas();
    proponer(base, 0);
    expect(yaPropuesta('aviso-planta', base.firma, VIGENCIA_MS + 1)).toBe(false);
    expect(yaPropuesta('aviso-planta', base.firma, VIGENCIA_MS + 1, { incluirVencidas: true })).toBe(true);
  });
});
