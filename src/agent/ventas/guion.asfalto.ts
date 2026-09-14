/**
 * EL GUION DEL VERTICAL ASFALTO: qué pregunta María por cada servicio, en qué
 * orden y con qué condición. Sale del spec del agente comercial
 * (`specs/ESPECIFICACIONES_IA_BOT.md` §1–3): colocación pregunta área,
 * distrito, espesor, base, imprimación —y si va, MC-30 o riego de liga, y
 * bastón o barra—, fresado y tipo de terreno; venta pregunta proyecto y
 * tráfico y con eso recomienda mezcla y espesor; transporte pide carga,
 * descarga, mezcla, cantidad y restricciones; fabricación se deriva.
 *
 * DÓNDE SE DEFINEN LAS REGLAS (José, 14/09: «ni siquiera me has preguntado
 * dónde definir las reglas, la memoria, la DB»):
 *   - Las preguntas y sus opciones: ACÁ (el default, en código). Si existe
 *     `bot_configs.guion` para la empresa (Mongo), reemplaza este entero, así
 *     se edita sin deploy —y desde Portal cuando exista el panel (F4)—.
 *   - La persona y el tono: `prompt.asfalto.ts` (solo lo usa el modo con
 *     modelo grande; en el guiado los textos son los de acá y de `guiado.ts`).
 *   - La memoria de cada conversación: `bot_conversations.lead` (este estado:
 *     servicio y respuestas) y `bot_conversation_messages` (los mensajes, 90 d).
 *   - Los datos del cliente: `clients` (por teléfono) y sus últimos `orders`.
 *
 * CÓMO SE LEE UNA RESPUESTA. Cada opción tiene `alias` (con qué palabras se
 * elige cuando ESTA fue la última pregunta: «sí», «la segunda», «con barra») y
 * `senal` (palabras inequívocas que la eligen en cualquier mensaje, aunque no
 * se haya preguntado: «MC-30», «riego de liga», «sin fresado»). Las señales se
 * prueban en el orden declarado: lo negativo va primero para que «sin
 * imprimación» no lea «imprimación».
 */

export type TipoPregunta = 'texto' | 'numero' | 'sino' | 'opcion';

export interface OpcionGuion {
  valor: string;
  /** Regex (sin tildes, minúsculas) que la eligen cuando esta pregunta fue la última. */
  alias: string[];
  /** Regex inequívocos que la eligen en cualquier mensaje. */
  senal?: string[];
  /** Lo que se le dice al elegirla: una recomendación, por ejemplo. */
  sugerencia?: string;
}

export interface PreguntaGuion {
  campo: string;
  /** Cómo se llama el dato en el resumen y en el aviso al asesor. */
  etiqueta: string;
  pregunta: string;
  tipo: TipoPregunta;
  opciones?: OpcionGuion[];
  /** Solo se pregunta si otra respuesta vale esto. */
  cuando?: { campo: string; es: string | string[] };
  /** Ayuda si no se entendió la primera vez. */
  pista?: string;
  /** Si el cliente pregunta «¿qué es…?», esto se le explica antes de volver a preguntar. */
  explicacion?: string;
}

export interface ServicioGuion {
  id: 'venta' | 'colocacion' | 'transporte' | 'fabricacion';
  nombre: string;
  /** Con qué palabras se reconoce en el mensaje (regex, sin tildes) cuando todavía no hay servicio. */
  alias: string;
  /**
   * Con qué palabras CAMBIA un servicio ya fijado: solo las que lo nombran
   * («y si es asfaltado», «solo la mezcla»), nunca una unidad ni un lugar. Sin
   * esto, se usa `alias`.
   */
  cambio?: string;
  /** Se deriva de inmediato a una persona. */
  derivar?: string;
  preguntas: PreguntaGuion[];
}

export interface Guion {
  servicios: ServicioGuion[];
  /** Preguntas comunes al final de cualquier servicio (fecha, nombre). */
  cierre: PreguntaGuion[];
}

