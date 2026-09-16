import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Yo } from './types';

/**
 * Cambiar de sesión sin volver a pedir código (S1–S4): el operador pasa de su
 * empresa a la consola (`POST auth/operador`), de la consola a su empresa
 * (`POST auth/empresa`) o al panel de cualquier empresa («Abrir su panel»,
 * `POST admin/empresas/:id/entrar`). Como cambia el tenant, se vacía TODO lo
 * cargado antes de poner la sesión nueva: la caché del cliente también es
 * por empresa.
 */
const cambiarSesion = async (queryClient: QueryClient, ruta: string): Promise<Yo> => {
  const yo = await api.post<Yo>(ruta);
  // Todo menos «yo» (que se reemplaza): un `clear()` dejaría al observador de la sesión colgado de una consulta que ya no existe.
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'yo' });
  queryClient.setQueryData(['yo'], yo);
  return yo;
};

export const irAConsola = (queryClient: QueryClient): Promise<Yo> => cambiarSesion(queryClient, '/auth/operador');
export const irAMiEmpresa = (queryClient: QueryClient): Promise<Yo> => cambiarSesion(queryClient, '/auth/empresa');
export const entrarAEmpresa = (queryClient: QueryClient, companyId: string): Promise<Yo> => cambiarSesion(queryClient, `/admin/empresas/${encodeURIComponent(companyId)}/entrar`);
