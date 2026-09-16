/**
 * QUIÉN ES DE QUÉ EMPRESA, por su número de WhatsApp (José, 16/09: «anuncio
 * sin empresa: vale la empresa del autor»). Semilla leída de los anuncios
 * reales de INFRAMAQ admin (14–15/09): quien anunció «Consorcio Lomas» y
 * «producción en INFRAMAQ 2 días» es de Globofast; José es de ConstRoad. Los
 * demás miembros no se adivinan: un anuncio suyo sin empresa queda «por
 * confirmar» y se pregunta. Se completa con la config del agente (`autores`,
 * { [jid]: companyId }), que pisa a la semilla.
 */
export const AUTORES_SEMILLA: Record<string, string> = {
  '227049671282807@lid': 'globofas-s8k',
  '173066143440987@lid': 'constroad',
};

const NOMBRES: Record<string, string> = { 'globofas-s8k': 'Globofast Solkali', constroad: 'ConstRoad', 'inframaq-iax': 'Inframaq' };

let autores: Record<string, string> = { ...AUTORES_SEMILLA };

export const hidratarAutores = (config: Record<string, string> | null | undefined): void => {
  autores = { ...AUTORES_SEMILLA, ...(config ?? {}) };
};

export const alias = (jid: string): { companyId: string; empresa: string } | null => {
  const companyId = autores[jid];
  return companyId ? { companyId, empresa: NOMBRES[companyId] ?? companyId } : null;
};
