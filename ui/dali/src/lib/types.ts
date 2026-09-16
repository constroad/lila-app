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

/** A8/A9/A10 «Servicios» y el guion (`src/agent/dali/servicios.ts`). */
export type TipoPregunta = 'texto' | 'numero' | 'sino' | 'opcion';

export interface OpcionEditable {
  valor: string;
  palabras: string[];
  sugerencia?: string;
}

export interface PreguntaEditable {
  campo: string;
  etiqueta: string;
  pregunta: string;
  tipo: TipoPregunta;
  opciones: OpcionEditable[];
  cuando?: { campo: string; es: string | string[] };
  pista?: string;
  explicacion?: string;
}

export interface ServicioEditable {
  id: string;
  nombre: string;
  palabras: string[];
  activo: boolean;
  modo: 'preguntas' | 'derivar';
  preguntas: PreguntaEditable[];
}

export interface GuionEditable {
  preguntaServicio: string;
  servicios: ServicioEditable[];
  cierre: PreguntaEditable[];
}

export interface Servicios {
  guion: GuionEditable;
  delPack: boolean;
  activos: number;
}

/** A15 «Probar a Dali» (`src/agent/dali/probar.ts`). */
export interface CampoSimulado {
  campo: string;
  etiqueta: string;
  valor?: string;
  estado: 'listo' | 'activo' | 'pendiente';
  opciones?: string[];
  pregunta?: string;
}

export interface Simulacion {
  texto: string;
  estado: Record<string, unknown>;
  extraido: Record<string, unknown>;
  lead: {
    nombre?: string;
    empresa?: string;
    servicio?: string;
    detalle?: string;
    cantidad?: string;
    distrito?: string;
    fecha?: string;
    listo?: boolean;
    campos: Array<[string, string]>;
  };
  servicio?: { id: string; nombre: string; porPalabras: boolean };
  campos: CampoSimulado[];
  senales: { preguntaPrecio: boolean; quiereCotizacion: boolean; quierePersona: boolean; fueraDeTema: boolean; confirma: boolean; saludoSolo: boolean };
  escalar?: string;
  motor: 'qwen-local' | 'reglas';
  duracionMs: number;
}

/** A7 «Negocio» (`src/agent/dali/negocio.ts`). */
export interface FichaNegocio {
  nombreComercial: string;
  descripcion: string;
  ruc: string;
  web: string;
  direccion: string;
  zona: string;
  comoLlegar: string;
  contacto: { whatsapp: string; telefono: string; correo: string; redSocial: string };
  ofrece: string[];
  noOfrece: string[];
}

/** A11 «Preguntas frecuentes» (`src/agent/dali/faq.ts`). */
export interface Faq {
  id: string;
  pregunta: string;
  respuesta: string;
  variantes: string[];
  categoria: string;
  activa: boolean;
  usos: number;
}

export interface PruebaFaq {
  coincidencia: number;
  responde: boolean;
  motor: string;
  faq?: { id: string; pregunta: string };
  respuesta?: string;
}

export interface FaqSugerida {
  pregunta: string;
  veces: number;
  ultimaVezMs: number;
}

/** A12 «Catálogo» (`src/agent/dali/catalogo.ts`). */
export interface ItemCatalogo {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precio?: number;
  disponible: boolean;
  descripcion: string;
}

export interface Catalogo {
  items: ItemCatalogo[];
  dicePrecios: boolean;
}

/** A13 «Importar desde Excel» (`src/agent/dali/importar.ts`). */
export type HojaImportacion = 'Negocio' | 'Servicios' | 'Preguntas' | 'Preguntas frecuentes' | 'Catálogo';

export interface AvisoImportacion {
  seccion: HojaImportacion;
  fila: number;
  detalle: string;
  nivel: 'omitido' | 'ajustado';
}

export interface ResumenImportacion {
  negocio: number;
  servicios: number;
  preguntas: number;
  faqs: number;
  catalogo: number;
  total: number;
}

export interface Analisis {
  token: string;
  archivo: string;
  tamano: number;
  resumen: ResumenImportacion;
  avisos: AvisoImportacion[];
  hojasEncontradas: HojaImportacion[];
}

export interface Importacion {
  archivo: string;
  tamano: number;
  resumen: ResumenImportacion;
  avisos: number;
  modo: 'reemplazar' | 'agregar';
  quien: string;
  fecha: string;
}

/** A14 «WhatsApp» (`src/agent/dali/whatsapp.ts`). */
export type EstadoLinea = 'conectado' | 'vinculando' | 'conectando' | 'requiere-vincular' | 'desconectado' | 'sin-numero';

export interface SaludLinea {
  nivel: 'optima' | 'con-fallos' | 'sin-conexion';
  mensajesHoy: number;
  conversacionesHoy: number;
  enviados: number;
  recibidos: number;
  fallidos: number;
  tiempoRespuestaS: number | null;
}

export interface EventoLinea {
  tipo: string;
  titulo: string;
  detalle: string;
  fecha: string;
  tono: 'ok' | 'aviso' | 'error' | 'info';
}

export interface LineaWhatsApp {
  numero: string;
  empresa: string;
  estado: EstadoLinea;
  compartidaCon: string[];
  cuenta?: { nombre?: string; plataforma?: string };
  conectadoDesde?: string;
  ultimoMensaje?: string;
  salud: SaludLinea;
  historial: EventoLinea[];
}

export interface Vinculacion {
  estado: 'conectado' | 'vinculando' | 'preparando' | 'qr';
  qrImagen?: string;
  generadoEn?: string;
  vigenciaS: number;
}
