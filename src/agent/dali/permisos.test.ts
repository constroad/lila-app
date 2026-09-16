import { motivoSinPermiso } from './permisos';

/**
 * ROLES EN EL PANEL (A16 «Roles y permisos», spec §3 `bot_members.role`):
 * el dueño lo hace todo; ventas atiende conversaciones y leads y toma el
 * control, pero no toca la configuración; solo lectura mira y no toca.
 */
describe('motivoSinPermiso', () => {
  it('leer puede cualquiera; probar a Dali también (no cambia nada)', () => {
    for (const rol of ['owner', 'sales', 'viewer'] as const) {
      expect(motivoSinPermiso('GET', '/asistente', rol)).toBeNull();
      expect(motivoSinPermiso('GET', '/equipo', rol)).toBeNull();
      expect(motivoSinPermiso('POST', '/probar', rol)).toBeNull();
      expect(motivoSinPermiso('POST', '/faq/probar', rol)).toBeNull();
    }
  });

  it('la configuración (asistente, servicios, negocio, FAQ, catálogo, importar, WhatsApp, equipo) la cambia solo el dueño', () => {
    for (const ruta of [
      '/asistente',
      '/asistente/pausa',
      '/servicios/restaurar-pack',
      '/negocio',
      '/faq',
      '/catalogo',
      '/importar/confirmar',
      '/whatsapp/desconectar',
      '/whatsapp/vincular',
      '/equipo',
      '/equipo/abc',
    ]) {
      expect(motivoSinPermiso('PUT', ruta, 'owner')).toBeNull();
      expect(motivoSinPermiso('POST', ruta, 'sales')).toBe('Solo el dueño cambia la configuración');
      expect(motivoSinPermiso('DELETE', ruta, 'viewer')).toBe('Solo el dueño cambia la configuración');
    }
  });

  it('conversaciones y leads los trabajan el dueño y ventas; solo lectura, no', () => {
    for (const ruta of ['/conversaciones/abc/tomar', '/conversaciones/abc/mensajes', '/leads/abc/estado', '/leads/abc/notas']) {
      expect(motivoSinPermiso('POST', ruta, 'owner')).toBeNull();
      expect(motivoSinPermiso('POST', ruta, 'sales')).toBeNull();
      expect(motivoSinPermiso('POST', ruta, 'viewer')).toBe('Tu acceso es de solo lectura');
    }
  });

  it('lo que no es de nadie en particular (salir de la sesión) no se bloquea', () => {
    expect(motivoSinPermiso('POST', '/auth/salir', 'viewer')).toBeNull();
  });
});
