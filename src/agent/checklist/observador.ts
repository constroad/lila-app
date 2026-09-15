import logger from '../../utils/logger.js';
import { getCompanyModel } from '../../database/models.js';
import { extractInboundText, type BaileysMessageContent } from '../runtime/message-text.js';
import {
  AGENTE_ACTIVO,
  COMPANY_PILOTO,
  debeEscuchar,
  resolverAlcance,
  type AlcanceAgente,
  type GrupoResuelto,
} from './alcance.js';
import { normalizarTexto } from './checklist.js';
import { hidratarMensajes, recordarMensaje } from './almacen.js';
import { decidir, esVoto, hidratarPropuestas, type MotivoRechazo } from './sugerencias.js';
import { enviarAOperaciones, enviarAprobado, responderEstado } from './emisor.js';
import { cargarAprobadores, esAdmin, esAprobador } from './aprobadores.js';
import { apagar, comandoInterruptor, encender, estadoInterruptor, hidratarInterruptor, type EstadoInterruptor } from './interruptor.js';
import { cargarConfig, cargarMensajes, cargarPropuestas, guardarConfig, guardarMensaje } from './persistencia.js';
import { VENTANA_MS } from './almacen.js';
import { GROUP_ERRORS_TRACKING } from '../../constants/whatsapp.constants.js';
import { findOutgoingMessage } from '../../whatsapp/baileys/outgoing-messages.js';

/**
 * El oído del agente: mira los mensajes del grupo piloto y NADA MÁS.
 *
 * VA APARTE DEL BOT CONVERSACIONAL a propósito. `handleAgentMessagesUpsert`
 * arranca con `if (!config.whatsapp.agentEnabled) return` —el gate del bot que
 * responde 1:1— y además su router descarta todo grupo por diseño. Colgarse de
 * ahí ataría este observador a un interruptor que es de otra cosa; y tocar ese
 * router para dejar pasar grupos cambiaría el comportamiento del bot 1:1, que
 * hoy funciona. Dos features, dos caminos.
 *
 * NO RESPONDE NADA. Solo observa y recuerda. Lo que sale al grupo de operaciones
 * lo manda el detector, y solo al destino permitido.
 */

const ALCANCE_TTL_MS = 5 * 60_000;
let alcanceCache: { alcance: AlcanceAgente; at: number } | null = null;

/** Solo para tests. */
export const _resetAlcanceCache = (): void => void (alcanceCache = null);

/**
 * El alcance, cacheado 5 min: se consulta por CADA mensaje del grupo y no tiene
 * sentido pegarle a Mongo por cada uno. Cinco minutos es más que suficiente para
 * que un cambio de grupo se tome solo.
 */
export const alcanceVigente = async (now = Date.now()): Promise<AlcanceAgente> => {
  if (alcanceCache && now - alcanceCache.at < ALCANCE_TTL_MS) return alcanceCache.alcance;

  const alcance = await resolverAlcance(jidPorNombre);

  // UN ALCANCE VACÍO NO SE CACHEA. Al arrancar, las sesiones conectan de a
  // una y la de inframaq —la que resuelve el grupo por nombre— es la última,
  // ~25 s después de la primera. Un mensaje que llegaba en ese hueco por la
  // sesión de constroad resolvía «nada» y lo dejaba cacheado CINCO MINUTOS:
  // el 14/09 a las 11:25, una pregunta de José 18 s después del deploy quedó
  // sin respuesta y sin una línea en el log.
  if (alcance.grupoEscuchado) {
    if (!alcanceCache) logger.info(`[agente] alcance resuelto: escucho «${alcance.nombreGrupo}» (${alcance.grupoEscuchado}); planta «${alcance.nombreGrupoPlanta || '—'}»`);
    alcanceCache = { alcance, at: now };
  }
  return alcance;
};

/**
 * Reintenta hasta que el alcance esté resuelto: es lo que hace que un mensaje
 * recibido durante el arranque espere a la sesión que falta en vez de perderse.
 */
