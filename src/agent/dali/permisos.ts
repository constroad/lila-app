import type { RolDali } from './miembros.js';

/**
 * QUÉ PUEDE HACER CADA ROL en `/api/dali/*` (A16 «Roles y permisos», spec §3):
 * - dueño: todo;
 * - ventas: conversaciones y leads (tomar, escribir, cerrar, estado, notas) y
 *   probar a Dali; NO cambia la configuración;
 * - solo lectura: mira; puede probar a Dali (no cambia nada).
 * Leer (`GET`) puede cualquiera con sesión. La ruta llega sin el prefijo
 * `/api/dali`.
 */
const CONFIGURACION = /^\/(asistente|servicios|negocio|faq|catalogo|importar|whatsapp|equipo)(\/|$)/;
const OPERACION = /^\/(conversaciones|leads)(\/|$)/;
const LIBRES = ['/probar', '/faq/probar'];

export const motivoSinPermiso = (metodo: string, ruta: string, rol: RolDali): string | null => {
  if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return null;
  if (LIBRES.includes(ruta)) return null;
  if (CONFIGURACION.test(ruta) && rol !== 'owner') return 'Solo el dueño cambia la configuración';
  if (OPERACION.test(ruta) && rol === 'viewer') return 'Tu acceso es de solo lectura';
  return null;
};
