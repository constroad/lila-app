/**
 * LA AGENDA DE AVISOS A PLANTA: una entrada por día de producción.
 *
 * Reemplaza (spec §14, José 16/09/2026) a la propuesta con «1», al checklist
 * de planta y al recordatorio por menciones. Lo que se DICE en INFRAMAQ admin
 * y lo que hay en Portal se funden acá; el aviso sale solo, el día anterior a
 * las 17:00 (o ya, si eso pasó), y cada cambio real se le confirma a quien lo
 * anunció. Este módulo es PURO: recibe la agenda y un hecho, devuelve la agenda
 * nueva y los EFECTOS (qué cambió), que son lo que se confirma en el grupo.
 * La persistencia y el envío viven en `programador.ts`.
 */
import { diaPeruano, instanteArranque } from './tiempo.js';

/** La hora del día anterior a la que sale el aviso (José, 16/09: «17 está bien»). */
export const HORA_AVISO_PLANTA = '17:00';

export type FuenteProduccion = 'chat' | 'portal';

export interface Produccion {
  companyId: string;
  /** Como lo dice la gente («Globofast Solkali»). */
  empresa: string;
  cliente?: string;
  /** `HH:mm`; sin hora = «por confirmar». */
  hora?: string;
  cubos?: number;
  fuente: FuenteProduccion;
  /** Id del pedido en Portal, si existe. */
  pedidoId?: string;
  /** Cuándo se supo (ms del mensaje o de la lectura de Portal). */
  ts: number;
  autor?: string;
}

export type EstadoAviso = 'programada' | 'enviada' | 'cancelada';

export interface AvisoProgramado {
  id: string;
  /** Día de producción, `YYYY-MM-DD` Lima. */
  fecha: string;
  /** Cuándo sale. */
  envioMs: number;
  producciones: Produccion[];
  estado: EstadoAviso;
  creadoMs: number;
  actualizadoMs: number;
  /** El mensaje que salió a planta (para actualizaciones y para reconocer citas). */
  msgIdPlanta?: string;
  textoPublicado?: string;
  /** Lo que se mandó a planta la última vez: para saber si una actualización cambia algo. */
  enviadoComo?: string;
  /** Ids de las confirmaciones en admin (responder «3» a una cancela el aviso). */
  confirmaciones?: string[];
  /** Ya se avisó en admin que salió sin pedido en Portal. */
  recordadoSinPedido?: boolean;
}

export type Efecto =
  | { tipo: 'programado'; aviso: AvisoProgramado; produccion: Produccion }
  | { tipo: 'sumado'; aviso: AvisoProgramado; produccion: Produccion }
  | { tipo: 'actualizado'; aviso: AvisoProgramado; produccion: Produccion; antes: Produccion }
  | { tipo: 'movido'; desde: AvisoProgramado; hasta: AvisoProgramado; produccion: Produccion }
  | { tipo: 'cancelado'; aviso: AvisoProgramado; produccion?: Produccion }
  | { tipo: 'sin-cambio'; aviso: AvisoProgramado }
  /** Misma empresa y m³ en otro día ya programado, sin palabra de cambio: se programa y se pregunta. */
  | { tipo: 'posible-movimiento'; aviso: AvisoProgramado; otro: AvisoProgramado; produccion: Produccion };

/** Cuándo sale el aviso de `fecha`: el día anterior a las 17:00, o AHORA si eso ya pasó. */
export const calcularEnvioMs = (fecha: string, ahoraMs: number): number => {
  const [y, m, d] = fecha.split('-').map(Number);
  const anterior = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  const programado = instanteArranque(anterior, HORA_AVISO_PLANTA) ?? ahoraMs;
  return Math.max(programado, ahoraMs);
};

/** «Último momento»: sale en cuanto se supo porque las 17:00 del día anterior ya pasaron. */
export const esUltimoMomento = (aviso: AvisoProgramado): boolean => {
  const [y, m, d] = aviso.fecha.split('-').map(Number);
  const anterior = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  const programado = instanteArranque(anterior, HORA_AVISO_PLANTA) ?? 0;
  return aviso.envioMs > programado;
};

