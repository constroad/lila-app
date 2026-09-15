import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, onUnauthorized } from './api';
import type { Yo } from './types';

/**
 * La sesión del panel: `GET /auth/yo` con la cookie. Sin sesión (401) la app
 * manda a «Entrar»; al salir se limpia todo lo cargado (otro usuario no ve lo
 * del anterior: la caché de cliente también es por tenant).
 */
interface Sesion {
  yo: Yo | null;
  cargando: boolean;
  salir: () => Promise<void>;
  recargar: () => Promise<unknown>;
}

const SesionContext = createContext<Sesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['yo'],
    queryFn: () => api.get<Yo>('/auth/yo'),
    retry: false,
    staleTime: 5 * 60_000,
  });
  useEffect(
    () =>
      onUnauthorized(() => {
        queryClient.setQueryData(['yo'], null);
      }),
    [queryClient]
  );
  const salir = async () => {
    await api.post('/auth/salir');
    queryClient.clear();
    queryClient.setQueryData(['yo'], null);
  };
  const yo = q.isError ? null : (q.data ?? null);
  return <SesionContext.Provider value={{ yo, cargando: q.isPending, salir, recargar: () => q.refetch() }}>{children}</SesionContext.Provider>;
}

export const useSesion = (): Sesion => {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error('useSesion fuera de SesionProvider');
  return ctx;
};
