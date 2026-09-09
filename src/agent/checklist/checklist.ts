/**
 * El checklist de un día de producción. Motor PURO.
 *
 * QUÉ RESUELVE (José, 07/09/2026). «El pedido para hoy se creó a medianoche, se
 * estuvo chateando de eso todo el día, y nadie avisó a planta que había
 * producción a las 4am. Necesito un agente que esté atento a estas cosas, que al
 * entender que habrá despachos pregunte lo básico: ¿ya gestionaron la cuadrilla,
 * el tren? ¿avisaron a los ingenieros? ¿compraron agua, petróleo, los almuerzos?
 * Muchas veces las personas se olvidan de cosas tan básicas.»
 *
 * LA IDEA CENTRAL: **el valor no es la IA, es detectar la AUSENCIA de un hecho.**
 * La mitad del estado de la operación vive en la conversación de WhatsApp y nunca
 * llega a la base. Este módulo no adivina nada: sabe qué debería estar confirmado
 * a esta altura del día y qué no lo está.
 *
 * POR QUÉ NO HAY MODELO ACÁ. Decidir «faltan 4 h y nadie confirmó el petróleo» es
 * un reloj y una lista. Lo único que podría necesitar un modelo es ENTENDER una
 * respuesta libre («ya mandé a Juan por el petróleo» → hecho), y para eso se
 * arranca con palabras clave: en la fase de espejo se mide qué porcentaje de las
 * respuestas reales entiende, y recién ahí se decide si hace falta un modelo.
 * Medir primero, instalar después.
 *
 * PROVISIONAL A PROPÓSITO: los ítems viven acá, en código, y son tres. La UI de
 * super-admin en Portal para editarlos —con checklists por dominio (planta,
 * obra) y por fase (antes, durante, después)— es el paso siguiente. Escribirlos
 * acá primero deja ver el formato funcionando antes de construir la pantalla que
 * lo edita.
 */

export type ChecklistPhase = 'antes' | 'durante' | 'despues';
export type ChecklistDomain = 'planta' | 'obra';

export interface ChecklistItem {
  id: string;
  /** Cómo se pregunta en el grupo. */
  pregunta: string;
  domain: ChecklistDomain;
  phase: ChecklistPhase;
  /** Minutos ANTES del arranque en los que deja de ser "todavía hay tiempo". */
  venceMinutosAntes: number;
  /**
   * Frases que, dichas en el grupo, lo dan por resuelto. Se comparan sin tildes
   * ni mayúsculas. Es el reemplazo del modelo en la fase de espejo.
   */
  seSatisfaceCon: string[];
}

/**
 * Los tres primeros, los que José nombró como «lo básico que se olvidan».
 * Vencen escalonados: lo que hay que comprar necesita más anticipación que un
 * aviso.
 */
export const CHECKLIST_PRODUCCION: ChecklistItem[] = [
  {
    id: 'aviso-planta',
    pregunta: '¿Ya avisaron a planta que hay producción?',
    domain: 'planta',
    phase: 'antes',
    venceMinutosAntes: 12 * 60,
    seSatisfaceCon: ['avise a planta', 'avisamos a planta', 'planta avisada', 'ya sabe planta'],
  },
  {
    id: 'cuadrilla',
    pregunta: '¿Ya está la cuadrilla y el tren?',
    domain: 'obra',
    phase: 'antes',
    venceMinutosAntes: 8 * 60,
    seSatisfaceCon: ['cuadrilla lista', 'ya esta la cuadrilla', 'tren listo', 'cuadrilla confirmada'],
  },
  {
    id: 'combustible',
    pregunta: '¿Ya compraron petróleo y agua?',
    domain: 'planta',
    phase: 'antes',
    venceMinutosAntes: 6 * 60,
    seSatisfaceCon: ['compramos petroleo', 'ya hay petroleo', 'petroleo listo', 'ya compre el petroleo'],
  },
];

/** Sin tildes, sin mayúsculas y sin espacios de más: así se compara texto de chat. */
export const normalizarTexto = (texto: string): string =>
  String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * ¿Algo de lo que se dijo en el grupo da por resuelto este ítem?
 *
 * Deliberadamente simple. Su tasa de acierto es un DATO que la fase de espejo va
 * a medir contra mensajes reales; no es una apuesta a que las palabras clave
 * alcanzan, es el punto de partida contra el que se compara cualquier modelo.
 */
export const itemSatisfecho = (item: ChecklistItem, mensajes: string[]): boolean => {
  const dichos = mensajes.map(normalizarTexto);
  return item.seSatisfaceCon.some((frase) => {
    const clave = normalizarTexto(frase);
    return dichos.some((dicho) => dicho.includes(clave));
  });
};

export interface EstadoItem {
  item: ChecklistItem;
  satisfecho: boolean;
  /** Minutos que faltan para el arranque. Negativo = ya arrancó. */
  minutosParaArranque: number;
  /** `true` si ya pasó su vencimiento y sigue sin confirmarse. */
  vencido: boolean;
}

export interface EvaluacionChecklist {
  /** Todo lo que sigue sin confirmarse y YA venció: esto es lo que se avisa. */
  pendientes: EstadoItem[];
  /** Sin confirmar pero todavía con tiempo. No se avisa: sería ruido. */
  enTiempo: EstadoItem[];
  resueltos: EstadoItem[];
  minutosParaArranque: number;
}

/**
 * El estado del checklist para un día de producción.
 *
 * `arranqueMs` y `ahoraMs` son instantes; quien llama los resuelve en hora de
 * Lima. Acá no se construye ninguna fecha: es aritmética sobre milisegundos, así
 * que la zona del proceso no puede correr nada (el bug #1 del catálogo).
 */
export const evaluarChecklist = (params: {
  items: ChecklistItem[];
  arranqueMs: number;
  ahoraMs: number;
  /** Mensajes observados en el grupo para ese día de producción. */
  mensajes: string[];
}): EvaluacionChecklist => {
  const minutosParaArranque = Math.round((params.arranqueMs - params.ahoraMs) / 60_000);

  const estados: EstadoItem[] = params.items.map((item) => {
    const satisfecho = itemSatisfecho(item, params.mensajes);
    return {
      item,
      satisfecho,
      minutosParaArranque,
      vencido: !satisfecho && minutosParaArranque <= item.venceMinutosAntes,
    };
  });

  return {
    pendientes: estados.filter((e) => e.vencido),
    enTiempo: estados.filter((e) => !e.satisfecho && !e.vencido),
    resueltos: estados.filter((e) => e.satisfecho),
    minutosParaArranque,
  };
};
