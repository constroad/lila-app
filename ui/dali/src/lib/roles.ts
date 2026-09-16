import type { RolDali } from './types';

/** Los roles del panel como los lee la gente (spec §3 `bot_members.role`). */
export const NOMBRE_ROL: Record<RolDali, string> = { owner: 'Dueño', sales: 'Ventas', viewer: 'Solo lectura', operator: 'Operador' };

export const DESCRIPCION_ROL: Record<Exclude<RolDali, 'operator'>, string> = {
  owner: 'Control total. Vincula WhatsApp, catálogo, servicios y configuración.',
  sales: 'Conversaciones, leads y tomar el control de un chat. No toca la configuración de Dali.',
  viewer: 'Consulta métricas y lee el historial de chats. No responde ni modifica datos.',
};

/** Como se ofrecen al invitar. */
export const OPCIONES_ROL: Array<{ valor: Exclude<RolDali, 'operator'>; label: string }> = [
  { valor: 'sales', label: 'Ventas (chats, leads y tomar el control)' },
  { valor: 'owner', label: 'Dueño (acceso total)' },
  { valor: 'viewer', label: 'Solo lectura (mira, no toca)' },
];
