import { randomBytes } from 'node:crypto';
import { getBotConfigModel, getBotConversationMessageModel, getBotConversationModel } from '../../database/bot.models.js';
import logger from '../../utils/logger.js';
import { cargarModelo, type Embed } from '../checklist/semantica.js';

/**
 * LAS PREGUNTAS FRECUENTES (A11, spec DALI §3 `bot_configs.faq`): lo que Dali
 * responde tal cual, sin inventar, cuando el mensaje del cliente se parece a
 * una pregunta guardada o a sus variantes. Se compara por embeddings (el
 * mismo `multilingual-e5-small` local del agente de operaciones) y, si el
 * modelo no está, por palabras en común. Las «sugeridas» son preguntas que
 * los clientes hicieron y Dali contestó con «solo puedo ayudarte con lo de
 * asfalto»: la empresa las responde acá y Dali aprende.
 */
export interface Faq {
  id: string;
  pregunta: string;
  respuesta: string;
  variantes: string[];
  categoria: string;
  activa: boolean;
  /** Cuántas veces Dali contestó con esta (la incrementa el motor). */
  usos: number;
}

export interface CoincidenciaFaq {
  faq: Faq;
  /** 0–1: coseno con el modelo, o parecido por palabras sin él. */
  coincidencia: number;
  /** Pasa el umbral: Dali contesta con esta respuesta. */
  responde: boolean;
  motor: 'semantico' | 'literal';
}

export interface Sugerida {
  pregunta: string;
  veces: number;
  ultimaVezMs: number;
}

/**
 * Medido con e5 el 15/09 contra «¿Trabajan los sábados?»: «sábados atienden?»
 * 0.929, «abren los domingos?» 0.853 (otra cosa), «cuánto cuesta el m2» 0.776.
 * El probador de A11 muestra el porcentaje para ajustar esto con casos reales.
 */
export const UMBRAL_FAQ = 0.87;
const UMBRAL_LITERAL = 0.6;
const LARGOS = { pregunta: 200, respuesta: 600, variante: 120, categoria: 30, variantes: 12, faqs: 200 } as const;

const texto = (v: unknown, max: number): string => (v == null ? '' : String(v)).trim().slice(0, max);

/** Lo guardado (o lo que manda el panel), limpio: sin pregunta o respuesta no vale; sin id, uno nuevo. */
export const faqsDe = (v: unknown): Faq[] => {
  const limpias: Faq[] = [];
  for (const cruda of Array.isArray(v) ? v : []) {
    if (!cruda || typeof cruda !== 'object') continue;
    const c = cruda as Partial<Faq>;
    const pregunta = texto(c.pregunta, LARGOS.pregunta);
    const respuesta = texto(c.respuesta, LARGOS.respuesta);
    if (!pregunta || !respuesta) continue;
    const vistas = new Set<string>();
    const variantes = (Array.isArray(c.variantes) ? c.variantes : []).map((x) => texto(x, LARGOS.variante)).filter((x) => x && !vistas.has(x.toLowerCase()) && vistas.add(x.toLowerCase())).slice(0, LARGOS.variantes);
    limpias.push({ id: texto(c.id, 40) || `faq-${randomBytes(4).toString('hex')}`, pregunta, respuesta, variantes, categoria: texto(c.categoria, LARGOS.categoria), activa: c.activa !== false, usos: typeof c.usos === 'number' && c.usos > 0 ? Math.floor(c.usos) : 0 });
  }
  return limpias.slice(0, LARGOS.faqs);
};

const normalizar = (t: string): string =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const VACIAS = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'un', 'una', 'y', 'o', 'a', 'en', 'que', 'se', 'es', 'por', 'con', 'para', 'me', 'mi', 'su', 'lo', 'al', 'hay', 'ustedes', 'uds']);
const palabrasDe = (t: string): Set<string> => new Set(normalizar(t).split(' ').filter((p) => p.length > 1 && !VACIAS.has(p)));

