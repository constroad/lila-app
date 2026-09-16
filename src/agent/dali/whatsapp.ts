import { getBotConfigModel, getBotConversationMessageModel, getBotConversationModel } from '../../database/bot.models.js';
import { getCompanyModel } from '../../database/models.js';
import { quotaValidatorService } from '../../services/quota-validator.service.js';
import { diaPeruano } from '../checklist/tiempo.js';
import type { QrState } from '../../api/controllers/session.controller.simple.js';
import type { AuthAccountInfo } from '../../whatsapp/baileys/mongo-auth-state.js';
import { countSessionEvents, listSessionEvents, recordSessionEvent, type SessionEvent, type SessionEventKind } from '../../whatsapp/baileys/session-events.js';
import { miembrosDeEmpresa } from './miembros.js';
import { tiempoDeRespuesta, type MensajeParaInicio } from './inicio.js';

/**
 * WHATSAPP (A14, spec DALI §4 `whatsapp`): la línea desde la que Dali atiende.
 * El estado sale del manager de sesiones de lila (Baileys), que se INYECTA
 * (`SesionConsultable` / `OperacionesDeLinea`): este módulo no abre sockets ni
 * los importa, igual que `conversaciones.ts` recibe `enviar`. Lo que decide:
 * - el estado legible (conectado, vinculando, conectando, requiere-vincular,
 *   desconectado, sin-numero) y la salud de hoy (mensajes por quién los
 *   escribió, envíos fallidos, tiempo de respuesta);
 * - el historial (`whatsapp_session_events`) en palabras de la persona;
 * - qué acciones caben: reconectar es un reinicio suave (conserva las
 *   credenciales, sirve para números compartidos); desconectar cierra la
 *   sesión en WhatsApp y obliga a vincular de nuevo, por eso NO se permite
 *   en un número que comparten varias empresas;
 * - el mensaje de prueba solo sale a un celular del equipo o de la lista de
 *   pruebas (la línea del negocio no se usa para escribirle a extraños).
 */
export type EstadoLinea = 'conectado' | 'vinculando' | 'conectando' | 'requiere-vincular' | 'desconectado' | 'sin-numero';

export interface SesionConsultable {
  existe(numero: string): boolean;
  lista(numero: string): boolean;
  vinculando(numero: string): boolean;
  aparcada(numero: string): boolean;
  conQr(numero: string): boolean;
}

export interface OperacionesDeLinea extends SesionConsultable {
  cuenta(numero: string): Promise<AuthAccountInfo | null>;
  reiniciar(numero: string): Promise<void>;
  cerrar(numero: string): Promise<void>;
  qr(numero: string): Promise<QrState>;
  codigo(numero: string): Promise<string>;
  enviar(numero: string, destino: string, texto: string, companyId: string): Promise<void>;
}

export const estadoDeLinea = (numero: string, s: SesionConsultable): EstadoLinea => {
  if (!numero) return 'sin-numero';
  if (s.lista(numero)) return 'conectado';
  if (s.vinculando(numero)) return 'vinculando';
  if (s.aparcada(numero) || s.conQr(numero)) return 'requiere-vincular';
  if (s.existe(numero)) return 'conectando';
  return 'desconectado';
};

const PLATAFORMAS: Record<string, string> = {
  android: 'Android',
  iphone: 'iPhone',
  ios: 'iPhone',
  smba: 'WhatsApp Business (Android)',
  smbi: 'WhatsApp Business (iPhone)',
  web: 'WhatsApp Web',
  macos: 'Mac',
  windows: 'Windows',
};
export const plataformaLegible = (plataforma?: string): string | undefined => (plataforma ? (PLATAFORMAS[plataforma.toLowerCase()] ?? plataforma) : undefined);

/** «ABCDEFGH» → «ABCD-EFGH», como lo muestra WhatsApp al vincular con número. */
export const codigoLegible = (codigo: string): string => {
  const limpio = codigo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return limpio.length === 8 ? `${limpio.slice(0, 4)}-${limpio.slice(4)}` : codigo;
};

const MOTIVOS: Record<number, string> = {
  408: 'WhatsApp no respondió a tiempo',
  428: 'Se cortó la conexión (¿el teléfono se quedó sin internet?)',
  440: 'Otra instancia abrió la sesión con este número',
  503: 'WhatsApp no estaba disponible',
  515: 'WhatsApp pidió reiniciar la conexión',
};
export const motivoDeCierre = (code: number | undefined, detail: string | undefined): string => (code && MOTIVOS[code]) || detail?.trim() || 'Sin motivo informado';