/** La producción ya arrancó (o el día pasó): no se coordina, se produce. */
export const yaArranco = (fecha: string, hora: string | undefined, ahoraMs: number): boolean => {
  if (fecha < diaPeruano(ahoraMs)) return true;
  if (fecha > diaPeruano(ahoraMs)) return false;
  const arranque = hora ? instanteArranque(fecha, hora) : null;
  return arranque !== null && ahoraMs >= arranque;
};

const claveDe = (p: { companyId: string; cliente?: string }): string => `${p.companyId}|${(p.cliente ?? '').toLowerCase().trim()}`;

/** Misma producción: misma empresa y, si los dos nombran cliente, el mismo. */
export const mismaProduccion = (a: { companyId: string; cliente?: string }, b: { companyId: string; cliente?: string }): boolean =>
  a.companyId === b.companyId && (!a.cliente || !b.cliente || claveDe(a) === claveDe(b));

const nuevoId = (fecha: string, ahoraMs: number): string => `av-${fecha}-${ahoraMs.toString(36)}`;

const ordenar = (lista: Produccion[]): Produccion[] => [...lista].sort((a, b) => (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99'));

/** Portal manda en hora y m³; el chat aporta lo que Portal no tiene. */
export const fundir = (existente: Produccion, nueva: Produccion): Produccion => {
  if (nueva.fuente === 'portal' || existente.fuente === 'chat') {
    return {
      ...existente,
      ...nueva,
      hora: nueva.hora ?? existente.hora,
      cubos: nueva.cubos ?? existente.cubos,
      cliente: nueva.cliente ?? existente.cliente,
      empresa: nueva.empresa || existente.empresa,
      fuente: nueva.fuente === 'portal' || existente.fuente === 'portal' ? 'portal' : 'chat',
      pedidoId: nueva.pedidoId ?? existente.pedidoId,
    };
  }
  // Existente de Portal, nueva del chat: Portal manda; el chat solo completa huecos.
  return { ...existente, hora: existente.hora ?? nueva.hora, cubos: existente.cubos ?? nueva.cubos, cliente: existente.cliente ?? nueva.cliente };
};

const difiere = (a: Produccion, b: Produccion): boolean => a.hora !== b.hora || a.cubos !== b.cubos || (a.cliente ?? '') !== (b.cliente ?? '');

/** Un hecho que llega: una producción para un día (chat o Portal). */
export interface Programar {
  accion: 'programar';
  fecha: string;
  produccion: Produccion;
  /** El anuncio dijo que se mueve desde otro día. */
  desdeFecha?: string;
}
export interface Cancelar {
  accion: 'cancelar';
  fecha: string;
  /** Sin empresa: se cancela el día entero. */
  companyId?: string;
  cliente?: string;
  ts: number;
}
export type Hecho = Programar | Cancelar;

/**
 * Aplica un hecho a la agenda. Devuelve la agenda nueva (las entradas tocadas
 * son objetos nuevos) y los efectos, en orden.
 */
export const aplicar = (agenda: AvisoProgramado[], hecho: Hecho, ahoraMs: number): { agenda: AvisoProgramado[]; efectos: Efecto[] } => {
  const efectos: Efecto[] = [];
  let lista = agenda.map((a) => ({ ...a, producciones: [...a.producciones] }));

  const vivas = (fecha: string) => lista.filter((a) => a.fecha === fecha && a.estado !== 'cancelada');

  const cancelarEn = (fecha: string, filtro: { companyId?: string; cliente?: string }): void => {
    for (const aviso of vivas(fecha)) {
      const quitar = filtro.companyId ? aviso.producciones.filter((p) => mismaProduccion(p, { companyId: filtro.companyId!, cliente: filtro.cliente })) : [...aviso.producciones];
      if (!quitar.length) continue;
      aviso.producciones = aviso.producciones.filter((p) => !quitar.includes(p));
      aviso.actualizadoMs = ahoraMs;
      if (aviso.producciones.length === 0) {
        aviso.estado = 'cancelada';
        efectos.push({ tipo: 'cancelado', aviso });
      } else {
        for (const p of quitar) efectos.push({ tipo: 'cancelado', aviso, produccion: p });
      }
    }
  };

  if (hecho.accion === 'cancelar') {
    cancelarEn(hecho.fecha, { companyId: hecho.companyId, cliente: hecho.cliente });
    return { agenda: lista, efectos };
  }

  const { fecha, produccion } = hecho;
  // Lo que ya arrancó (o ya pasó) no se coordina: se produce. 16/09 06:40: el
  // primer arranque programó «sale ahora» la producción de las 04:30 de ese
  // mismo día y lo confirmó en admin, para un aviso que nunca iba a salir.
  if (yaArranco(fecha, produccion.hora, ahoraMs)) return { agenda: lista, efectos };
  // Se mueve desde otro día: la producción de ese día se cancela (con su efecto).
  if (hecho.desdeFecha && hecho.desdeFecha !== fecha) {
    const desde = vivas(hecho.desdeFecha)[0];
    cancelarEn(hecho.desdeFecha, { companyId: produccion.companyId, cliente: produccion.cliente });
    // El efecto de «cancelado» del origen se reemplaza por uno de «movido» al final.
    if (desde) efectos.splice(efectos.findIndex((e) => e.tipo === 'cancelado' && e.aviso.fecha === hecho.desdeFecha), 1);
    const destino = programarEn(fecha, produccion);
    if (desde) {
      // Un solo efecto: «movido», no «programado» + «cancelado».
      const i = efectos.findIndex((e) => (e.tipo === 'programado' || e.tipo === 'sumado') && e.aviso === destino);
      if (i !== -1) efectos.splice(i, 1);
      efectos.push({ tipo: 'movido', desde, hasta: destino, produccion });
    }
    return { agenda: lista, efectos };
  }

  const destino = programarEn(fecha, produccion);
  // ¿Puede ser un movimiento sin decirlo? Misma empresa y mismos m³ (si los hay)
  // en OTRO día futuro programado, del chat. Se programa igual y se pregunta.
  if (produccion.fuente === 'chat') {
    const otro = lista.find(
      (a) => a.fecha !== fecha && a.estado !== 'cancelada' && a.fecha >= diaPeruano(ahoraMs) && a.producciones.some((p) => p.fuente === 'chat' && mismaProduccion(p, produccion) && (!produccion.cubos || p.cubos === produccion.cubos))
    );
    const ultimo = efectos[efectos.length - 1];
    if (otro && ultimo && (ultimo.tipo === 'programado' || ultimo.tipo === 'sumado')) {
      efectos.push({ tipo: 'posible-movimiento', aviso: destino, otro, produccion });
    }
  }
  return { agenda: lista, efectos };

  function programarEn(f: string, p: Produccion): AvisoProgramado {
    let aviso = vivas(f)[0];
    if (!aviso) {
      aviso = { id: nuevoId(f, ahoraMs), fecha: f, envioMs: calcularEnvioMs(f, ahoraMs), producciones: [p], estado: 'programada', creadoMs: ahoraMs, actualizadoMs: ahoraMs };
      lista.push(aviso);
      efectos.push({ tipo: 'programado', aviso, produccion: p });
      return aviso;
    }
    const i = aviso.producciones.findIndex((x) => mismaProduccion(x, p));
    if (i === -1) {
      aviso.producciones = ordenar([...aviso.producciones, p]);
      aviso.actualizadoMs = ahoraMs;
      efectos.push({ tipo: 'sumado', aviso, produccion: p });
      return aviso;
    }
    const antes = aviso.producciones[i];
    const fundida = fundir(antes, p);
    if (!difiere(antes, fundida)) {
      efectos.push({ tipo: 'sin-cambio', aviso });
      return aviso;
    }
    aviso.producciones = ordenar(aviso.producciones.map((x, j) => (j === i ? fundida : x)));
    aviso.actualizadoMs = ahoraMs;
    efectos.push({ tipo: 'actualizado', aviso, produccion: fundida, antes });
    return aviso;
  }
};

/** Los avisos que ya toca mandar (o volver a mandar, si cambiaron después de salir). */
export const pendientesDeEnvio = (agenda: AvisoProgramado[], ahoraMs: number, textoDe: (a: AvisoProgramado) => string): AvisoProgramado[] =>
  agenda.filter((a) => {
    if (a.estado === 'cancelada') return false;
    if (a.producciones.length === 0) return false;
    if (yaArranco(a.fecha, a.producciones[0]?.hora, ahoraMs)) return false;
    if (a.estado === 'programada') return a.envioMs <= ahoraMs;
    // Enviada: solo si lo que se mandaría difiere de lo que salió.
    return textoDe(a) !== a.enviadoComo;
  });
