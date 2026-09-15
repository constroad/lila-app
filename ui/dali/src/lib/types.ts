/** Las formas que devuelve `/api/dali/*` (espejo de `src/agent/dali/*` en lila). */
export type RolDali = 'owner' | 'sales' | 'viewer' | 'operator';
export type EstadoLead = 'nuevo' | 'contactado' | 'cotizado' | 'ganado' | 'perdido';
export type EstadoConversacion = 'bot' | 'human' | 'closed';

export interface Yo {
  usuario: { nombre: string; rol: RolDali; identidad: string };
  empresa: { companyId: string };
}

export interface LeadResumen {
  id: string;
  conversationId: string;
  titulo: string;
  servicio: string;
  cantidad?: string;
  distrito?: string;
  fecha?: string;
  nombre: string;
  empresa?: string;
  telefono: string;
  estado: EstadoLead;
  confirmado: boolean;
  campos: Array<[string, string]>;
  notasDelCliente: string[];
  cerradoEn?: string;
  creadoMs: number;
  actualizadoMs: number;
}

export interface LeadDetalle extends LeadResumen {
  cotizacion?: { monto?: number; enviadaEl?: string; validaHasta?: string };
  motivoPerdido?: string;
  notas: Array<{ texto: string; autor: string; fecha: string }>;
  historial: Array<{ estado: EstadoLead; autor: string; fecha: string }>;
}

export interface AtencionPendiente {
  conversationId: string;
  nombre: string;
  telefono: string;
  empresa?: string;
  motivo: 'pidio-persona' | 'sin-respuesta';
  texto: string;
  haceMin: number;
  accion: 'tomar' | 'ver';
  ultimoMensaje?: string;
  chips: string[];
}

export interface Inicio {
  usuario: { nombre: string; rol: string };
  empresa: { companyId: string; nombre: string; rubro: string; ciudad: string };
  asistente: { encendido: boolean; pausadoHasta?: string; numero: string; ultimoMensajeHaceMin: number | null; conectado: boolean };
  metricas: { conversacionesHoy: number; conversacionesAyer: number; leadsNuevosHoy: number; leadsNuevosAyer: number; sinResponder: number; tiempoRespuestaS: number | null };
  atencion: AtencionPendiente[];
  ultimosLeads: LeadResumen[];
  plan: { nombre: string; usados: number; limite: number; porcentaje: number; renuevaEl: string; contactosUnicos: number; miembros: number };
  fecha: string;
}

export interface ConversacionResumen {
  id: string;
  nombre: string;
  telefono: string;
  estado: EstadoConversacion;
  pausadaHastaMs?: number;
  escaladaMs?: number;
  ultimoMensajeMs: number;
  ultimoMensajeDelClienteMs: number;
  mensajes: number;
  ultimoTexto?: string;
  ultimoRol?: string;
  tieneLead: boolean;
  sinResponder: boolean;
}

export interface MensajeConversacion {
  id: string;
  rol: 'customer' | 'bot' | 'owner' | 'system';
  texto: string;
  enviadoMs: number;
}

export interface ConversacionDetalle {
  conversacion: ConversacionResumen;
  mensajes: MensajeConversacion[];
  lead: LeadResumen | null;
}

/** A6 «Asistente» (`src/agent/dali/asistente.ts`). */
export interface FranjaHoraria {
  activo: boolean;
  /** «08:00» */
  desde: string;
  hasta: string;
}

export interface HorarioAtencion {
  semana: FranjaHoraria;
  sabado: FranjaHoraria;
  domingo: FranjaHoraria;
}

export interface ReglasAsistente {
  sinPrecios: boolean;
  sinPromesas: boolean;
  escala: boolean;
  zonaEstricta: boolean;
}

export interface PerfilAsistente {
  asistente: string;
  saludo: string;
  tono: 'cercano' | 'formal';
  emojis: 'pocos' | 'ninguno';
  horario: HorarioAtencion;
  fueraDeHorario: string;
  zona: string;
  reglas: ReglasAsistente;
}

export interface AvisosAsistente {
  canal: 'grupo' | 'dueno';
  numeroDueno: string;
  casos: { leadNuevo: boolean; pideUrgente: boolean; fallo: boolean };
}

export interface Asistente {
  enabled: boolean;
  pausadoHasta?: string;
  perfil: PerfilAsistente;
  avisos: AvisosAsistente;
  handoffPauseMinutes: number;
  testNumbers: string[];
  /** El JID del grupo de ventas conectado; vacío si no hay. */
  ownerNotifyTarget: string;
  empresa: { nombre: string; rubro: string; ciudad: string; numero: string };
}
