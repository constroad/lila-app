import { getBotConfigModel } from '../../database/bot.models.js';
import { getCompanyModel } from '../../database/models.js';
import logger from '../../utils/logger.js';
import { modeloDescargado } from '../llm/modelo.js';
import { extraerConQwen } from '../ventas/extraccion.js';
import { leadDe, paso, preguntasVigentes, validarExtraccion, type EstadoGuiado, type Extraccion } from '../ventas/guiado.js';
import { guionDe, type Guion } from '../ventas/guion.asfalto.js';
import { enHorarioSegun, negocioDe, perfilDe } from './asistente.js';
import { respuestaFaqPara } from './faq.js';

/**
 * EL SIMULADOR (A15 «Probar a Dali»): el mismo motor guiado que atiende por
 * WhatsApp (`extraerConQwen` + `paso`), con el guion y el perfil de la
 * empresa, pero sin conversación en la base, sin lead y sin avisar a nadie.
 * El estado va y viene con el navegador: el servidor no guarda nada.
 */
export interface EntradaSimulacion {
  estado: EstadoGuiado | null;
  texto: string;
  ultimaPreguntaBot?: string;
  /** Se simula que quien escribe ya es cliente: Dali lo saluda por su nombre y no le pide datos que ya tiene. */
  clienteConocido: boolean;
}

export interface CampoSimulado {
  campo: string;
  etiqueta: string;
  valor?: string;
  estado: 'listo' | 'activo' | 'pendiente';
  /** Las opciones que espera, si es de opciones. */
  opciones?: string[];
  pregunta?: string;
}

export interface Senales {
  /** Coincidió con una pregunta frecuente: Dali contesta con ella. */
  faq?: string;
  preguntaPrecio: boolean;
  quiereCotizacion: boolean;
  quierePersona: boolean;
  fueraDeTema: boolean;
  confirma: boolean;
  saludoSolo: boolean;
}

export interface Simulacion {
  texto: string;
  estado: EstadoGuiado;
  extraido: Extraccion;
  lead: ReturnType<typeof leadDe>;
  servicio?: { id: string; nombre: string; porPalabras: boolean };
  campos: CampoSimulado[];
  senales: Senales;
  escalar?: string;
  /** Qué sacó lo que dijo el cliente: el modelo local o solo las reglas. */
  motor: 'qwen-local' | 'reglas';
  duracionMs: number;
}

/** Los datos del guion vigente para este estado: cuál ya está, cuál se pregunta ahora, cuáles siguen. */
export const camposDe = (guion: Guion, estado: EstadoGuiado): CampoSimulado[] => {
  if (!estado.servicio || estado.servicio === 'otro') return [];
  const r = estado.respuestas ?? {};
  let activoVisto = false;
  return preguntasVigentes(guion, estado).map((p) => {
    const valor = r[p.campo];
    const activo = !valor && !activoVisto;
    if (activo) activoVisto = true;
    return {
      campo: p.campo,
      etiqueta: p.etiqueta,
      ...(valor ? { valor } : {}),
      estado: valor ? 'listo' : activo ? 'activo' : 'pendiente',
      ...(p.opciones?.length ? { opciones: p.opciones.map((o) => o.valor) } : {}),
      ...(activo ? { pregunta: p.pregunta } : {}),
    };
  });
};

export const senalesDe = (x: Extraccion): Senales => ({
  ...(x.respuestaFaq ? { faq: x.respuestaFaq } : {}),
  preguntaPrecio: Boolean(x.preguntaPrecio),
  quiereCotizacion: Boolean(x.quiereCotizacion),
  quierePersona: Boolean(x.quierePersona),
  fueraDeTema: Boolean(x.fueraDeTema),
  confirma: Boolean(x.confirma),
  saludoSolo: Boolean(x.saludoSolo),
});

const TEXTO_MAX = 600;

export const simularTurno = async (companyId: string, entrada: EntradaSimulacion, usuario: { nombre: string }): Promise<Simulacion> => {
  const inicio = Date.now();
  const texto = String(entrada.texto ?? '')
    .trim()
    .slice(0, TEXTO_MAX);
  const [Config, Company] = await Promise.all([getBotConfigModel(), getCompanyModel()]);
  const [config, company] = await Promise.all([Config.findOne({ companyId }).lean(), Company.findOne({ companyId }).select('name').lean()]);
  const nombreEmpresa = String((company as { name?: unknown } | null)?.name ?? '') || undefined;
  const guion = guionDe(config?.guion);
  const negocio = negocioDe(config, nombreEmpresa);
  const perfil = perfilDe(config?.perfil, { greeting: config?.greeting, tone: config?.tone });
  const lima = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  const enHorario = enHorarioSegun(perfil.horario, lima.getDay(), lima.getHours(), lima.getMinutes());
  const estado: EstadoGuiado = entrada.estado && typeof entrada.estado === 'object' ? entrada.estado : {};
  const cliente = entrada.clienteConocido ? { nombre: usuario.nombre || 'Cliente', empresa: nombreEmpresa } : null;

  const motor: Simulacion['motor'] = modeloDescargado() ? 'qwen-local' : 'reglas';
  const [crudo, respuestaFaq] = await Promise.all([
    motor === 'qwen-local' ? extraerConQwen(texto, { ultimaPreguntaBot: entrada.ultimaPreguntaBot, resumenEnviado: Boolean(estado.resumenEnviado) }).catch(() => ({})) : Promise.resolve({}),
    respuestaFaqPara(companyId, (config as { faq?: unknown } | null)?.faq, texto).catch(() => undefined),
  ]);
  const extraido = { ...validarExtraccion(crudo, texto, guion), ...(respuestaFaq ? { respuestaFaq } : {}) };
  const p = paso(estado, extraido, negocio, cliente, enHorario, texto, guion);
  const servicio = p.estado.servicio && p.estado.servicio !== 'otro' ? guion.servicios.find((s) => s.id === p.estado.servicio) : undefined;
  const duracionMs = Date.now() - inicio;
  logger.info(`[dali] simulador (${usuario.nombre}) «${texto.slice(0, 80)}» → ${p.estado.servicio ?? 'sin servicio'} · ${motor} · ${(duracionMs / 1000).toFixed(1)} s${p.escalar ? ` · ESCALA (${p.escalar})` : ''}`);
  return {
    texto: p.texto,
    estado: p.estado,
    extraido,
    lead: leadDe(guion, p.estado),
    ...(servicio ? { servicio: { id: servicio.id, nombre: servicio.nombre, porPalabras: !servicio.alias } } : {}),
    campos: camposDe(guion, p.estado),
    senales: senalesDe(extraido),
    ...(p.escalar ? { escalar: p.escalar } : {}),
    motor,
    duracionMs,
  };
};