export const esperarAlcance = async (
  obtener: () => Promise<AlcanceAgente>,
  { intentos = 20, esperaMs = 2_000, dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {}
): Promise<AlcanceAgente> => {
  let alcance = await obtener();
  for (let i = 0; !alcance.grupoEscuchado && i < intentos; i++) {
    await dormir(esperaMs);
    alcance = await obtener();
  }
  return alcance;
};

type ContenidoEntrante = BaileysMessageContent & {
  extendedTextMessage?: {
    contextInfo?: { stanzaId?: string | null; participant?: string | null; mentionedJid?: string[] | null } | null;
  } | null;
};

/**
 * ¿ESTE MENSAJE LO MANDÓ EL AGENTE? No es `key.fromMe`.
 *
 * `fromMe` significa «lo escribió el teléfono de ESTA sesión». Como hay dos
 * sesiones en los grupos —inframaq, que es la que manda, y constroad, que es el
 * teléfono de José—, un mensaje de José llega `fromMe: true` por la sesión de
 * constroad. El 13/09 a las 12:03 eso lo descartó como «propio», la
 * deduplicación por id lo marcó como visto, y la sesión de inframaq lo ignoró:
 * dos preguntas sin respuesta. Propio es lo que escribió el NÚMERO DEL AGENTE,
 * lo observe la sesión que lo observe.
 */
const esDelBot = async (
  raw: { key?: { fromMe?: boolean | null; participant?: string | null } } | undefined,
  sessionPhone: string
): Promise<boolean> => {
  const sender = await senderPilotoCacheado();
  if (!sender) return Boolean(raw?.key?.fromMe);
  if (raw?.key?.fromMe && sessionPhone === sender) return true;
  const autor = String(raw?.key?.participant || '').replace(/:\d+@/, '@');
  if (!autor) return false;
  if (autor === `${sender}@s.whatsapp.net`) return true;
  const propios = await jidsPropios(sender);
  return propios.includes(autor);
};

let senderCache: { valor: string; at: number } | null = null;
const senderPilotoCacheado = async (): Promise<string> => {
  if (senderCache && Date.now() - senderCache.at < 5 * 60_000) return senderCache.valor;
  const valor = await senderPiloto().catch(() => '');
  senderCache = { valor, at: Date.now() };
  return valor;
};

/** A quiénes menciona este mensaje (los JIDs detrás de los «@Nombre»). */
const mencionadosDe = (message: ContenidoEntrante | null | undefined): string[] =>
  (message?.extendedTextMessage?.contextInfo?.mentionedJid ?? []).map(String);

/**
 * ¿ESTE MENSAJE ES PARA OTRA PERSONA? Cita a alguien que no es el agente, o
 * menciona a alguien que no es el agente. El 14/09 a las 18:11, José le
 * contestó «¿a qué te refieres?» a Globofast (citándolo) y le habló a
 * @nikole y @Polluela un minuto después de preguntarle algo a Lila: los dos
 * cayeron como «pregunta dentro del hilo» y Lila contestó con el menú. Un
 * mensaje dirigido a otro nunca es una continuación.
 */
/** ¿Este mensaje CITA (responde a) un mensaje del agente? Entonces es para el agente aunque no lo etiquete. */
export const citaAlBot = (message: ContenidoEntrante | null | undefined, jidsBot: string[]): boolean => {
  const citado = String(message?.extendedTextMessage?.contextInfo?.participant || '').replace(/:\d+@/, '@');
  return Boolean(citado) && jidsBot.includes(citado);
};

export const paraOtraPersona = (message: ContenidoEntrante | null | undefined, jidsBot: string[]): boolean => {
  const esBot = (jid: string) => jidsBot.includes(String(jid || '').replace(/:\d+@/, '@'));
  const citado = String(message?.extendedTextMessage?.contextInfo?.participant || '');
  if (citado && !esBot(citado)) return true;
  const mencionados = mencionadosDe(message);
  return mencionados.length > 0 && !mencionados.some(esBot);
};

/**
 * EL MISMO MENSAJE NO SE PROCESA DOS VECES. El 13/09 cada pregunta se atendió
 * dos veces (11:45:59 y 11:46:00): el mismo `messages.upsert` llega por más de
 * un camino —dos sesiones en el grupo, o un reintento— y el id de WhatsApp es
 * el mismo. Se recuerdan los últimos ids vistos; con 500 alcanza para horas.
 */
const vistos = new Set<string>();
const yaVisto = (id: string): boolean => {
  if (!id) return false;
  if (vistos.has(id)) return true;
  vistos.add(id);
  if (vistos.size > 500) vistos.delete(vistos.values().next().value as string);
  return false;
};

interface UpsertEvent {
  type?: string;
  messages?: Array<{
    key?: {
      remoteJid?: string | null;
      fromMe?: boolean | null;
      id?: string | null;
      participant?: string | null;
    };
    messageTimestamp?: number | Long | null;
    message?: ContenidoEntrante | null;
  }>;
}

/** El id del mensaje que este mensaje CITA (responder → aparece arriba). */
const citaDe = (message: ContenidoEntrante | null | undefined): string =>
  String(message?.extendedTextMessage?.contextInfo?.stanzaId || '');

type Long = { toNumber(): number };

/** El sello de Baileys viene en SEGUNDOS, y a veces como Long de protobuf. */
const aMilisegundos = (ts: unknown, ahora: number): number => {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts * 1000;
  const asLong = ts as Long | null;
  if (asLong && typeof asLong.toNumber === 'function') {
    const n = asLong.toNumber();
    if (Number.isFinite(n)) return n * 1000;
  }
  return ahora;
};

/**
 * Observa un lote de mensajes. NUNCA lanza: cuelga del listener de Baileys y un
 * fallo acá no puede afectar a la recepción de mensajes de nadie.
 */
export const observarParaChecklist = async (
  sessionPhone: string,
  upsert: UpsertEvent
): Promise<void> => {
  try {
    if (!AGENTE_ACTIVO) return;
    if (upsert?.type !== 'notify') return;

    const alcance = await esperarAlcance(alcanceVigente);
    if (!alcance.grupoEscuchado) return;

    for (const raw of upsert.messages ?? []) {
      const remoteJid = String(raw?.key?.remoteJid || '');
      const texto = extractInboundText(raw.message);
      if (!texto.trim()) continue;
      if (yaVisto(`${remoteJid}|${String(raw?.key?.id || '')}`)) continue;

      // LAS APROBACIONES vienen del grupo de operaciones, CITANDO la propuesta,
      // y de un administrador: un «1» suelto, o del propio bot, o de quien no
      // administra el grupo, no aprueba nada. Se atiende antes del guard de
      // abajo porque es otro grupo, con otra función — no se «escucha» para hechos.
      if (remoteJid === GROUP_ERRORS_TRACKING) {
        if (await esDelBot(raw, sessionPhone)) continue;
        // Las alertas de Portal salen por la sesión de constroad —el teléfono
        // de José— y llegan como si las hubiera escrito él. Lo que mandamos
        // por API queda en el registro de salientes: no es una consulta.
        if (findOutgoingMessage(sessionPhone, raw?.key?.id)) continue;
        const quien = String(raw?.key?.participant || 'desconocido');
        const comando = comandoInterruptor(texto);
        if (comando) {
          await atenderInterruptor(comando, quien, remoteJid, alcance);
          continue;
        }
        // Un voto cita una propuesta; una elección es un número suelto tras una
        // pregunta del agente. El voto se prueba primero: si cita, es voto.
        if (esVoto(texto) && citaDe(raw.message)) {
          await atenderVoto({ voto: texto, citaMsgId: citaDe(raw.message), quien }, alcance);
          continue;
        }
        // Las consultas también se atienden acá: es nuestro grupo (José, 13/09).
        void import('../consultas/index.js')
          .then(async ({ esConsulta, atenderConsulta, atenderEleccion, atenderContinuacion }) => {
            const bot = await senderPilotoCacheado();
            if (esConsulta(texto, bot, mencionadosDe(raw.message), await jidsPropios(bot))) {
              return atenderConsulta(texto, quien, remoteJid, alcance, bot);
            }
            if (/lila/i.test(texto)) {
              // Para diagnosticar la próxima vez sin adivinar: qué llegó y contra qué se comparó.
              logger.info(`[agente] mensaje con «lila» no reconocido como consulta: ${JSON.stringify({ texto: texto.slice(0, 80), mencionados: mencionadosDe(raw.message), bot, jidsBot: await jidsPropios(bot) })}`);
            }
            // Sin etiqueta, el agente atiende solo lo que le RESPONDEN: una
            // cita a un mensaje suyo («¿y la 3?» respondiendo a su tabla), o la
            // respuesta a algo que él preguntó («la unidad 4», «2», «sí»).
            // José, 14/09: «mejor la gente debe responder cuando se le taguea».
            const propios = await jidsPropios(bot);
            if (paraOtraPersona(raw.message, propios)) return;
            if (citaAlBot(raw.message, propios)) return atenderContinuacion(texto, quien, remoteJid, alcance, true);
            const fue = await atenderEleccion(texto, quien, remoteJid, alcance);
            if (!fue && /^\s*\d{1,2}\s*$/.test(texto) && esVoto(texto)) {
              await atenderVoto({ voto: texto, citaMsgId: '', quien }, alcance);
            }
          })
          .catch((error) => logger.warn(`[agente] consulta no atendida: ${String(error)}`));
        continue;
      }

      // EL GUARD, y es lo único que separa "escuchar un grupo" de "escuchar todo".
      if (!debeEscuchar(remoteJid, alcance)) continue;

      // Una pregunta al agente («@lila …») se atiende aparte, sin bloquear la
      // observación. Import dinámico: las consultas arrastran el detector y el
      // detector arrastra este módulo (ciclo), y además el read model.
      const delBot = await esDelBot(raw, sessionPhone);
      if (!delBot) {
        const quien = String(raw?.key?.participant || 'alguien');
        // El interruptor también desde este grupo: el 14/09 «@lila off» acá fue
        // al modelo como consulta y recién «!lila off» en error tracking lo apagó.
        const comando = comandoInterruptor(texto);
        if (comando) {
          await atenderInterruptor(comando, quien, remoteJid, alcance);
          continue;
        }
        void import('../consultas/index.js')
          .then(async ({ esConsulta, atenderConsulta, atenderEleccion, atenderContinuacion }) => {
            const bot = await senderPilotoCacheado();
            if (esConsulta(texto, bot, mencionadosDe(raw.message), await jidsPropios(bot))) {
              return atenderConsulta(texto, quien, remoteJid, alcance, bot);
            }
            if (/lila/i.test(texto)) {
              // Para diagnosticar la próxima vez sin adivinar: qué llegó y contra qué se comparó.
              logger.info(`[agente] mensaje con «lila» no reconocido como consulta: ${JSON.stringify({ texto: texto.slice(0, 80), mencionados: mencionadosDe(raw.message), bot, jidsBot: await jidsPropios(bot) })}`);
            }
            // Sin etiqueta, solo lo que le RESPONDEN: una cita a un mensaje suyo
            // o la respuesta a algo que él preguntó. Nunca si le habla a otro.
            const propios = await jidsPropios(bot);
            if (paraOtraPersona(raw.message, propios)) return;
            if (citaAlBot(raw.message, propios)) return atenderContinuacion(texto, quien, remoteJid, alcance, true);
            await atenderEleccion(texto, quien, remoteJid, alcance);
          })
          .catch((error) => logger.warn(`[agente] consulta no atendida: ${String(error)}`));
      }

      const ahora = Date.now();
      const mensaje = {
        texto,
        // En un grupo, quien escribió viene en `participant`; `remoteJid` es el
        // grupo. Se guarda para la seguridad por rol de F2 (spec §7.3).
        autor: String(raw?.key?.participant || ''),
        ts: aMilisegundos(raw?.messageTimestamp, ahora),
        // Los mensajes del AGENTE no confirman nada: no se cierra a sí mismo los
        // ítems que acaba de abrir. Y no es `fromMe`: ver `esDelBot`.
        esPropio: delBot,
      };
      recordarMensaje(remoteJid, mensaje);
      // Y a Mongo, para que un deploy no lo borre. Fire-and-forget: nunca en el
      // camino del listener.
      void guardarMensaje(remoteJid, { ...mensaje, waId: String(raw?.key?.id || '') || undefined });
    }
  } catch (error) {
    logger.warn(
      `[agente] no pude observar mensajes de ${sessionPhone}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * Un «1» o un «3» que CITA una propuesta, de un administrador del grupo de
 * operaciones, la decide. Con «1» sale al grupo real por el emisor —que vuelve
 * a verificar destino y estado— y se confirma en operaciones; con «3» solo se
 * anota. Todo lo que no cumpla eso se ignora y queda en el log con el motivo.
 *
 * Nunca lanza: cuelga del listener de Baileys.
 */
const atenderVoto = async (
  args: { voto: string; citaMsgId: string; quien: string },
  alcance: AlcanceAgente
): Promise<void> => {
  try {
    const aprobador = await esAprobador(args.quien);
    const resultado = decidir({ ...args, esAprobador: aprobador });
    if (resultado.ok === false) {
      const explicacion: Record<MotivoRechazo, string> = {
        'sin-cita': 'sin citar ninguna propuesta: se ignora',
        'cita-desconocida': 'citando un mensaje que no es una propuesta: se ignora',
        'no-pendiente': 'sobre una propuesta ya decidida o vencida: se ignora',
        'no-aprobador': 'de alguien que no está en el grupo de operaciones: se ignora',
        'no-es-voto': 'que no es un voto',
      };
      logger.info(`[agente] «${args.voto}» de ${args.quien} en operaciones, ${explicacion[resultado.motivo]}`);
      if (resultado.motivo === 'no-aprobador') {
        await enviarAOperaciones('🔒 Solo quien está en este grupo puede aprobar o descartar.');
      }
      return;
    }
    const propuesta = resultado.propuesta;
    if (propuesta.estado === 'descartada') {
      logger.info(`[agente] propuesta ${propuesta.id} (${propuesta.tipo}) descartada por ${args.quien}`);
      await enviarAOperaciones(`🗑 Descartado. No se mandó a «${propuesta.nombreDestino}».`);
      return;
    }
    const enviada = await enviarAprobado(propuesta, alcance);
    await enviarAOperaciones(
      enviada
        ? `✅ Enviado a «${propuesta.nombreDestino}».`
        : `⛔ No se pudo mandar a «${propuesta.nombreDestino}»: revisá el log de lila.`
    );
  } catch (error) {
    logger.warn(
      `[agente] no pude atender el voto «${args.voto}» de ${args.quien}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * `!lila off` / `!lila on`, de un administrador del grupo de operaciones. Se
 * persiste: un deploy no prende lo que alguien apagó.
 */
const atenderInterruptor = async (comando: 'off' | 'on' | 'estado', quien: string, grupo: string, alcance: AlcanceAgente): Promise<void> => {
  try {
    if (comando === 'estado') {
      // Responde aunque esté apagado, y en el grupo donde lo preguntaron: es la
      // única forma de saberlo desde el celular.
      const { apagado } = estadoInterruptor();
      await responderEstado(grupo, apagado ? '⏸ Estoy apagada. Un administrador me prende con «@lila on».' : '▶️ Estoy encendida. Un administrador me apaga con «@lila off».', alcance);
      return;
    }
    if (!(await esAdmin(quien))) {
      logger.info(`[agente] «!lila ${comando}» de ${quien}, que no administra el grupo: se ignora`);
      await enviarAOperaciones('🔒 Solo un administrador de este grupo puede apagar o prender el agente.');
      return;
    }
    const estado = comando === 'off' ? apagar(quien) : encender(quien);
    await guardarConfig('interruptor', estado);
    logger.warn(`[agente] interruptor: ${comando.toUpperCase()} por ${quien}`);
    await enviarAOperaciones(
      comando === 'off'
        ? '⏸ Agente APAGADO. Sigue escuchando pero no propone ni manda nada. «@lila on» para prenderlo.'
        : '▶️ Agente PRENDIDO.'
    );
  } catch (error) {
    logger.warn(`[agente] no pude atender «!lila ${comando}»: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Al arrancar: la memoria vuelve de Mongo. Sin esto cada deploy dejaba al
 * agente amnésico (12/09/2026: cuatro deploys, cuatro veces todo de nuevo).
 * Nunca lanza.
 */
export const hidratarAgente = async (ahoraMs = Date.now()): Promise<void> => {
  if (!AGENTE_ACTIVO) {
    logger.info('[agente] AGENTE_ACTIVO = false: el agente está apagado en código');
    return;
  }
  try {
    const [mensajes, propuestas, interruptor] = await Promise.all([
      cargarMensajes(ahoraMs - VENTANA_MS),
      cargarPropuestas(ahoraMs - 7 * 24 * 3_600_000),
      cargarConfig<EstadoInterruptor>('interruptor'),
    ]);
    hidratarMensajes(mensajes);
    hidratarPropuestas(propuestas);
    hidratarInterruptor(interruptor);
    logger.info(
      `[agente] memoria rehidratada: ${mensajes.length} mensaje(s), ${propuestas.length} propuesta(s), ` +
        `interruptor ${interruptor?.apagado ? 'APAGADO' : 'prendido'}`
    );
    // Los aprobadores se leen ya, para que la lista quede en el log antes del
    // primer voto — y no descubrir en el peor momento que nadie es admin.
    void cargarAprobadores().catch(() => undefined);
    // El alcance se resuelve ya, con todas las sesiones arriba, para que el
    // primer mensaje no lo pague ni lo encuentre a medias.
    _resetAlcanceCache();
    void alcanceVigente().catch(() => undefined);
    // El modelo generativo se baja en segundo plano si no está (1,1 GB, una
    // vez): hasta entonces las consultas van por reglas y embeddings.
    void import('../llm/index.js')
      .then(({ descargarModelo }) => descargarModelo())
      .catch(() => undefined);
  } catch (error) {
    logger.warn(`[agente] no pude rehidratar la memoria: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/** El número y el LID con los que la sesión aparece en los grupos, para reconocer una mención. */
const jidsPropios = async (sessionPhone: string): Promise<string[]> => {
  try {
    const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
    return WhatsAppDirectService.selfJids(sessionPhone);
  } catch {
    return [];
  }
};

/** El sender de la empresa piloto: es la sesión que ve sus grupos. */
export const senderPiloto = async (): Promise<string> => {
  const CompanyModel = await getCompanyModel();
  const company = (await CompanyModel.findOne({ companyId: COMPANY_PILOTO }).lean()) as
    | { whatsappConfig?: { sender?: string } }
    | null;
  return String(company?.whatsappConfig?.sender || '').trim();
};

/**
 * Traduce el NOMBRE del grupo a su JID usando los grupos de la sesión.
 *
 * Si no lo encuentra, loguea los nombres disponibles: sin eso, un nombre mal
 * escrito se ve igual que «no hay nada que avisar» y no habría forma de saber
 * cuál de los dos está pasando.
 *
 * `WhatsAppDirectService` se carga con un import DINÁMICO, y no es capricho:
 * este módulo cuelga del grafo estático de `sessions.simple.ts`, y ese servicio
 * arrastra `outbox-queue`. El test de sesiones mockea `outbox-queue` con dos
 * exports; al aparecer un importador que usa un tercero, el link ESM falla y se
 * lleva puesta la suite entera —62 tests— con un error de sintaxis en un archivo
 * que el test ni nombra. Es el pitfall §13, y el mock por test es el parche: la
 * cura es que el grafo estático no lo toque. Acá adentro se evalúa recién cuando
 * de verdad hay que resolver un nombre.
 */
export const jidPorNombre = async (nombre: string): Promise<GrupoResuelto> => {
  const nada: GrupoResuelto = { jid: '', nombre: '' };
  const sender = await senderPiloto();
  if (!sender) return nada;

  const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
  const grupos = WhatsAppDirectService.listGroups(sender) as Array<{ id?: string; name?: string }>;
  const buscado = normalizarTexto(nombre);
  const encontrado = grupos.find((g) => normalizarTexto(String(g?.name || '')) === buscado);
  // Se devuelve el nombre REAL del grupo, no el de la constante: es el que la
  // gente ve en WhatsApp y el que se muestra en los avisos.
  if (encontrado?.id) return { jid: String(encontrado.id), nombre: String(encontrado.name || nombre) };

  logger.warn(
    `[agente] no encontré el grupo "${nombre}" en la sesión ${sender}. Disponibles: ` +
      grupos.map((g) => `"${g?.name}"`).join(', ')
  );
  return nada;
};
