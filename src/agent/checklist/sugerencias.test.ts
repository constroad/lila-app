import {
  VIGENCIA_MS,
  _resetPropuestas,
  decidir,
  esVoto,
  pendientes,
  proponer,
  propuestasDelPedido,
  yaPropuesta,
} from './sugerencias';

/**
 * UNA PERSONA EN EL MEDIO. El agente propone en el grupo de operaciones y solo
 * con un «1» humano sale al grupo real. Estos tests fijan que el «1» no pueda
 * aprobar más de lo que se propuso, ni dos veces, ni fuera de tiempo.
 */
const base = {
  tipo: 'aviso-planta' as const,
  pedidoId: 'p1',
  firma: 'p1|aviso-produccion',
  destino: '120363288945205546@g.us',
  nombreDestino: 'Inframaq Planta',
  texto: '📢 Producción programada…',
};

beforeEach(() => _resetPropuestas());

describe('proponer y decidir', () => {
  it('un «1» aprueba la propuesta pendiente más reciente', () => {
    proponer(base, 1_000);
    const segunda = proponer({ ...base, tipo: 'checklist-admin', firma: 'p1|x' }, 2_000);

    const decidida = decidir('1', 'jose@s.whatsapp.net', 3_000);

    expect(decidida?.id).toBe(segunda.id);
    expect(decidida?.estado).toBe('aprobada');
    expect(decidida?.decididaPor).toBe('jose@s.whatsapp.net');
    // La anterior sigue esperando: no se pierde, se ve en el grupo.
    expect(pendientes(3_000).map((p) => p.id)).toEqual(['1']);
  });

  it('un «3» descarta', () => {
    proponer(base, 1_000);

    expect(decidir('3', 'x', 2_000)?.estado).toBe('descartada');
    expect(pendientes(2_000)).toEqual([]);
  });

  it('un «1» suelto, sin propuesta pendiente, no aprueba nada', () => {
    expect(decidir('1', 'x')).toBeNull();
  });

  it('solo «1» y «3» son votos; cualquier otra cosa se ignora', () => {
    proponer(base, 1_000);

    for (const otro of ['si', 'ok', '11', '1 ', ' 3', 'uno', '']) {
      // «1 » y « 3» con espacios SÍ cuentan: `trim`. El resto no.
      const esperado = otro.trim() === '1' || otro.trim() === '3';
      expect(esVoto(otro)).toBe(esperado);
    }
    expect(decidir('ok', 'x', 2_000)).toBeNull();
    expect(pendientes(2_000)).toHaveLength(1);
  });

  it('una propuesta ya decidida no se decide otra vez', () => {
    proponer(base, 1_000);
    decidir('1', 'x', 2_000);

    expect(decidir('1', 'y', 3_000)).toBeNull();
  });
});

describe('vigencia y repetición', () => {
  it('a las 6 h sin respuesta vence y ya no se puede aprobar', () => {
    proponer(base, 0);

    expect(decidir('1', 'x', VIGENCIA_MS + 1)).toBeNull();
  });

  it('lo ya propuesto no se vuelve a proponer… salvo que haya vencido', () => {
    proponer(base, 0);
    expect(yaPropuesta('aviso-planta', base.firma, 1_000)).toBe(true);
    // Descartada también cuenta: la persona ya dijo que no.
    decidir('3', 'x', 1_000);
    expect(yaPropuesta('aviso-planta', base.firma, 2_000)).toBe(true);

    _resetPropuestas();
    proponer(base, 0);
    // Vencida sin respuesta: si el hecho sigue faltando, se insiste.
    expect(yaPropuesta('aviso-planta', base.firma, VIGENCIA_MS + 1)).toBe(false);
  });

  it('cuenta las propuestas por pedido y tipo, para el presupuesto de ruido', () => {
    proponer(base, 0); // aviso-planta, p1
    proponer({ ...base, tipo: 'checklist-admin', firma: 'a' }, 0);
    proponer({ ...base, tipo: 'checklist-admin', firma: 'b' }, 0);
    proponer({ ...base, tipo: 'checklist-admin', firma: 'c', pedidoId: 'p2' }, 0);

    expect(propuestasDelPedido('checklist-admin', 'p1')).toBe(2);
    expect(propuestasDelPedido('aviso-planta', 'p1')).toBe(1);
    expect(propuestasDelPedido('checklist-admin', 'p2')).toBe(1);
  });
});