const NO = ['^no\\b', '\\bno (hace falta|necesito|quiero|gracias|por ahora|va)', '\\bsin\\b', '\\bnada\\b', '\\bningun', '\\btampoco\\b', '\\bnegativo\\b'];
const SI = ['^si\\b', '\\bsi\\b', '\\bclaro\\b', '\\bdale\\b', 'por favor', '\\bquiero\\b', '\\bnecesito\\b', '\\bhagan\\b', '\\bok\\b', 'de una', '^ya\\b', 'por supuesto', '\\bcorrecto\\b', '\\bafirmativo\\b'];

const ESPESOR: PreguntaGuion = {
  campo: 'espesor',
  etiqueta: 'Espesor',
  pregunta: '¿Qué espesor buscas? 1" para tráfico ligero (patios, cocheras), 2" para calles y estacionamientos, 3" para tráfico pesado. Si no sabes, dime qué vehículos van a circular.',
  tipo: 'opcion',
  opciones: [
    { valor: '3"', alias: ['\\b3\\s*(pulgada|pulg|")', 'tres pulgada', '\\bpesad', 'camion', 'trailer', 'maquinaria', 'industrial', 'la tercera'], senal: ['\\b3\\s*(pulgada|pulg|")', 'tres pulgadas'] },
    { valor: '2"', alias: ['\\b2\\s*(pulgada|pulg|")', 'dos pulgada', '\\bmedio\\b', '\\bcalle', 'estacionamiento', 'camioneta', 'la segunda'], senal: ['\\b2\\s*(pulgada|pulg|")', 'dos pulgadas'] },
    { valor: '1"', alias: ['\\b1\\s*(pulgada|pulg|")', 'una pulgada', 'ligero', '\\bautos?\\b', 'cochera', 'la primera'], senal: ['\\b1\\s*(pulgada|pulg|")', 'una pulgada'] },
  ],
  pista: 'Con 1", 2" o 3" me basta; o dime si van autos, camiones o maquinaria pesada.',
};

const TIPO_MEZCLA: PreguntaGuion = {
  campo: 'tipoMezcla',
  etiqueta: 'Mezcla',
  pregunta: '¿La mezcla va en caliente (lo usual para vías y estacionamientos), en frío (parches y reparaciones) o modificada con polímeros (alto tráfico, zonas industriales)?',
  tipo: 'opcion',
  opciones: [
    { valor: 'modificada con polímeros', alias: ['modificad', 'polimero', 'alto trafico', 'la tercera'], senal: ['polimero', 'modificada'] },
    { valor: 'en frío', alias: ['\\bfrio\\b', 'parche', 'reparacion', 'bache', 'la segunda'], senal: ['en frio'] },
    { valor: 'en caliente', alias: ['caliente', 'normal', 'la usual', 'convencional', 'la primera'], senal: ['en caliente'] },
  ],
  pista: 'En caliente, en frío o modificada con polímeros.',
};

const CANTIDAD_M3: PreguntaGuion = { campo: 'cantidad', etiqueta: 'Cantidad', pregunta: '¿Cuántos m³ necesitas? Si no lo sabes, dime el área en m² y con el espesor lo calculamos.', tipo: 'numero', pista: 'Un aproximado en m³ (o el área en m²) me sirve.' };

