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
 * PROVISIONAL A PROPÓSITO: los ítems viven acá, en código. Son los catorce que
 * José dictó el 12/09/2026, en dos dominios (planta y campo). La UI de
 * super-admin en Portal para editarlos es el paso siguiente. Escribirlos acá
 * primero deja ver el formato funcionando antes de construir la pantalla que lo
 * edita.
 */

export type ChecklistPhase = 'antes' | 'durante' | 'despues';
export type ChecklistDomain = 'planta' | 'obra';

export interface ChecklistItem {
  id: string;
  /** Cómo se lo nombra en dos palabras («aviso a planta»), para listas y resúmenes. */
  titulo: string;
  /** Cómo se pregunta en el grupo. */
  pregunta: string;
  domain: ChecklistDomain;
  phase: ChecklistPhase;
  /** Minutos ANTES del arranque en los que deja de ser "todavía hay tiempo". */
  venceMinutosAntes: number;
  /**
   * Lo que se pregunta en la ÚLTIMA LLAMADA (2 h antes) si sigue sin confirmar.
   * A esa hora ya no se coordina una comida; sí importa que haya petróleo y que
   * los operadores sepan. Lo demás, a esa altura, es ruido.
   */
  critico?: boolean;
  /**
   * Frases que, dichas en el grupo, lo dan por resuelto. Se comparan sin tildes
   * ni mayúsculas. Es el reemplazo del modelo en la fase de espejo.
   */
  seSatisfaceCon: string[];
}

/**
 * EL CHECKLIST DE JOSÉ (12/09/2026), en sus palabras y en su orden. Dos dominios
 * porque son dos grupos de gente distintos: lo de PLANTA lo revisa la
 * administración de la planta; lo de CAMPO (obra), quien arma la cuadrilla.
 *
 * Todos vencen 12 h antes del arranque — la tarde anterior para una producción
 * de madrugada. Es un valor PROVISIONAL: José no fijó vencimientos y esto es lo
 * que hace que la revisión salga entera de una vez, como una lista, en vez de
 * gotear una pregunta por hora. Cuando exista la UI se afina por ítem.
 *
 * Las frases de `seSatisfaceCon` son semillas: hoy las compara el matcher; el
 * clasificador por embeddings (medido 17/19 el 12/09) usa las mismas como
 * centroides. Escribirlas como habla la gente, no como habla el sistema.
 */
const VENCE_TARDE_ANTERIOR = 12 * 60;

export const CHECKLIST_PLANTA: ChecklistItem[] = [
  {
    id: 'agregados',
    critico: true,
    titulo: 'agregados',
    pregunta: '¿Tenemos suficientes agregados?',
    domain: 'planta',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['agregados suficientes', 'hay agregados', 'agregados listos', 'tenemos agregados', 'agregado suficiente'],
  },
  {
    id: 'petroleo-planta',
    critico: true,
    titulo: 'petróleo de planta',
    pregunta: '¿Hay combustible (petróleo) suficiente?',
    domain: 'planta',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['hay petroleo', 'petroleo suficiente', 'petroleo listo', 'combustible suficiente', 'hay combustible', 'tenemos petroleo'],
  },
  {
    id: 'gasohol',
    titulo: 'gasohol',
    pregunta: '¿Hay gasohol?',
    domain: 'planta',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['hay gasohol', 'gasohol listo', 'tenemos gasohol', 'gasohol suficiente'],
  },
  {
    id: 'operadores',
    critico: true,
    titulo: 'aviso a operadores',
    pregunta: '¿Se avisó a los operadores?',
    domain: 'planta',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['avise a los operadores', 'operadores avisados', 'avisamos a los operadores', 'los operadores ya saben', 'ya le avise al operador'],
  },
  {
    id: 'riesgos',
    titulo: 'mantenimiento o riesgos',
    pregunta: '¿Hay algún mantenimiento pendiente o riesgo para esta producción?',
    domain: 'planta',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['sin riesgos', 'no hay riesgo', 'sin mantenimiento pendiente', 'planta operativa', 'todo operativo', 'sin novedad en planta'],
  },
  {
    id: 'clima',
    critico: true,
    titulo: 'clima',
    pregunta: '¿Revisaron el clima? ¿Es viable asfaltar?',
    domain: 'planta',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['clima ok', 'clima revisado', 'revisamos el clima', 'no hay lluvia', 'viable asfaltar', 'sin lluvia'],
  },
];

