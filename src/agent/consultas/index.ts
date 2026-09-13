import logger from '../../utils/logger.js';
import { CATALOGO, esConsulta, extraerParametros, fueraDeCatalogo, preguntaLimpia, rutearPorReglas, type ClaveConsulta } from './catalogo.js';
import { construirVista } from './vista.js';
import { responder } from './responder.js';
import { cargarModelo, clasificar } from '../checklist/semantica.js';
import { enviarAOperaciones } from '../checklist/emisor.js';
import { diaPeruano } from '../checklist/tiempo.js';
import { revisionDelDia } from '../checklist/detector.js';

export { esConsulta };

/**
 * Una pregunta `@lila …` del grupo que se escucha. EN ESPEJO (spec §4.2): la
 * respuesta va al grupo de operaciones citando quién preguntó y qué, no al
 * grupo donde se preguntó. Primero se mide cuántas veces acierta; después se
 * le da voz.
 *
 * Nunca lanza: cuelga del listener.
 */
const UMBRAL_RUTEO = 0.85;

export const rutear = async (pregunta: string): Promise<ClaveConsulta | null> => {
  // La lista negra gana también sobre el modelo: un embedding no sabe qué es un precio.
  if (fueraDeCatalogo(pregunta)) return null;
  const porRegla = rutearPorReglas(pregunta);
  if (porRegla) return porRegla;
  const embed = await cargarModelo();
  if (!embed) return null;
  const [mejor] = await clasificar(CATALOGO, [pregunta], embed);
  return mejor && mejor.similitud >= UMBRAL_RUTEO ? (mejor.itemId as ClaveConsulta) : null;
};

export const atenderConsulta = async (texto: string, quien: string, numeroBot?: string): Promise<void> => {
  try {
    const pregunta = preguntaLimpia(texto, numeroBot);
    const clave = await rutear(pregunta);
    const params = extraerParametros(pregunta);
    const fecha = diaPeruano(Date.now() + (params.day === 'tomorrow' ? 24 * 3_600_000 : 0));
    const vista = await construirVista(fecha);
    const revision = clave === 'checklist_status' ? await revisionDelDia(fecha) : null;
    const respuesta = responder(clave, { vista, params, revision });

    logger.info(`[agente] consulta de ${quien}: «${pregunta}» → ${clave ?? 'none'} ${JSON.stringify(params)}`);
    await enviarAOperaciones(`💬 *Pregunta en el grupo* (${quien.split('@')[0]}): «${pregunta}»\n\n${respuesta}`);
  } catch (error) {
    logger.warn(`[agente] no pude atender la consulta «${texto}»: ${error instanceof Error ? error.message : String(error)}`);
  }
};