export const GUION_ASFALTO: Guion = {
  servicios: [
    {
      id: 'fabricacion',
      nombre: 'fabricación de mezcla especial',
      alias: '\\b(fabric(ar|acion|an|a)|diseno de mezcla|mezcla especial|formula)\\b',
      derivar: 'fabricación de mezcla especial: la ve un ingeniero',
      preguntas: [],
    },
    {
      id: 'colocacion',
      nombre: 'asfaltado (colocación)',
      alias: '\\b(asfalt(ar|ado|ada|en|amos|e|as)|pavimentar|pavimentacion|coloc(ar|acion|an|ado)|coloqu(en|e)|parch(e|ar|es|ado|eo)|imprimar|imprimacion|fresa(r|do)|recapeo|las dos cosas|ambas cosas)\\b',
      cambio: '\\b(asfalt(ar|ado|ada|en)|pavimentar|pavimentacion|coloc(ar|acion|an|ado)|coloqu(en|e)|parch(ar|eo)|recapeo|las dos cosas|ambas cosas)\\b',
      preguntas: [
        { campo: 'area', etiqueta: 'Área', pregunta: '¿Cuántos m² necesitas asfaltar, aproximadamente?', tipo: 'numero', pista: 'Un aproximado en m² me sirve.' },
        { campo: 'distrito', etiqueta: 'Lugar', pregunta: '¿En qué distrito está la obra?', tipo: 'texto' },
        ESPESOR,
        {
          campo: 'base',
          etiqueta: 'Base',
          pregunta: '¿La base ya está preparada (afirmado compactado) o es terreno natural?',
          tipo: 'opcion',
          opciones: [
            { valor: 'terreno natural', alias: ['natural', 'tierra', 'terreno', 'sin preparar', 'no esta', 'falta', 'no tengo', 'la segunda'], senal: ['terreno natural', 'sin afirmar', 'sin preparar', 'es tierra', 'puro terreno'] },
            { valor: 'preparada', alias: ['preparad', 'afirmado', 'compactad', 'lista', 'ya esta', 'ya tengo', 'ya cuento', 'la primera', 'pavimento', 'asfalto', 'concreto'], senal: ['afirmado', 'compactad', 'base preparada', 'base lista', 'ya (tengo|tenemos|cuento con) (la )?base'] },
          ],
          pista: 'Base preparada (afirmado compactado) o terreno natural.',
        },
        {
          campo: 'tipoBase',
          etiqueta: 'Superficie',
          pregunta: '¿Es base nueva o va sobre pavimento existente?',
          tipo: 'opcion',
          opciones: [
            {
              valor: 'pavimento existente',
              alias: ['existente', 'pavimento', 'asfalto viejo', 'sobre asfalto', 'antiguo', 'recapeo', 'encima', 'concreto', 'la segunda'],
              senal: ['pavimento existente', 'sobre (el )?pavimento', 'asfalto (viejo|antiguo|deteriorado)', 'sobre (el )?asfalto', 'recapeo', 'encima del asfalto', 'concreto viejo'],
            },
            { valor: 'base nueva', alias: ['nueva', 'nuevo', 'afirmado', 'compactad', 'la primera'], senal: ['base nueva'] },
          ],
          cuando: { campo: 'base', es: 'preparada' },
          pista: 'Base nueva, o sobre pavimento existente.',
        },
        {
          campo: 'imprimacion',
          etiqueta: 'Imprimación',
          pregunta: '¿Deseas que hagamos la imprimación (la preparación de la superficie antes del asfalto)?',
          tipo: 'sino',
          opciones: [
            { valor: 'no', alias: NO, senal: ['sin imprimacion', 'sin imprimar', 'sin imprimante', 'no (necesito|quiero|hace falta|va|lleva) (la |el )?imprim'] },
            { valor: 'sí', alias: SI, senal: ['con imprimacion', 'con imprimante', '\\bimprimar\\b', '\\bimprimacion\\b', 'mc-?30', 'riego de liga'] },
          ],
          pista: 'Con un sí o un no me basta.',
          explicacion: 'La imprimación es el riego que prepara la superficie para que el asfalto adhiera: MC-30 (asfalto líquido) en base nueva, riego de liga (emulsión) sobre pavimento existente.',
        },
        {
          campo: 'imprimante',
          etiqueta: 'Imprimante',
          pregunta: '¿Con MC-30 o con riego de liga? (el MC-30, asfalto líquido, va en base nueva; el riego de liga, emulsión, sobre pavimento existente)',
          tipo: 'opcion',
          opciones: [
            { valor: 'riego de liga', alias: ['riego', 'liga', 'emulsion', 'la segunda', 'pavimento'], senal: ['riego de liga', 'emulsion'] },
            { valor: 'MC-30', alias: ['\\bmc\\b', 'mc-?30', 'liquido', 'la primera', 'base nueva'], senal: ['mc-?30'] },
          ],
          cuando: { campo: 'imprimacion', es: 'sí' },
          pista: 'MC-30 o riego de liga.',
          explicacion: 'El MC-30 es asfalto líquido de curado medio, para imprimar base nueva; el riego de liga es una emulsión que pega el asfalto nuevo sobre pavimento existente.',
        },
        {
          campo: 'aplicacion',
          etiqueta: 'Aplicación',
          pregunta: '¿La aplicación con bastón (manual) o con barra regadora? (la barra controla la tasa de dosificación; hace falta si piden certificación técnica)',
          tipo: 'opcion',
          opciones: [
            { valor: 'barra', alias: ['barra', 'dosificacion', 'controlad', 'certificad', 'la segunda'], senal: ['barra regadora', 'con barra', '\\bbarra\\b'] },
            { valor: 'bastón', alias: ['baston', 'manual', 'la primera', 'economic'], senal: ['con baston', '\\bbaston\\b'] },
          ],
          cuando: { campo: 'imprimacion', es: 'sí' },
          pista: 'Bastón o barra.',
          explicacion: 'Con bastón la aplicación es manual, la estándar y más económica; con barra regadora se controla la tasa de dosificación, necesario si piden certificación técnica.',
        },
        {
          campo: 'fresado',
          etiqueta: 'Fresado',
          pregunta: '¿Necesitas que removamos el asfalto viejo antes de colocar (fresado)?',
          tipo: 'sino',
          opciones: [
            { valor: 'no', alias: NO, senal: ['sin fresado', 'sin fresar', 'no (necesito|quiero|hace falta|va) (el )?fres'] },
            { valor: 'sí', alias: SI, senal: ['con fresado', '\\bfresar\\b', '\\bfresado\\b', '(remover|retirar|sacar) el asfalto'] },
          ],
          cuando: { campo: 'tipoBase', es: 'pavimento existente' },
          pista: 'Con un sí o un no me basta.',
          explicacion: 'El fresado es remover en frío las capas de asfalto deteriorado antes de colocar el nuevo.',
        },
        {
          campo: 'terreno',
          etiqueta: 'Terreno',
          pregunta: '¿Cómo es el área: plana, con pendiente, son calles, o es un tiro largo (área extensa sin obstáculos)?',
          tipo: 'opcion',
          opciones: [
            { valor: 'con pendiente', alias: ['pendiente', 'subida', 'bajada', '\\b(en|una|de|la) cuesta\\b', 'inclinad', 'desnivel', 'la segunda'], senal: ['pendiente', '\\b(en|una) cuesta\\b', 'inclinad', 'desnivel'] },
            { valor: 'tiro largo', alias: ['tiro largo', 'extens', 'sin obstaculos', 'la cuarta'], senal: ['tiro largo'] },
            { valor: 'calles', alias: ['\\bcalle', 'jiron', 'pasaje', 'avenida', 'urbanizacion', 'vereda', 'poste', 'la tercera'], senal: ['\\bcalles\\b', 'con veredas', 'jirones'] },
            { valor: 'plano', alias: ['\\bplan[oa]\\b', 'llano', 'parejo', 'nivelad', 'la primera'], senal: ['es plan[oa]\\b', 'terreno plano', 'area plana', 'zona plana', 'bastante plan[oa]', 'todo plano'] },
          ],
          pista: 'Plana, con pendiente, calles o tiro largo.',
          explicacion: 'Plano es lo estándar; con pendiente pide más cuidado al compactar; calles tienen veredas y postes y llevan más detalle; tiro largo es un área extensa sin obstáculos.',
        },
      ],
    },
    {
      id: 'transporte',
      nombre: 'transporte de mezcla',
      // «Transportes Paredes» es una empresa, no un pedido: sin el plural.
      alias: '\\b(transport(e|ar|an|en)|traslad(o|ar|en)|flete|acarreo)\\b',
      preguntas: [
        { campo: 'puntoCarga', etiqueta: 'Carga', pregunta: '¿De dónde recogemos la mezcla?', tipo: 'texto', pista: 'Dime la planta o la dirección donde se recoge.' },
        { campo: 'puntoDescarga', etiqueta: 'Descarga', pregunta: '¿A dónde la llevamos?', tipo: 'texto', pista: 'Dime el distrito o la dirección de la obra.' },
        TIPO_MEZCLA,
        { campo: 'cantidad', etiqueta: 'Cantidad', pregunta: '¿Cuántos m³ son?', tipo: 'numero', pista: 'Un aproximado en m³ me sirve.' },
        { campo: 'restricciones', etiqueta: 'Restricciones', pregunta: '¿Hay restricción de horario, o la zona es de difícil acceso?', tipo: 'texto', pista: 'Si no hay ninguna, dime «ninguna».' },
      ],
    },
    {
      id: 'venta',
      nombre: 'venta de mezcla asfáltica',
      alias: '\\b(mezcla|cubos?|m3|m³|metros cubicos|compr(ar|a|o)|venta|vend(er|en|an)|material|toneladas?)\\b|\\d\\s*(m3|m³|cubos?)\\b',
      cambio: '\\b(compr(ar|a|o)|venta|vend(er|en|an)|solo (la |el )?(mezcla|material|asfalto)|yo (lo|la) coloco|nosotros (lo|la) colocamos|(la )?colocacion la (hacemos|hago|vemos) nosotros|colocamos nosotros)\\b',
      preguntas: [
        {
          campo: 'tipoProyecto',
          etiqueta: 'Proyecto',
          pregunta: '¿Para qué es la mezcla: una vía, un estacionamiento, un patio, una zona industrial…?',
          tipo: 'opcion',
          opciones: [
            { valor: 'parches', alias: ['parch', 'bache', 'reparacion', 'la quinta'], senal: ['parch', 'bache'] },
            { valor: 'zona industrial', alias: ['industrial', 'planta', 'fabrica', 'la cuarta'], senal: ['zona industrial', 'industrial'] },
            { valor: 'estacionamiento', alias: ['estacionamiento', 'parqueo', 'playa', 'la segunda'], senal: ['estacionamiento', 'parqueo', 'playa de estacionamiento'] },
            { valor: 'patio', alias: ['patio', 'cochera', 'casa', 'almacen', 'la tercera'], senal: ['\\bpatio\\b', 'cochera', 'mi casa'] },
            { valor: 'vía', alias: ['\\bvia\\b', 'pista', 'carretera', 'calle', 'avenida', 'jiron', 'la primera'], senal: ['\\bvia\\b', 'carretera', 'la pista', 'la calle', 'avenida', 'jiron'] },
          ],
          pista: 'Vía, estacionamiento, patio, zona industrial o parches.',
        },
        {
          campo: 'trafico',
          etiqueta: 'Tráfico',
          pregunta: '¿Qué va a circular: autos, camiones o maquinaria pesada?',
          tipo: 'opcion',
          opciones: [
            {
              valor: 'pesado (maquinaria)',
              alias: ['\\bpesad', 'maquinaria', 'trailer', 'volquete', 'industrial', 'la tercera'],
              senal: ['maquinaria pesada', 'trailer', 'volquete', 'trafico pesado', 'carga pesada'],
              sugerencia: 'Para tráfico pesado lo usual es mezcla en caliente de 3", o modificada con polímeros si es zona industrial.',
            },
            {
              valor: 'medio (camionetas y camiones)',
              alias: ['camioneta', '\\bmedio\\b', 'camion', '\\bbus', 'combi', 'la segunda'],
              senal: ['camioneta', 'camion', '\\bbuses\\b', '\\bcombis\\b', 'trafico medio'],
              sugerencia: 'Para autos y camionetas lo usual es mezcla en caliente de 2".',
            },
            {
              valor: 'ligero (autos)',
              alias: ['\\bautos?\\b', 'ligero', 'liviano', 'moto', 'peaton', 'la primera'],
              senal: ['solo autos', 'autos particulares', 'trafico ligero', 'autos y motos'],
              sugerencia: 'Para tráfico ligero lo usual es mezcla en caliente de 1".',
            },
          ],
          pista: 'Autos, camiones o maquinaria pesada.',
        },
        TIPO_MEZCLA,
        ESPESOR,
        {
          campo: 'entrega',
          etiqueta: 'Entrega',
          pregunta: '¿Lo recoges en planta o te lo llevamos puesto en obra?',
          tipo: 'opcion',
          opciones: [
            { valor: 'puesto en obra', alias: ['\\bobra\\b', 'llev', 'traig', 'puesto', 'entreg', 'domicilio', 'la segunda'], senal: ['puest[oa]s? en obra', 'puest[oa]s? en [a-z]', 'a (la |mi )?obra', 'me lo (llevan|traen)', 'a domicilio', 'lo lleven', 'lo traigan'] },
            { valor: 'en planta', alias: ['planta', 'recoj', 'recog', 'yo lo llevo', 'nosotros', 'mi camion', 'la primera'], senal: ['recoj\\w* en (su |la )?planta', 'en (su |la )?planta', 'lo recojo', 'con mi camion', 'yo lo (llevo|recojo)', 'mi transporte'] },
          ],
          pista: 'En planta o puesto en obra.',
        },
        { campo: 'distrito', etiqueta: 'Lugar', pregunta: '¿A qué distrito o ubicación sería la entrega?', tipo: 'texto', cuando: { campo: 'entrega', es: 'puesto en obra' } },
        CANTIDAD_M3,
      ],
    },
  ],
  cierre: [
    { campo: 'fecha', etiqueta: 'Para', pregunta: '¿Para cuándo lo necesitas?', tipo: 'texto' },
    { campo: 'nombre', etiqueta: 'A nombre de', pregunta: '¿A nombre de quién preparamos la cotización? (y empresa, si aplica)', tipo: 'texto' },
  ],
};