/** Parecido por palabras en común (Jaccard) contra la pregunta y cada variante: la mejor. */
export const coincidenciaLiteral = (mensaje: string, faq: Faq): number => {
  const a = palabrasDe(mensaje);
  if (!a.size) return 0;
  let mejor = 0;
  for (const candidata of [faq.pregunta, ...faq.variantes]) {
    const b = palabrasDe(candidata);
    if (!b.size) continue;
    let comunes = 0;
    for (const p of a) if (b.has(p)) comunes++;
    const jaccard = comunes / (a.size + b.size - comunes);
    if (jaccard > mejor) mejor = jaccard;
  }
  return mejor;
};

const coseno = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * b[i], 0);

/** Los vectores de cada empresa, una vez por versión de sus preguntas. */
const vectoresPorEmpresa = new Map<string, { clave: string; textos: string[]; vectores: number[][] }>();

const textosDe = (faqs: Faq[]): Array<{ faq: Faq; texto: string }> => faqs.filter((f) => f.activa).flatMap((f) => [f.pregunta, ...f.variantes].map((texto) => ({ faq: f, texto })));

/** La pregunta guardada que más se parece al mensaje (con el modelo si hay, si no por palabras). `null` sin preguntas activas. */
export const mejorCoincidencia = async (faqs: Faq[], mensaje: string, embed: Embed | null, cacheKey?: string): Promise<CoincidenciaFaq | null> => {
  const candidatas = textosDe(faqs);
  if (!candidatas.length || !mensaje.trim()) return null;
  if (embed) {
    try {
      const textos = candidatas.map((c) => c.texto);
      const clave = JSON.stringify(textos);
      let vectores = cacheKey ? vectoresPorEmpresa.get(cacheKey) : undefined;
      if (!vectores || vectores.clave !== clave) {
        vectores = { clave, textos, vectores: await embed(textos) };
        if (cacheKey) vectoresPorEmpresa.set(cacheKey, vectores);
      }
      const [q] = await embed([mensaje]);
      let mejor: CoincidenciaFaq | null = null;
      candidatas.forEach((c, i) => {
        const s = coseno(q, vectores!.vectores[i]);
        if (!mejor || s > mejor.coincidencia) mejor = { faq: c.faq, coincidencia: Math.round(s * 1000) / 1000, responde: s >= UMBRAL_FAQ, motor: 'semantico' };
      });
      return mejor;
    } catch (error) {
      logger.warn(`[dali] FAQ: fallo el modelo semántico, sigo por palabras: ${String(error)}`);
    }
  }
  let mejor: CoincidenciaFaq | null = null;
  for (const f of faqs.filter((x) => x.activa)) {
    const s = coincidenciaLiteral(mensaje, f);
    if (!mejor || s > mejor.coincidencia) mejor = { faq: f, coincidencia: Math.round(s * 1000) / 1000, responde: s >= UMBRAL_LITERAL, motor: 'literal' };
  }
  return mejor;
};

/** La respuesta que Dali daría a este mensaje, si hay una pregunta frecuente que coincide. Para el motor. */
export const respuestaFaqPara = async (companyId: string, faqsGuardadas: unknown, mensaje: string): Promise<string | undefined> => {
  const faqs = faqsDe(faqsGuardadas);
  if (!faqs.some((f) => f.activa)) return undefined;
  const embed = await cargarModelo();
  const m = await mejorCoincidencia(faqs, mensaje, embed, companyId);
  if (!m?.responde) return undefined;
  logger.info(`[dali] FAQ «${m.faq.pregunta}» (${m.motor} ${m.coincidencia}) para «${mensaje.slice(0, 60)}»`);
  void contarUso(companyId, m.faq.id);
  return m.faq.respuesta;
};

/** Una vez por respuesta dada; si falla, no importa. */
const contarUso = async (companyId: string, id: string): Promise<void> => {
  try {
    const Config = await getBotConfigModel();
    await Config.updateOne({ companyId, 'faq.id': id }, { $inc: { 'faq.$.usos': 1 } });
  } catch (error) {
    logger.warn(`[dali] FAQ: no pude contar el uso de ${id}: ${String(error)}`);
  }
};

export const listarFaq = async (companyId: string): Promise<Faq[]> => {
  const Config = await getBotConfigModel();
  const config = await Config.findOne({ companyId }).select('faq').lean();
  return faqsDe((config as { faq?: unknown } | null)?.faq);
};

