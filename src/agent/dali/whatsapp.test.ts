import { codigoLegible, destinoDePrueba, estadoDeLinea, historialLegible, motivoDeCierre, plataformaLegible, saludDe, textoDePrueba, type SesionConsultable } from './whatsapp';

/**
 * WHATSAPP (A14): el estado de la línea sale del manager de sesiones (se
 * inyecta), la salud de los mensajes de hoy, el historial de los eventos
 * registrados y el mensaje de prueba solo puede ir a un número del equipo.
 */
const sesion = (parcial: Partial<SesionConsultable>): SesionConsultable => ({
  existe: () => false,
  lista: () => false,
  vinculando: () => false,
  aparcada: () => false,
  conQr: () => false,
  ...parcial,
});

describe('estadoDeLinea', () => {
  it('sin número configurado → «sin-numero»; sin socket → «desconectado»', () => {
    expect(estadoDeLinea('', sesion({}))).toBe('sin-numero');
    expect(estadoDeLinea('51949376824', sesion({}))).toBe('desconectado');
  });

  it('lista → conectado; primer login tras escanear → vinculando', () => {
    expect(estadoDeLinea('51949376824', sesion({ existe: () => true, lista: () => true }))).toBe('conectado');
    expect(estadoDeLinea('51949376824', sesion({ existe: () => true, vinculando: () => true }))).toBe('vinculando');
  });

  it('aparcada o con QR esperando → requiere-vincular; socket vivo sin abrir → conectando', () => {
    expect(estadoDeLinea('51949376824', sesion({ existe: () => true, aparcada: () => true }))).toBe('requiere-vincular');
    expect(estadoDeLinea('51949376824', sesion({ existe: () => true, conQr: () => true }))).toBe('requiere-vincular');
    expect(estadoDeLinea('51949376824', sesion({ existe: () => true }))).toBe('conectando');
  });
});