const preguntaValida = (p: unknown): p is PreguntaGuion => {
  const q = p as PreguntaGuion | null;
  if (!q || typeof q.campo !== 'string' || typeof q.etiqueta !== 'string' || typeof q.pregunta !== 'string') return false;
  if (!['texto', 'numero', 'sino', 'opcion'].includes(q.tipo)) return false;
  if (q.tipo === 'sino' || q.tipo === 'opcion') {
    if (!Array.isArray(q.opciones) || !q.opciones.length) return false;
    if (!q.opciones.every((o) => o && typeof o.valor === 'string' && Array.isArray(o.alias))) return false;
  }
  return true;
};

/** El guion guardado en `bot_configs.guion`, si tiene la forma; si no, el default. */
export const guionDe = (v: unknown): Guion => {
  const g = v as Guion | null | undefined;
  if (!g || !Array.isArray(g.servicios) || !Array.isArray(g.cierre)) return GUION_ASFALTO;
  const ok =
    g.servicios.every((s) => s && ['venta', 'colocacion', 'transporte', 'fabricacion'].includes(s.id) && typeof s.nombre === 'string' && typeof s.alias === 'string' && Array.isArray(s.preguntas) && s.preguntas.every(preguntaValida)) &&
    g.cierre.every(preguntaValida);
  return ok ? g : GUION_ASFALTO;
};
