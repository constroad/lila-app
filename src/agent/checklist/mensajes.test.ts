import {
  filtrarMensajes,
  motivoDescarte,
  clausulasUtiles,
  enClausulas,
  type MensajeGrupo,
} from './mensajes';
import { CHECKLIST_PRODUCCION, itemSatisfecho } from './checklist';

/**
 * Qué puede cerrar un ítem del checklist y qué no.
 *
 * José, 09/09/2026: «debes omitir mensajes tendenciosos y los mensajes del propio
 * agente 949376824».
 *
 * EL SESGO ES DELIBERADO: ante la duda NO se confirma. Un falso negativo hace que
 * el agente vuelva a preguntar —molesto y visible—; un falso positivo lo hace
 * callar sobre algo que nadie hizo, que es el fallo que este proyecto existe
 * para evitar.
 */
const msg = (over: Partial<MensajeGrupo> = {}): MensajeGrupo => ({
  texto: 'cuadrilla lista',
  autor: '51999111222@s.whatsapp.net',
  ts: 1_000,
  esPropio: false,
  ...over,
});

describe('el agente no se confirma a sí mismo', () => {
  /**
   * Sin esto, el propio aviso del bot cerraría el ítem que el bot acaba de
   * abrir: un lazo que se auto-satisface y deja de avisar para siempre.
   */
  it('un mensaje de nuestra propia sesión se descarta', () => {
    expect(motivoDescarte(msg({ esPropio: true }))).toBe('propio');
    expect(motivoDescarte(msg({ esPropio: true, texto: 'petroleo listo' }))).toBe('propio');
  });

  it('el mismo texto de otra persona sí cuenta', () => {
    expect(motivoDescarte(msg({ esPropio: false }))).toBeNull();
  });
});

describe('mensajes tendenciosos', () => {
  it('preguntar NO es confirmar', () => {
    expect(motivoDescarte(msg({ texto: '¿ya está la cuadrilla lista?' }))).toBe('pregunta');
    expect(motivoDescarte(msg({ texto: 'cuadrilla lista?' }))).toBe('pregunta');
  });

  it('negar tampoco, aunque traiga la palabra clave', () => {
    expect(motivoDescarte(msg({ texto: 'todavía no está la cuadrilla lista' }))).toBe('negacion');
    expect(motivoDescarte(msg({ texto: 'no, cuadrilla lista recién mañana' }))).toBe('negacion');
    expect(motivoDescarte(msg({ texto: 'falta la cuadrilla lista' }))).toBe('negacion');
    expect(motivoDescarte(msg({ texto: 'se cayó la producción, cuadrilla lista para el jueves' })))
      .toBe('negacion');
  });

  it('un mensaje vacío no confirma nada', () => {
    expect(motivoDescarte(msg({ texto: '   ' }))).toBe('vacio');
  });

  /**
   * ACÁ SE PIERDE UNA CONFIRMACIÓN BUENA, y está aceptado: «no te preocupes,
   * cuadrilla lista» se descarta por la negación. El costo es que el agente
   * vuelve a preguntar; el costo del error opuesto es que se calle.
   */
  it('prefiere volver a preguntar antes que dar por hecho de más', () => {
    expect(motivoDescarte(msg({ texto: 'no te preocupes, cuadrilla lista' }))).toBe('negacion');
  });
});

/**
 * DÓNDE ESTÁ LA NEGACIÓN, que es lo que decide si niega el mensaje o una parte.
 *
 * Medido el 09/09/2026 sobre 19 mensajes escritos como los escribe la gente: con
 * la negación de oración entera el filtro acertaba 6; mirando la cláusula que
 * abre, 9. Las que recupera no son rebuscadas — son la forma normal de confirmar
 * algo en un grupo de trabajo.
 */
