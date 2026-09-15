import { diaPeruano, instanteArranque, MAX_AVISOS_POR_DIA } from './tiempo';
import { _resetAlmacen, mensajesDesde, observados, recordarMensaje, MAX_MENSAJES, VENTANA_MS } from './almacen';

/**
 * Las piezas del detector que se pueden probar sin base ni socket: el cálculo
 * del arranque —que es donde este proyecto se quema siempre— y la ventana de
 * observación.
 */

describe('el instante del arranque', () => {
  /**
   * EL BUG #1 DEL CATÁLOGO. Sin el offset explícito de Lima, el proceso
   * interpreta la hora en SU zona: en la mini (UTC-5) daría bien por casualidad
   * y en un runner UTC se correría 5 horas — el agente contaría mal el tiempo
   * que falta y avisaría tarde o temprano de más.
   */
  it('se ancla a Lima y no a la zona del proceso', () => {
    const ms = instanteArranque('2026-09-10', '04:00')!;
    expect(new Date(ms).toISOString()).toBe('2026-09-10T09:00:00.000Z');
  });

  it('un arranque de madrugada sigue siendo de ese día', () => {
    const ms = instanteArranque('2026-09-10', '00:20')!;
    expect(new Date(ms).toISOString()).toBe('2026-09-10T05:20:00.000Z');
  });

  it('una fecha u hora inválida devuelve null en vez de una fecha inventada', () => {
    expect(instanteArranque('2026-09-10', '25:00')).toBeNull();
    expect(instanteArranque('10/09/2026', '04:00')).toBeNull();
    expect(instanteArranque('2026-09-10', '')).toBeNull();
    expect(instanteArranque('', '04:00')).toBeNull();
  });
});

describe('el día peruano de un instante', () => {
  it('las 4am de Lima son ESE día, no el anterior', () => {
    expect(diaPeruano(Date.parse('2026-09-10T09:00:00.000Z'))).toBe('2026-09-10');
  });

  it('la medianoche de Lima cae del lado correcto', () => {
    expect(diaPeruano(Date.parse('2026-09-10T05:00:00.000Z'))).toBe('2026-09-10');
    expect(diaPeruano(Date.parse('2026-09-10T04:59:00.000Z'))).toBe('2026-09-09');
  });
});

describe('la ventana de observación', () => {
  beforeEach(() => _resetAlmacen());

  it('devuelve solo lo dicho desde que existe el pedido', () => {
    const grupo = '120363288945205546@g.us';
    const base = 1_000_000_000_000;
    recordarMensaje(grupo, { texto: 'viejo', autor: 'a', ts: base, esPropio: false });
    recordarMensaje(grupo, { texto: 'nuevo', autor: 'b', ts: base + 3600_000, esPropio: false });

    expect(mensajesDesde(grupo, base + 1000).map((m) => m.texto)).toEqual(['nuevo']);
  });

  /**
   * Un «cuadrilla lista» de anteayer no confirma la producción de mañana, y la
   * mini son 8 GB compartidos con producción: la memoria va acotada por los dos
   * lados.
   */
  it('descarta lo que sale de la ventana', () => {
    const grupo = 'g@g.us';
    const base = 1_000_000_000_000;
    recordarMensaje(grupo, { texto: 'antiguo', autor: 'a', ts: base, esPropio: false });
    recordarMensaje(grupo, {
      texto: 'reciente',
      autor: 'b',
      ts: base + VENTANA_MS + 1000,
      esPropio: false,
    });

    expect(observados(grupo)).toBe(1);
  });

  it('nunca guarda más que el tope', () => {
    const grupo = 'g@g.us';
    for (let i = 0; i < MAX_MENSAJES + 40; i += 1) {
      recordarMensaje(grupo, { texto: `m${i}`, autor: 'a', ts: 1_000_000 + i, esPropio: false });
    }
    expect(observados(grupo)).toBe(MAX_MENSAJES);
  });

  it('un grupo que no se escucha no acumula nada', () => {
    expect(mensajesDesde('otro@g.us', 0)).toEqual([]);
    expect(observados('otro@g.us')).toBe(0);
  });

  it('observar no revienta con basura', () => {
    expect(() => recordarMensaje('', { texto: 'x', autor: 'a', ts: 1, esPropio: false })).not.toThrow();
  });
});

it('el presupuesto de avisos es conservador en F1', () => {
  // El modo de falla que mata estos proyectos no es equivocarse: es hablar de
  // más. Tres por día de producción, y solo si el texto cambió.
  expect(MAX_AVISOS_POR_DIA).toBe(3);
});

describe('enHorarioDeOficina — las menciones se recuerdan cuando la gente carga pedidos', () => {
  it('de 08:00 a 19:00 en Lima, y no a las 20:40 ni a las 3', async () => {
    const { enHorarioDeOficina } = await import('./detector');
    const lima = (hora: number) => Date.UTC(2026, 8, 14, hora + 5, 40); // Lima = UTC-5
    expect(enHorarioDeOficina(lima(8))).toBe(true);
    expect(enHorarioDeOficina(lima(15))).toBe(true);
    expect(enHorarioDeOficina(lima(18))).toBe(true);
    expect(enHorarioDeOficina(lima(19))).toBe(false);
    expect(enHorarioDeOficina(lima(20))).toBe(false);
    expect(enHorarioDeOficina(lima(3))).toBe(false);
  });
});

describe('dominiosConfirmadosEnBloque — responder «sí, está confirmado» al checklist lo cierra entero', () => {
  it('cierra la parte cuyo mensaje se cita, del mismo día, y nada más', async () => {
    const { dominiosConfirmadosEnBloque } = await import('./detector');
    const { _resetPropuestas, proponer, anotarMensaje } = await import('./sugerencias');
    _resetPropuestas();
    const campo = proponer({ tipo: 'checklist-admin', fecha: '2026-09-15', firma: 'x', destino: 'g@g.us', nombreDestino: 'admin', texto: '…' }, 1_000);
    anotarMensaje(campo.id, 'MSG-CAMPO');
    const planta = proponer({ tipo: 'checklist-planta', fecha: '2026-09-16', firma: 'y', destino: 'p@g.us', nombreDestino: 'planta', texto: '…' }, 1_000);
    anotarMensaje(planta.id, 'MSG-PLANTA-16');
    const mensajes = [
      { texto: 'Si está confirmado. Gracias por el recordatorio ☺️', autor: 'globofast@lid', ts: 2_000, esPropio: false, citaId: 'MSG-CAMPO' },
      { texto: 'todo listo', autor: 'x@lid', ts: 2_100, esPropio: false, citaId: 'MSG-PLANTA-16' }, // otro día
      { texto: 'todo listo', autor: 'x@lid', ts: 2_200, esPropio: false }, // sin cita: no se sabe a qué
      { texto: 'todo listo', autor: 'bot@lid', ts: 2_300, esPropio: true, citaId: 'MSG-CAMPO' }, // propio: no
    ];
    expect([...dominiosConfirmadosEnBloque(mensajes, '2026-09-15')]).toEqual(['obra']);
    expect([...dominiosConfirmadosEnBloque(mensajes, '2026-09-16')]).toEqual(['planta']);
  });
});
