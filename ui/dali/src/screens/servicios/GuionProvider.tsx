import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { GuionEditable, Servicios } from '@/lib/types';
import { mismoGuion } from './guion';

/**
 * EL GUION SE EDITA EN TRES PANTALLAS (A8 servicios, A9 el guion de uno, A10
 * una pregunta) y se guarda de una vez: este contexto guarda lo editado
 * mientras se navega entre ellas. `guion` es lo editado o lo del servidor.
 */
interface EditorGuion {
  servicios: Servicios | undefined;
  guion: GuionEditable | null;
  cargando: boolean;
  hayCambios: boolean;
  guardando: boolean;
  editar: (guion: GuionEditable) => void;
  descartar: () => void;
  guardar: () => void;
  restaurarPack: () => void;
  restaurando: boolean;
}

const Contexto = createContext<EditorGuion | null>(null);

export function GuionProvider({ children }: { children?: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: servicios, isPending } = useQuery({ queryKey: ['servicios'], queryFn: () => api.get<Servicios>('/servicios') });
  const [editado, setEditado] = useState<GuionEditable | null>(null);
  const delServidor = useMemo(() => servicios?.guion ?? null, [servicios]);
  const guion = editado ?? delServidor;

  const guardado = (s: Servicios) => {
    queryClient.setQueryData(['servicios'], s);
    setEditado(null);
  };
  const guardar = useMutation({
    mutationFn: (g: GuionEditable) => api.put<Servicios>('/servicios', g),
    onSuccess: (s) => {
      guardado(s);
      toast.success('Guion guardado: Dali lo usa desde el próximo mensaje');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar el guion'),
  });
  const restaurar = useMutation({
    mutationFn: () => api.post<Servicios>('/servicios/restaurar-pack'),
    onSuccess: (s) => {
      guardado(s);
      toast.success('Pack de asfalto restaurado');
    },
    onError: () => toast.error('No se pudo restaurar el pack'),
  });

  const valor: EditorGuion = {
    servicios,
    guion,
    cargando: isPending,
    hayCambios: Boolean(delServidor && editado && !mismoGuion(editado, delServidor)),
    guardando: guardar.isPending,
    editar: setEditado,
    descartar: () => setEditado(null),
    guardar: () => guion && guardar.mutate(guion),
    restaurarPack: () => restaurar.mutate(),
    restaurando: restaurar.isPending,
  };
  return <Contexto.Provider value={valor}>{children ?? <Outlet />}</Contexto.Provider>;
}

export const useGuion = (): EditorGuion => {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useGuion fuera de GuionProvider');
  return ctx;
};