describe('lo legible', () => {
  it('plataforma de las creds → como la conoce la gente', () => {
    expect(plataformaLegible('smba')).toBe('WhatsApp Business (Android)');
    expect(plataformaLegible('iphone')).toBe('iPhone');
    expect(plataformaLegible('android')).toBe('Android');
    expect(plataformaLegible(undefined)).toBeUndefined();
    expect(plataformaLegible('raro')).toBe('raro');
  });

  it('el código de vinculación va en dos bloques de cuatro', () => {
    expect(codigoLegible('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(codigoLegible('ABCD-EFGH')).toBe('ABCD-EFGH');
  });

  it('el motivo de un cierre, por código de WhatsApp', () => {
    expect(motivoDeCierre(428, 'Connection Terminated')).toBe('Se cortó la conexión (¿el teléfono se quedó sin internet?)');
    expect(motivoDeCierre(440, undefined)).toBe('Otra instancia abrió la sesión con este número');
    expect(motivoDeCierre(515, undefined)).toBe('WhatsApp pidió reiniciar la conexión');
    expect(motivoDeCierre(undefined, 'Socket timeout')).toBe('Socket timeout');
    expect(motivoDeCierre(undefined, undefined)).toBe('Sin motivo informado');
  });
});

describe('saludDe', () => {
  const mensajes = [
    { conversationId: 'c1', role: 'customer' as const, createdAt: new Date('2026-09-15T13:00:00Z') },
    { conversationId: 'c1', role: 'bot' as const, createdAt: new Date('2026-09-15T13:00:08Z') },
    { conversationId: 'c2', role: 'customer' as const, createdAt: new Date('2026-09-15T14:00:00Z') },
    { conversationId: 'c2', role: 'bot' as const, createdAt: new Date('2026-09-15T14:00:12Z') },
    { conversationId: 'c2', role: 'owner' as const, createdAt: new Date('2026-09-15T14:05:00Z') },
  ];

  it('cuenta lo de hoy por quién lo escribió y saca el tiempo de respuesta', () => {
    expect(saludDe('conectado', mensajes, 0)).toEqual({ nivel: 'optima', mensajesHoy: 5, conversacionesHoy: 2, enviados: 2, recibidos: 2, fallidos: 0, tiempoRespuestaS: 12 }); // mediana alta de 8 y 12 s
  });

  it('con envíos fallidos la salud baja; sin conexión, es lo primero que se dice', () => {
    expect(saludDe('conectado', mensajes, 1).nivel).toBe('con-fallos');
    expect(saludDe('desconectado', mensajes, 0).nivel).toBe('sin-conexion');
    expect(saludDe('conectado', [], 0)).toMatchObject({ nivel: 'optima', mensajesHoy: 0, tiempoRespuestaS: null });
  });
});

describe('historialLegible', () => {
  const at = (iso: string) => new Date(iso);
  it('cada evento con su título, su detalle y su tono; los envíos fallidos no van a la línea de tiempo', () => {
    const eventos = historialLegible([
      { sessionId: 's', kind: 'send-failed', companyId: 'constroad', detail: 'timeout', at: at('2026-09-15T20:00:00Z') },
      { sessionId: 's', kind: 'reconnected', detail: 'tras 2 intento(s)', at: at('2026-09-15T13:14:00Z') },
      { sessionId: 's', kind: 'disconnected', code: 428, detail: 'Connection Terminated', at: at('2026-09-15T04:02:00Z') },
      { sessionId: 's', kind: 'test-message', actor: 'José', detail: '51902049935', at: at('2026-09-14T12:00:00Z') },
      { sessionId: 's', kind: 'restart-requested', actor: 'José', at: at('2026-09-14T11:59:00Z') },
      { sessionId: 's', kind: 'linked', detail: 'smba', at: at('2026-09-10T20:30:00Z') },
      { sessionId: 's', kind: 'connected', at: at('2026-09-10T20:31:00Z') },
      { sessionId: 's', kind: 'unlinked', code: 401, at: at('2026-09-10T20:00:00Z') },
      { sessionId: 's', kind: 'parked', detail: 'sin completar el login tras 6 intentos', at: at('2026-09-09T20:00:00Z') },
      { sessionId: 's', kind: 'logout-requested', actor: 'José', at: at('2026-09-09T19:00:00Z') },
    ]);
    expect(eventos.map((e) => `${e.tipo}|${e.titulo}|${e.detalle}|${e.tono}`)).toEqual([
      'reconnected|Conectado|Reconexión automática tras 2 intento(s)|ok',
      'disconnected|Desconectado|Se cortó la conexión (¿el teléfono se quedó sin internet?)|aviso',
      'test-message|Mensaje de prueba|A +51 902 049 935, pedido por José|info',
      'restart-requested|Reconexión pedida|Desde el panel, por José|info',
      'linked|Vinculado|Código escaneado desde WhatsApp Business (Android)|ok',
      'connected|Conectado|Sesión iniciada|ok',
      'unlinked|Desvinculado|El teléfono cerró la sesión: hay que volver a vincular|error',
      'parked|Sin poder conectar|sin completar el login tras 6 intentos|error',
      'logout-requested|Desconexión pedida|Desde el panel, por José|info',
    ]);
    expect(eventos[0].fecha).toBe('2026-09-15T13:14:00.000Z');
  });
});

describe('destinoDePrueba: solo a un número del equipo o de pruebas', () => {
  const permitidos = { miembros: ['51902049935', 'jose@constroad.com'], pruebas: ['+51 987 654 321'] };
  it('acepta el celular de un miembro o de la lista de pruebas, en cualquier formato', () => {
    expect(destinoDePrueba('902 049 935', permitidos)).toBe('51902049935');
    expect(destinoDePrueba('+51 902049935', permitidos)).toBe('51902049935');
    expect(destinoDePrueba('987654321', permitidos)).toBe('51987654321');
  });
  it('rechaza cualquier otro número (la línea no se usa para escribirle a extraños) y lo vacío', () => {
    expect(destinoDePrueba('999 999 999', permitidos)).toBeNull();
    expect(destinoDePrueba('', permitidos)).toBeNull();
    expect(destinoDePrueba('jose@constroad.com', permitidos)).toBeNull();
  });
});

describe('textoDePrueba', () => {
  it('se presenta, dice quién lo pidió y que no espera respuesta', () => {
    const t = textoDePrueba('CONSTROAD SAC', 'José', Date.parse('2026-09-15T20:15:00Z'));
    expect(t).toContain('soy Dali');
    expect(t).toContain('CONSTROAD SAC');
    expect(t).toContain('José');
    expect(t).toContain('15:15');
    expect(t).toContain('no espera respuesta');
  });
});
