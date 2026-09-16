import { actividadDe, avisosLegibles, estadoDeAsistente, filaDeEmpresa, resumenDeEmpresas, rubroLegible, sesionParaEntrar, type EmpresaAdmin } from './admin';
import type { SesionConsultable } from './whatsapp';

/**
 * LA CONSOLA DEL OPERADOR (S1/S2): cada empresa se resume con su línea, lo
 * que hace su asistente y su uso; la actividad reciente junta cinco fuentes
 * en una línea de tiempo; «entrar a su panel» es una sesión de dueño a
 * nombre del operador.
 */
const sesionCon = (listas: string[] = [], existentes: string[] = []): SesionConsultable => ({
  existe: (n) => existentes.includes(n) || listas.includes(n),
  lista: (n) => listas.includes(n),
  vinculando: () => false,
  aparcada: () => false,
  conQr: () => false,
});

describe('estadoDeAsistente', () => {
  const ahora = Date.parse('2026-09-16T15:00:00Z');
  it('atiende solo si está prendido, sin pausa y con la línea conectada', () => {
    expect(estadoDeAsistente({ enabled: true }, 'conectado', ahora)).toBe('atendiendo');
    expect(estadoDeAsistente({ enabled: true }, 'desconectado', ahora)).toBe('requiere-qr');
    expect(estadoDeAsistente({ enabled: true }, 'sin-numero', ahora)).toBe('sin-linea');
    expect(estadoDeAsistente({ enabled: true, pausedUntil: new Date(ahora + 60_000) }, 'conectado', ahora)).toBe('pausado');
    expect(estadoDeAsistente({ enabled: false }, 'conectado', ahora)).toBe('apagado');
    expect(estadoDeAsistente({ enabled: true, operador: { suspendida: true } }, 'conectado', ahora)).toBe('suspendida');
    expect(estadoDeAsistente(null, 'conectado', ahora)).toBe('apagado');
  });
});

describe('filaDeEmpresa y resumenDeEmpresas', () => {
  const ahora = Date.parse('2026-09-16T15:00:00Z');
  const fila = (companyId: string, sender: string, enabled: boolean): EmpresaAdmin =>
    filaDeEmpresa(
      {
        config: { companyId, vertical: 'asphalt', enabled },
        company: { name: companyId.toUpperCase(), whatsappConfig: { sender }, contactInfo: { city: 'Lima' }, createdAt: new Date('2026-09-01T12:00:00Z') },
        miembros: 2,
        ultimoMensaje: new Date(ahora - 180_000),
        mensajesMes: 612,
        limite: 1000,
      },
      sesionCon(['51949376824']),
      ahora
    );

  it('arma la fila con el número limpio, el estado de la línea y el del asistente', () => {
    expect(fila('constroad', '+51 949 376 824', true)).toEqual({
      companyId: 'constroad',
      nombre: 'CONSTROAD',
      ciudad: 'Lima',
      vertical: 'asphalt',
      rubro: 'Asfalto',
      linea: { numero: '51949376824', estado: 'conectado' },
      asistente: 'atendiendo',
      uso: { mensajesMes: 612, limite: 1000 },
      ultimoMensaje: new Date(ahora - 180_000).toISOString(),
      miembros: 2,
      creadaEl: '2026-09-01T12:00:00.000Z',
      suspendida: false,
    });
  });

  it('cuenta atendiendo, pausadas y sin conectar sobre las filas', () => {
    const filas = [fila('constroad', '51949376824', true), fila('inframaq', '51903124919', false), fila('grifo', '', true)];
    expect(resumenDeEmpresas(filas)).toEqual({ total: 3, atendiendo: 1, pausadas: 1, sinConectar: 2, suspendidas: 0 });
  });

  it('el rubro se lee corto y con mayúscula, aun si el vertical no está en la lista', () => {
    expect(rubroLegible('asphalt')).toBe('Asfalto');
    expect(rubroLegible('restaurant')).toBe('Restaurante');
    expect(rubroLegible('transport')).toBe('Transport');
    expect(rubroLegible('')).toBe('');
  });
});

describe('actividadDe', () => {
  it('junta escaladas, leads, ingresos, importaciones y la línea, de lo más nuevo a lo más viejo, con tope', () => {
    const actividad = actividadDe(
      {
        escaladas: [{ customerName: 'Luis Paredes', servicio: 'asfaltado', escalatedAt: new Date('2026-09-16T15:41:00Z') }],
        leads: [{ customerName: '', servicio: 'transporte', fecha: new Date('2026-09-16T14:00:00Z') }],
        ingresos: [
          { nombre: 'José', ultimoIngreso: '2026-09-16T14:12:00.000Z' },
          { nombre: 'Ana', ultimoIngreso: undefined },
        ],
        importaciones: [{ archivo: 'dali.xlsx', quien: 'José', total: 41, fecha: '2026-09-12T14:14:00.000Z' }],
        linea: [{ tipo: 'linked', titulo: 'Vinculado', detalle: 'Código escaneado', fecha: '2026-09-10T20:00:00.000Z', tono: 'ok' }],
      },
      4
    );
    expect(actividad.map((a) => `${a.tipo}:${a.fecha}`)).toEqual([
      'escalada:2026-09-16T15:41:00.000Z',
      'ingreso:2026-09-16T14:12:00.000Z',
      'lead:2026-09-16T14:00:00.000Z',
      'importacion:2026-09-12T14:14:00.000Z',
    ]);
    expect(actividad[0].detalle).toBe('Luis Paredes pidió hablar con alguien por asfaltado.');
    expect(actividad[2].detalle).toBe('Un cliente, transporte.');
    expect(actividad[3].detalle).toBe('41 elementos desde dali.xlsx, por José.');
  });
});

describe('avisosLegibles y sesionParaEntrar', () => {
  it('dice a dónde van los avisos', () => {
    expect(
      avisosLegibles(
        { canal: 'dueno', numeroDueno: '51902049935', casos: { leadNuevo: true, pideUrgente: true, fallo: true }, descanso: { activo: false, desde: '', hasta: '' } },
        ''
      )
    ).toBe('Al dueño (+51902049935)');
    expect(
      avisosLegibles({ canal: 'grupo', numeroDueno: '', casos: { leadNuevo: true, pideUrgente: true, fallo: true }, descanso: { activo: false, desde: '', hasta: '' } }, '123@g.us')
    ).toBe('Al grupo de la línea');
    expect(
      avisosLegibles({ canal: 'grupo', numeroDueno: '', casos: { leadNuevo: true, pideUrgente: true, fallo: true }, descanso: { activo: false, desde: '', hasta: '' } }, '')
    ).toBe('Sin destino');
  });

  it('la sesión para entrar es de dueño de esa empresa, firmada por el operador y con su identidad', () => {
    expect(sesionParaEntrar('inframaq', { companyId: '*', userId: 'op1', identity: '51902049935', name: 'José', role: 'operator' })).toEqual({
      id: 'operador:op1',
      companyId: 'inframaq',
      identity: '51902049935',
      name: 'José (Dali)',
      role: 'owner',
    });
  });
});