describe('negación por cláusula', () => {
  const pasa = (texto: string) => motivoDescarte(msg({ texto }));

  it('conserva una confirmación que además niega OTRA cosa', () => {
    expect(pasa('ya avisé a planta, no hay problema')).toBeNull();
    expect(pasa('cuadrilla lista, no falta nadie')).toBeNull();
    expect(pasa('petróleo listo, aún falta el agua')).toBeNull();
    expect(pasa('avisé a planta pero no vino el tren')).toBeNull();
  });

  it('la negación que ABRE el mensaje gobierna todo lo que sigue', () => {
    expect(pasa('no, cuadrilla lista recién mañana')).toBe('negacion');
    expect(pasa('se cayó la producción, cuadrilla lista para el jueves')).toBe('negacion');
    expect(pasa('todavía no está la cuadrilla lista')).toBe('negacion');
  });

  it('la «y» no corta si lo que sigue no niega', () => {
    // Partir de más multiplica las oportunidades de un falso positivo.
    expect(enClausulas('agua y petroleo listos')).toEqual(['agua y petroleo listos']);
    expect(enClausulas('cuadrilla lista y no vino el tren')).toEqual([
      'cuadrilla lista',
      'no vino el tren',
    ]);
  });

  /**
   * EL AGUJERO QUE ABRE EL ARREGLO SI NO SE CIERRA. El matcher busca sus frases
   * en el texto que se le entrega; si se le entregara el mensaje entero, la
   * cláusula negada traería consigo la frase clave y cerraría el ítem al revés.
   */
  it('al ítem solo le llegan las cláusulas que afirman', () => {
    expect(clausulasUtiles('agua lista, no compramos petróleo')).toEqual(['agua lista']);
    const combustible = CHECKLIST_PRODUCCION.find((i) => i.id === 'combustible')!;
    expect(itemSatisfecho(combustible, clausulasUtiles('agua lista, no compramos petróleo'))).toBe(
      false
    );
    // Y con el mensaje entero se habría cerrado: esto es lo que se evita.
    expect(itemSatisfecho(combustible, ['agua lista, no compramos petróleo'])).toBe(true);
  });

  it('conserva las tildes: lo que se guarda se le muestra a una persona', () => {
    expect(clausulasUtiles('ya avisé a planta, no hay problema')).toEqual(['ya avisé a planta']);
  });
});

describe('el filtro completo', () => {
  it('separa lo que sirve y cuenta por qué descartó el resto', () => {
    const resultado = filtrarMensajes([
      msg({ texto: 'ya avisé a planta', autor: 'jose@s.whatsapp.net' }),
      msg({ texto: '¿ya compraron petróleo?', autor: 'wilson@s.whatsapp.net' }),
      msg({ texto: 'todavía no', autor: 'wilson@s.whatsapp.net' }),
      msg({ texto: '¿Ya está la cuadrilla y el tren?', esPropio: true }),
      msg({ texto: '', autor: 'x@s.whatsapp.net' }),
    ]);

    expect(resultado.textos).toEqual(['ya avisé a planta']);
    expect(resultado.autores).toEqual(['jose@s.whatsapp.net']);
    expect(resultado.descartados).toEqual({ propio: 1, vacio: 1, pregunta: 1, negacion: 1 });
  });

  /**
   * EL CASO COMPLETO: el bot pregunta, alguien pregunta de vuelta, alguien niega
   * — y el ítem sigue pendiente, que es lo correcto.
   */
  it('un hilo entero de preguntas y negaciones no cierra nada', () => {
    const combustible = CHECKLIST_PRODUCCION.find((i) => i.id === 'combustible')!;
    const utiles = filtrarMensajes([
      msg({ texto: '¿Ya compraron petróleo y agua?', esPropio: true }),
      msg({ texto: 'petroleo listo?', autor: 'a@s.whatsapp.net' }),
      msg({ texto: 'no, todavía no hay petróleo', autor: 'b@s.whatsapp.net' }),
    ]);

    expect(itemSatisfecho(combustible, utiles.textos)).toBe(false);
  });

  it('y una confirmación limpia sí lo cierra', () => {
    const combustible = CHECKLIST_PRODUCCION.find((i) => i.id === 'combustible')!;
    const utiles = filtrarMensajes([msg({ texto: 'Petróleo listo jefe', autor: 'b@s.whatsapp.net' })]);

    expect(itemSatisfecho(combustible, utiles.textos)).toBe(true);
  });
});