export interface SaludLinea {
  nivel: 'optima' | 'con-fallos' | 'sin-conexion';
  mensajesHoy: number;
  conversacionesHoy: number;
  enviados: number;
  recibidos: number;
  fallidos: number;
  tiempoRespuestaS: number | null;
}

export const saludDe = (estado: EstadoLinea, mensajes: MensajeParaInicio[], fallidos: number): SaludLinea => ({
  nivel: estado !== 'conectado' ? 'sin-conexion' : fallidos > 0 ? 'con-fallos' : 'optima',
  mensajesHoy: mensajes.length,
  conversacionesHoy: new Set(mensajes.map((m) => m.conversationId)).size,
  enviados: mensajes.filter((m) => m.role === 'bot').length,
  recibidos: mensajes.filter((m) => m.role === 'customer').length,
  fallidos,
  tiempoRespuestaS: tiempoDeRespuesta(mensajes),
});

export interface EventoLinea {
  tipo: SessionEventKind;
  titulo: string;
  detalle: string;
  fecha: string;
  tono: 'ok' | 'aviso' | 'error' | 'info';
}

const telefonoLegible = (t: string): string => {
  const d = t.replace(/\D/g, '');
  return d.length === 11 && d.startsWith('51') ? `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : `+${d}`;
};

const legibleDe = (e: SessionEvent): Omit<EventoLinea, 'fecha' | 'tipo'> | null => {
  const porQuien = e.actor ? `, por ${e.actor}` : '';
  switch (e.kind) {
    case 'connected':
      return { titulo: 'Conectado', detalle: 'Sesión iniciada', tono: 'ok' };
    case 'reconnected':
      return { titulo: 'Conectado', detalle: `Reconexión automática${e.detail ? ` ${e.detail}` : ''}`, tono: 'ok' };
    case 'disconnected':
      return { titulo: 'Desconectado', detalle: motivoDeCierre(e.code, e.detail), tono: 'aviso' };
    case 'linked':
      return { titulo: 'Vinculado', detalle: `Código escaneado${plataformaLegible(e.detail) ? ` desde ${plataformaLegible(e.detail)}` : ''}`, tono: 'ok' };
    case 'unlinked':
      return { titulo: 'Desvinculado', detalle: 'El teléfono cerró la sesión: hay que volver a vincular', tono: 'error' };
    case 'parked':
      return { titulo: 'Sin poder conectar', detalle: e.detail ?? 'WhatsApp no completó el login', tono: 'error' };
    case 'restart-requested':
      return { titulo: 'Reconexión pedida', detalle: `Desde el panel${porQuien}`, tono: 'info' };
    case 'logout-requested':
      return { titulo: 'Desconexión pedida', detalle: `Desde el panel${porQuien}`, tono: 'info' };
    case 'test-message':
      return { titulo: 'Mensaje de prueba', detalle: `A ${telefonoLegible(e.detail ?? '')}${e.actor ? `, pedido por ${e.actor}` : ''}`, tono: 'info' };
    case 'send-failed':
      return null; // se cuenta en la salud («Fallidos»), no va a la línea de tiempo
  }
};

/** Los eventos como los lee la persona, del más nuevo al más viejo. */
export const historialLegible = (eventos: SessionEvent[]): EventoLinea[] =>
  eventos.flatMap((e) => {
    const legible = legibleDe(e);
    return legible ? [{ tipo: e.kind, ...legible, fecha: new Date(e.at).toISOString() }] : [];
  });

const soloDigitos = (v: string): string => v.replace(/\D/g, '');
/** Un celular peruano de 9 cifras se entiende sin el 51; lo demás se toma como vino (con código de país). */
const normalizarCelular = (v: string): string => {
  const d = soloDigitos(v);
  if (d.length === 9 && d.startsWith('9')) return `51${d}`;
  return d.length >= 10 && d.length <= 15 ? d : '';
};

/** El destino del mensaje de prueba, o null si no es un número del equipo ni de la lista de pruebas. */
export const destinoDePrueba = (numero: string, permitidos: { miembros: string[]; pruebas: string[] }): string | null => {
  const destino = normalizarCelular(numero);
  if (!destino) return null;
  const validos = new Set([...permitidos.miembros, ...permitidos.pruebas].map(normalizarCelular).filter(Boolean));
  return validos.has(destino) ? destino : null;
};

export const textoDePrueba = (empresa: string, quien: string, ahoraMs: number): string => {
  const hora = new Date(ahoraMs).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
  return `Hola, soy Dali, la asistente de WhatsApp de ${empresa}. Este es un mensaje de prueba que pidió ${quien} desde el panel a las ${hora}. Si lo estás leyendo, la línea funciona. Este mensaje no espera respuesta.`;
};

export interface LineaWhatsApp {
  numero: string;
  empresa: string;
  estado: EstadoLinea;
  /** Otras empresas que atienden con el MISMO número (desconectar las afectaría a todas). */
  compartidaCon: string[];
  cuenta?: { nombre?: string; plataforma?: string };
  conectadoDesde?: string;
  ultimoMensaje?: string;
  salud: SaludLinea;
  historial: EventoLinea[];
}

const DIAS_HISTORIAL = 7;
const HISTORIAL_MAX = 20;

const inicioDelDia = (ahoraMs: number): Date => new Date(`${diaPeruano(ahoraMs)}T00:00:00.000-05:00`);

const empresaDe = async (companyId: string): Promise<{ nombre: string; numero: string }> => {
  const Company = await getCompanyModel();
  const doc = (await Company.findOne({ companyId }).select('name whatsappConfig.sender').lean()) as { name?: unknown; whatsappConfig?: { sender?: unknown } } | null;
  return { nombre: String(doc?.name ?? companyId), numero: soloDigitos(String(doc?.whatsappConfig?.sender ?? '')) };
};

const otrasEmpresasCon = async (numero: string, companyId: string): Promise<string[]> => {
  if (!numero) return [];
  const duenas = await quotaValidatorService.listCompaniesByWhatsappSender(numero).catch(() => []);
  return duenas.filter((c) => c.companyId !== companyId).map((c) => String(c.name ?? c.companyId));
};

const mensajesDeHoy = async (companyId: string, desde: Date): Promise<MensajeParaInicio[]> => {
  const [Conversation, Message] = await Promise.all([getBotConversationModel(), getBotConversationMessageModel()]);
  const ids = (
    await Conversation.find({ companyId, lastMessageAt: { $gte: desde } })
      .select('_id')
      .limit(500)
      .lean()
  ).map((c) => String(c._id));
  if (!ids.length) return [];
  const docs = await Message.find({ conversationId: { $in: ids }, createdAt: { $gte: desde } })
    .select('conversationId role createdAt')
    .lean();
  return docs.map((m) => ({ conversationId: String(m.conversationId), role: m.role, createdAt: m.createdAt as Date }));
};

export const leerWhatsApp = async (companyId: string, sesion: OperacionesDeLinea, ahoraMs = Date.now()): Promise<LineaWhatsApp> => {
  const { nombre, numero } = await empresaDe(companyId);
  const estado = estadoDeLinea(numero, sesion);
  const desde = inicioDelDia(ahoraMs);
  const Conversation = await getBotConversationModel();
  const [compartidaCon, cuenta, mensajes, fallidos, eventos, ultima] = await Promise.all([
    otrasEmpresasCon(numero, companyId),
    numero ? sesion.cuenta(numero).catch(() => null) : Promise.resolve(null),
    mensajesDeHoy(companyId, desde),
    countSessionEvents({ companyId, kind: 'send-failed', sinceMs: desde.getTime() }).catch(() => 0),
    numero ? listSessionEvents(numero, { sinceMs: ahoraMs - DIAS_HISTORIAL * 86_400_000, limit: HISTORIAL_MAX }).catch(() => []) : Promise.resolve([]),
    Conversation.findOne({ companyId }).sort({ lastMessageAt: -1 }).select('lastMessageAt').lean(),
  ]);
  const ultimaConexion = eventos.find((e) => e.kind === 'connected' || e.kind === 'reconnected');
  return {
    numero,
    empresa: nombre,
    estado,
    compartidaCon,
    cuenta: cuenta ? { nombre: cuenta.accountName, plataforma: plataformaLegible(cuenta.platform) } : undefined,
    conectadoDesde: estado === 'conectado' && ultimaConexion ? new Date(ultimaConexion.at).toISOString() : undefined,
    ultimoMensaje: ultima?.lastMessageAt ? new Date(ultima.lastMessageAt as Date).toISOString() : undefined,
    salud: saludDe(estado, mensajes, fallidos),
    historial: historialLegible(eventos),
  };
};

export class LineaSinNumero extends Error {}
export class LineaCompartida extends Error {}
export class LineaNoConectada extends Error {}
export class LineaNoDisponible extends Error {}
export class DestinoNoPermitido extends Error {}

/** Reinicio suave: cierra el socket sin cerrar la sesión en WhatsApp y lo vuelve a abrir. Vale para números compartidos. */
export const reconectarLinea = async (companyId: string, sesion: OperacionesDeLinea, quien: string): Promise<void> => {
  const { numero } = await empresaDe(companyId);
  if (!numero) throw new LineaSinNumero('La empresa no tiene un número de WhatsApp configurado');
  recordSessionEvent({ sessionId: numero, kind: 'restart-requested', actor: quien, companyId });
  await sesion.reiniciar(numero);
};

/** Cierra la sesión en WhatsApp (el teléfono deja de ver el dispositivo vinculado). Después hay que vincular de nuevo. */
export const desconectarLinea = async (companyId: string, sesion: OperacionesDeLinea, quien: string): Promise<void> => {
  const { numero } = await empresaDe(companyId);
  if (!numero) throw new LineaSinNumero('La empresa no tiene un número de WhatsApp configurado');
  const otras = await otrasEmpresasCon(numero, companyId);
  if (otras.length) throw new LineaCompartida(`Este número también atiende a ${otras.join(', ')}: desconectarlo las dejaría sin Dali. Escríbenos y lo hacemos contigo.`);
  recordSessionEvent({ sessionId: numero, kind: 'logout-requested', actor: quien, companyId });
  await sesion.cerrar(numero);
};

export interface Vinculacion {
  estado: 'conectado' | 'vinculando' | 'preparando' | 'qr';
  qrImagen?: string;
  generadoEn?: string;
  /** Baileys rota el QR cada 20 s; el panel lo vuelve a pedir solo. */
  vigenciaS: number;
}
export const VIGENCIA_QR_S = 20;

export const vinculacionPorQr = async (companyId: string, sesion: OperacionesDeLinea): Promise<Vinculacion> => {
  const { numero } = await empresaDe(companyId);
  if (!numero) throw new LineaSinNumero('La empresa no tiene un número de WhatsApp configurado');
  const qr = await sesion.qr(numero);
  if (qr.startError) throw new LineaNoDisponible(`No se pudo levantar la sesión de WhatsApp: ${qr.startError}`);
  if (qr.status === 'connected') return { estado: 'conectado', vigenciaS: VIGENCIA_QR_S };
  if (qr.status === 'linking') return { estado: 'vinculando', vigenciaS: VIGENCIA_QR_S };
  if (qr.status === 'connecting' || !qr.qrImage) return { estado: 'preparando', vigenciaS: VIGENCIA_QR_S };
  return { estado: 'qr', qrImagen: qr.qrImage, generadoEn: new Date(qr.qrGeneratedAt ?? Date.now()).toISOString(), vigenciaS: VIGENCIA_QR_S };
};

export const vinculacionPorCodigo = async (companyId: string, sesion: OperacionesDeLinea): Promise<{ codigo: string }> => {
  const { numero } = await empresaDe(companyId);
  if (!numero) throw new LineaSinNumero('La empresa no tiene un número de WhatsApp configurado');
  return { codigo: codigoLegible(await sesion.codigo(numero)) };
};

const numerosPermitidos = async (companyId: string): Promise<{ miembros: string[]; pruebas: string[] }> => {
  const [miembros, Config] = await Promise.all([miembrosDeEmpresa(companyId), getBotConfigModel()]);
  const config = (await Config.findOne({ companyId }).select('testNumbers').lean()) as { testNumbers?: unknown } | null;
  return { miembros: miembros.map((m) => m.identity), pruebas: Array.isArray(config?.testNumbers) ? config!.testNumbers.map(String) : [] };
};

/** Un mensaje de prueba desde la línea a un celular del equipo. Cuenta en la cuota como cualquier envío. */
export const enviarPrueba = async (companyId: string, sesion: OperacionesDeLinea, numeroDestino: string, quien: string, ahoraMs = Date.now()): Promise<{ destino: string }> => {
  const { nombre, numero } = await empresaDe(companyId);
  if (!numero) throw new LineaSinNumero('La empresa no tiene un número de WhatsApp configurado');
  const destino = destinoDePrueba(numeroDestino, await numerosPermitidos(companyId));
  if (!destino) throw new DestinoNoPermitido('Solo puedes enviarte la prueba a tu celular o al de alguien del equipo');
  if (!sesion.lista(numero)) throw new LineaNoConectada('La línea no está conectada: vincula el número primero');
  await sesion.enviar(numero, destino, textoDePrueba(nombre, quien, ahoraMs), companyId);
  recordSessionEvent({ sessionId: numero, kind: 'test-message', actor: quien, detail: destino, companyId });
  return { destino };
};