export const CHECKLIST_CAMPO: ChecklistItem[] = [
  {
    id: 'cuadrilla',
    titulo: 'cuadrilla',
    pregunta: '¿Se programó a la cuadrilla?',
    domain: 'obra',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['cuadrilla lista', 'cuadrilla programada', 'ya esta la cuadrilla', 'cuadrilla confirmada', 'programamos la cuadrilla'],
  },
  {
    id: 'tren',
    titulo: 'tren de asfalto',
    pregunta: '¿Tenemos el tren de asfalto listo?',
    domain: 'obra',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['tren listo', 'tren de asfalto listo', 'el tren ya esta', 'tren confirmado', 'tren en obra'],
  },
  {
    id: 'imprimacion',
    titulo: 'imprimación / riego de liga',
    pregunta: 'Si hay imprimación o riego de liga: ¿el proveedor está asegurado?',
    domain: 'obra',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['imprimacion asegurada', 'proveedor de imprimacion confirmado', 'riego de liga listo', 'no hay imprimacion', 'sin imprimacion', 'no lleva imprimacion'],
  },
  {
    id: 'herramientas',
    titulo: 'herramientas',
    pregunta: '¿Qué herramientas se llevan? (plancha, chupetero, pisón)',
    domain: 'obra',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['herramientas listas', 'plancha lista', 'llevamos plancha', 'herramientas cargadas', 'pison listo', 'chupetero listo'],
  },
  {
    id: 'arena-o-aceite',
    titulo: 'arena o aceite',
    pregunta: '¿Compraron la arena para rociar, o se usará aceite?',
    domain: 'obra',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['compramos la arena', 'arena lista', 'hay arena', 'usamos aceite', 'va con aceite', 'aceite listo'],
  },
  {
    id: 'combustible-cuadrilla',
    titulo: 'petróleo y gasolina de cuadrilla',
    pregunta: '¿Compraron el petróleo para la cuadrilla y la gasolina para la plancha?',
    domain: 'obra',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['compramos petroleo', 'petroleo comprado', 'gasolina lista', 'compramos la gasolina', 'petroleo y gasolina listos', 'ya compre el petroleo'],
  },
  {
    id: 'agua-cuadrilla',
    titulo: 'agua de cuadrilla',
    pregunta: '¿Está lista el agua para la cuadrilla?',
    domain: 'obra',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['agua lista', 'hay agua', 'compramos el agua', 'agua comprada', 'ya esta el agua'],
  },
  {
    id: 'comidas',
    titulo: 'comidas en campo',
    pregunta: '¿Ya coordinaron las comidas en campo?',
    domain: 'obra',
    phase: 'antes',
    venceMinutosAntes: VENCE_TARDE_ANTERIOR,
    seSatisfaceCon: ['comidas coordinadas', 'almuerzos coordinados', 'ya esta la comida', 'comida lista', 'coordinamos las comidas', 'almuerzo listo'],
  },
];

/** Todo el checklist de un día de producción: planta y campo, en ese orden. */
export const CHECKLIST_PRODUCCION: ChecklistItem[] = [...CHECKLIST_PLANTA, ...CHECKLIST_CAMPO];

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

export interface Revision {
  /** Sin confirmar, en el orden del checklist. */
  pendientes: ChecklistItem[];
  resueltos: ChecklistItem[];
}

/**
 * La revisión de un HORARIO (ver `dia.momentoVigente`): qué sigue sin confirmar,
 * sin mirar vencimientos — el horario ya decidió que es momento de preguntar.
 * En la última llamada solo lo crítico.
 */
export const evaluarRevision = (
  items: ChecklistItem[],
  mensajes: string[],
  opciones: { soloCriticos?: boolean } = {}
): Revision => {
  const considerados = opciones.soloCriticos ? items.filter((i) => i.critico) : items;
  const pendientes: ChecklistItem[] = [];
  const resueltos: ChecklistItem[] = [];
  for (const item of considerados) {
    (itemSatisfecho(item, mensajes) ? resueltos : pendientes).push(item);
  }
  return { pendientes, resueltos };
};