export const guardarFaq = async (companyId: string, faqs: unknown, quien: string): Promise<Faq[]> => {
  const Config = await getBotConfigModel();
  const previas = faqsDe(((await Config.findOne({ companyId }).select('faq').lean()) as { faq?: unknown } | null)?.faq);
  const usosPrevios = new Map(previas.map((f) => [f.id, f.usos]));
  const limpias = faqsDe(faqs).map((f) => ({ ...f, usos: Math.max(f.usos, usosPrevios.get(f.id) ?? 0) }));
  await Config.updateOne({ companyId }, { $set: { faq: limpias } });
  vectoresPorEmpresa.delete(companyId);
  logger.info(`[dali] ${quien} guardó ${limpias.length} preguntas frecuentes de ${companyId}`);
  return limpias;
};

export const probarFaq = async (companyId: string, pregunta: string): Promise<{ coincidencia: number; responde: boolean; motor: string; faq?: { id: string; pregunta: string }; respuesta?: string }> => {
  const faqs = await listarFaq(companyId);
  const m = await mejorCoincidencia(faqs, pregunta, await cargarModelo(), companyId);
  if (!m) return { coincidencia: 0, responde: false, motor: 'literal' };
  return { coincidencia: m.coincidencia, responde: m.responde, motor: m.motor, faq: { id: m.faq.id, pregunta: m.faq.pregunta }, ...(m.responde ? { respuesta: m.faq.respuesta } : {}) };
};

const DIAS_SUGERIDAS = 30;
const FUERA_DE_TEMA = /solo puedo ayudarte con lo de asfalto/i;

/** Preguntas de clientes que Dali no supo contestar (respondió «solo puedo ayudarte con lo de asfalto»), agrupadas. */
export const sugeridasDe = (mensajes: Array<{ conversationId: string; role: string; text?: string; createdAt: Date }>): Sugerida[] => {
  const porTexto = new Map<string, Sugerida>();
  const porConversacion = new Map<string, typeof mensajes>();
  for (const m of mensajes) {
    if (!porConversacion.has(m.conversationId)) porConversacion.set(m.conversationId, []);
    porConversacion.get(m.conversationId)!.push(m);
  }
  for (const lista of porConversacion.values()) {
    lista.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 0; i < lista.length - 1; i++) {
      const m = lista[i];
      const siguiente = lista[i + 1];
      const pregunta = texto(m.text, LARGOS.pregunta);
      if (m.role !== 'customer' || !/\?|^(que|como|cuanto|cuando|donde|hacen|tienen|trabajan|aceptan|puedo)\b/.test(normalizar(pregunta)) || siguiente.role !== 'bot' || !FUERA_DE_TEMA.test(String(siguiente.text ?? ''))) continue;
      const clave = normalizar(pregunta);
      const previa = porTexto.get(clave);
      if (previa) {
        previa.veces++;
        previa.ultimaVezMs = Math.max(previa.ultimaVezMs, m.createdAt.getTime());
      } else porTexto.set(clave, { pregunta, veces: 1, ultimaVezMs: m.createdAt.getTime() });
    }
  }
  return [...porTexto.values()].sort((a, b) => b.veces - a.veces || b.ultimaVezMs - a.ultimaVezMs).slice(0, 6);
};

export const sugeridasFaq = async (companyId: string, ahoraMs = Date.now()): Promise<Sugerida[]> => {
  const [Conversation, Message] = await Promise.all([getBotConversationModel(), getBotConversationMessageModel()]);
  const desde = new Date(ahoraMs - DIAS_SUGERIDAS * 86_400_000);
  const conversaciones = await Conversation.find({ companyId, lastMessageAt: { $gte: desde } }).select('_id').lean();
  const ids = conversaciones.map((c) => String(c._id));
  if (!ids.length) return [];
  const mensajes = await Message.find({ conversationId: { $in: ids }, createdAt: { $gte: desde } }).select('conversationId role text createdAt').lean();
  return sugeridasDe(mensajes.map((m) => ({ conversationId: String(m.conversationId), role: m.role, text: m.text, createdAt: m.createdAt as Date })));
};
