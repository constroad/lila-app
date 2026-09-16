import type { TonoPill } from '@/components/StatusPill';
import type { EstadoAsistenteAdmin, EstadoLinea } from './types';

/** El estado de la línea de WhatsApp como lo lee la persona (A14, S1, S4). */
export const ESTADO_LINEA: Record<EstadoLinea, { texto: string; tono: TonoPill }> = {
  conectado: { texto: 'Conectado', tono: 'emerald' },
  vinculando: { texto: 'Vinculando…', tono: 'amber' },
  conectando: { texto: 'Conectando…', tono: 'amber' },
  'requiere-vincular': { texto: 'Requiere vincular', tono: 'red' },
  desconectado: { texto: 'Desconectado', tono: 'red' },
  'sin-numero': { texto: 'Sin número', tono: 'stone' },
};

/** Lo que hace el asistente de una empresa, visto desde la consola (S1, S2). */
export const ESTADO_ASISTENTE: Record<EstadoAsistenteAdmin, { texto: string; tono: TonoPill }> = {
  atendiendo: { texto: 'Atendiendo', tono: 'emerald' },
  pausado: { texto: 'Pausado', tono: 'amber' },
  apagado: { texto: 'Apagado', tono: 'stone' },
  'requiere-qr': { texto: 'Requiere QR', tono: 'amber' },
  'sin-linea': { texto: 'Sin línea', tono: 'stone' },
  suspendida: { texto: 'Suspendida', tono: 'red' },
};
