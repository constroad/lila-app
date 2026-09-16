import { getBotConfigModel } from '../../database/bot.models.js';
import { avisosDe, cambiosParaGuardar, type AvisosAsistente, type DescansoAvisos } from './asistente.js';
import { normalizarIdentidad } from './miembros.js';

/**
 * NOTIFICACIONES (A18, spec DALI §4 `notificaciones`): por dónde avisa Dali,
 * qué avisa y cuándo calla. Es la misma configuración de A6 «Avisos»
 * (`bot_configs.avisos` + `ownerNotifyTarget`), con lo que A6 no tenía: el
 * grupo se elige entre los grupos reales de la línea (el store de la sesión),
 * y el horario de descanso. Los eventos son los tres que el motor dispara de
 * verdad (lead con datos —incluye «listo para cotizar» y lo que el cliente
 * agrega después—, cliente que pide a alguien, Dali no pudo contestar); el
 * aviso de desconexión y el resumen semanal no existen todavía y se muestran
 * como tales. El correo no es un canal: nada manda correos hoy.
 */
export interface GrupoDeLinea {
  jid: string;
  nombre: string;
  miembros: number;
}

export interface Notificaciones {
  linea: string;
  canal: AvisosAsistente['canal'];
  grupo?: GrupoDeLinea;
  grupos: GrupoDeLinea[];
  gruposDisponibles: boolean;
  numeroDueno: string;
  casos: AvisosAsistente['casos'];
  descanso: DescansoAvisos;
}

export interface GrupoDelStore {
  id: string;
  name?: string;
  participants?: unknown[];
}

export const grupoLegible = (g: GrupoDelStore): GrupoDeLinea => ({
  jid: g.id,
  nombre: String(g.name || '').trim() || 'Grupo sin nombre',
  miembros: Array.isArray(g.participants) ? g.participants.length : 0,
});

export const notificacionesDe = (config: { avisos?: unknown; ownerNotifyTarget?: string } | null | undefined, gruposDelStore: GrupoDelStore[], linea: string): Notificaciones => {
  const avisos = avisosDe(config?.avisos);
  const grupos = gruposDelStore.map(grupoLegible);
  const jid = String(config?.ownerNotifyTarget ?? '').trim();
  const grupo = jid ? (grupos.find((g) => g.jid === jid) ?? { jid, nombre: 'Grupo conectado desde Portal', miembros: 0 }) : undefined;
  return {
    linea,
    canal: avisos.canal,
    grupo,
    grupos,
    gruposDisponibles: gruposDelStore.length > 0,
    numeroDueno: avisos.numeroDueno,
    casos: avisos.casos,
    descanso: avisos.descanso,
  };
};

export interface CambiosNotificaciones {
  canal?: string;
  grupoJid?: string;
  numeroDueno?: string;
  casos?: Partial<AvisosAsistente['casos']>;
  descanso?: Partial<DescansoAvisos>;
}

export class NotificacionesInvalidas extends Error {}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lo que manda el panel → lo que se guarda (`ownerNotifyTarget` + `avisos`), validado con los grupos reales. */
export const cambiosDeNotificaciones = (c: CambiosNotificaciones, gruposDelStore: GrupoDelStore[]): { ownerNotifyTarget?: string; avisos: Partial<AvisosAsistente> } => {
  const avisos: Partial<AvisosAsistente> = {};
  let ownerNotifyTarget: string | undefined;
  if (c.canal !== undefined) {
    if (c.canal !== 'grupo' && c.canal !== 'dueno') throw new NotificacionesInvalidas('Elige el grupo o un número');
    avisos.canal = c.canal;
  }
  if (c.grupoJid !== undefined) {
    if (!gruposDelStore.length) throw new NotificacionesInvalidas('La línea no está conectada: no se pueden cargar los grupos ahora');
    if (!gruposDelStore.some((g) => g.id === c.grupoJid)) throw new NotificacionesInvalidas('Ese grupo no está en la línea de WhatsApp');
    ownerNotifyTarget = c.grupoJid;
  }
  if (c.numeroDueno !== undefined) {
    const numero = normalizarIdentidad(c.numeroDueno);
    if (!/^\d{10,15}$/.test(numero)) throw new NotificacionesInvalidas('Escribe un celular de 9 dígitos');
    avisos.numeroDueno = numero;
  }
  if (c.casos) {
    const casos: Partial<AvisosAsistente['casos']> = {};
    for (const k of ['leadNuevo', 'pideUrgente', 'fallo'] as const) if (typeof c.casos[k] === 'boolean') casos[k] = c.casos[k];
    avisos.casos = casos as AvisosAsistente['casos'];
  }
  if (c.descanso) {
    const d: Partial<DescansoAvisos> = {};
    if (typeof c.descanso.activo === 'boolean') d.activo = c.descanso.activo;
    for (const k of ['desde', 'hasta'] as const) {
      if (c.descanso[k] !== undefined) {
        if (!HORA.test(String(c.descanso[k]))) throw new NotificacionesInvalidas('Las horas del descanso van como 22:00 y 07:00');
        d[k] = String(c.descanso[k]);
      }
    }
    avisos.descanso = d as DescansoAvisos;
  }
  return { ...(ownerNotifyTarget !== undefined ? { ownerNotifyTarget } : {}), avisos };
};

