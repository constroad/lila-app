import { normalizar } from './catalogo.js';

/**
 * «Manda/envía/avisa/pon el aviso (mensaje, programación, producción, pedidos)
 * a planta» — un verbo de mandar, «planta» y algo que mandar. «¿Qué unidad está
 * en planta?» o «clima para planta» no lo son.
 */
export const esOrdenDeAvisoAPlanta = (pregunta: string): boolean => {
  const t = normalizar(pregunta);
  if (!/\bplanta\b/.test(t)) return false;
  const verbo = /\b(manda|mandale|mandar|mandalo|envia|enviale|enviar|envialo|avisa|avisale|avisar|pon|publica|comparte|propon|proponme|prepara|arma|comunica|comunicale|pasa|pasale)\w*\b/.test(t);
  const que = /\b(aviso|mensaje|programacion|produccion|producciones|pedido|pedidos|recordatorio|avisar|comunicado)\b/.test(t);
  return verbo && que;
};