export interface EventoDeAviso {
  id: 'leadNuevo' | 'pideUrgente' | 'fallo' | 'desconexion' | 'resumen';
  titulo: string;
  etiqueta: string;
  detalle: string;
  /** Un ejemplo con datos inventados, con la forma exacta del aviso real. */
  ejemplo: string;
  disponible: boolean;
}

export const EVENTOS_DE_AVISO: EventoDeAviso[] = [
  {
    id: 'leadNuevo',
    titulo: 'Lead nuevo con datos',
    etiqueta: 'Alta prioridad',
    detalle: 'Apenas Dali tiene con qué trabajar (servicio y lugar o cantidad); otra vez cuando el lead queda listo para cotizar, y cada vez que el cliente agrega algo después.',
    ejemplo:
      '🧲 *Nuevo lead — CONSTROAD*\n👤 Cliente de ejemplo · Transportes Ejemplo · +51 900 000 000\n🏗 Colocación / asfaltado — 2 pulgadas\n📐 600 m² · 📍 Lurín\nPara tomarlo, responde al cliente desde el WhatsApp de CONSTROAD: el bot se calla 30 min en esa conversación.',
    disponible: true,
  },
  {
    id: 'pideUrgente',
    titulo: 'Cliente pide una persona',
    etiqueta: 'Atención urgente',
    detalle: 'El cliente pide hablar con alguien o no quiere seguir con Dali. Dali se calla 30 minutos en esa conversación.',
    ejemplo:
      '🙋 *Cliente pide atención — CONSTROAD*\n👤 Cliente de ejemplo · +51 900 000 000\nMotivo: pidió hablar con una persona\nÚltimo mensaje: «necesito coordinar con el encargado de obra»\nEl bot se calla 30 min: responde desde el WhatsApp de CONSTROAD.',
    disponible: true,
  },
  {
    id: 'fallo',
    titulo: 'Dali no pudo contestar',
    etiqueta: 'Pregunta sin respuesta',
    detalle: 'El modelo no pudo responder y Dali le dijo al cliente que un asesor le escribe.',
    ejemplo:
      '⚠️ *El bot no pudo contestar — CONSTROAD*\n+51 900 000 000: «¿tienen ensayo Marshall del asfalto?»\nLe dije que un asesor responde. Toma la conversación desde el WhatsApp de CONSTROAD.',
    disponible: true,
  },
  {
    id: 'desconexion',
    titulo: 'WhatsApp desconectado',
    etiqueta: 'Todavía no',
    detalle: 'Un aviso cuando la línea se cae más de unos minutos. Ningún proceso lo emite hoy: revisa el estado en WhatsApp.',
    ejemplo: '🚨 *Línea sin conexión — CONSTROAD*\nDali no está atendiendo. Vincula el número desde el panel.',
    disponible: false,
  },
  {
    id: 'resumen',
    titulo: 'Resumen semanal',
    etiqueta: 'Todavía no',
    detalle: 'Los lunes a las 8:00, conversaciones y leads de la semana. Llega con Reportes.',
    ejemplo: '📊 *Resumen semanal — CONSTROAD*\n• 12 conversaciones atendidas\n• 4 leads nuevos',
    disponible: false,
  },
];

export const textoDePruebaDeAviso = (empresa: string, quien: string): string =>
  `🔔 *Prueba de avisos — ${empresa}*\nEste es un mensaje de prueba que pidió ${quien} desde el panel de Dali. Si lo estás leyendo, los avisos de leads, clientes que piden atención y fallos llegan por acá.`;

export const leerNotificaciones = async (companyId: string, gruposDelStore: GrupoDelStore[], linea: string): Promise<Notificaciones> => {
  const Config = await getBotConfigModel();
  const config = (await Config.findOne({ companyId }).select('avisos ownerNotifyTarget').lean()) as { avisos?: unknown; ownerNotifyTarget?: string } | null;
  return notificacionesDe(config, gruposDelStore, linea);
};

export const guardarNotificaciones = async (companyId: string, cambios: CambiosNotificaciones, gruposDelStore: GrupoDelStore[], linea: string): Promise<Notificaciones> => {
  const { ownerNotifyTarget, avisos } = cambiosDeNotificaciones(cambios, gruposDelStore);
  const Config = await getBotConfigModel();
  const actual = ((await Config.findOne({ companyId }).lean()) ?? {}) as Record<string, unknown>;
  const set = { ...cambiosParaGuardar(actual, { avisos }), ...(ownerNotifyTarget !== undefined ? { ownerNotifyTarget } : {}) };
  const doc = (await Config.findOneAndUpdate({ companyId }, { $set: set }, { new: true, upsert: true }).select('avisos ownerNotifyTarget').lean()) as {
    avisos?: unknown;
    ownerNotifyTarget?: string;
  } | null;
  return notificacionesDe(doc, gruposDelStore, linea);
};
