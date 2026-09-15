import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { horaDe, iniciales, telefonoLegible } from '@/lib/format';
import type { Asistente } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';
import { useAccionesDeBarra } from '@/layout/barra';
import { TarjetaAvisos, TarjetaEstado, TarjetaHorario, TarjetaIdentidad, TarjetaPiloto, TarjetaReglas } from './cards';
import { Previsualizacion } from './Previsualizacion';
import { formularioDe, mismoFormulario, pausaVigente, type Formulario, type Pausa } from './formulario';

/**
 * A6 «Asistente» (diseños `A6-asistente` móvil, tablet y escritorio): cómo se
 * presenta y se comporta Dali. El encendido y la pausa se aplican al toque;
 * el resto se edita y se guarda con «Guardar cambios» (barra de arriba en
 * tablet y escritorio, pie fijo en móvil). Desde tablet, la vista previa del
 * primer mensaje a la derecha. Datos: `GET/PUT /asistente`, `POST /asistente/pausa`.
 */
export function AsistenteScreen() {
  const queryClient = useQueryClient();
  const { data: asistente, isPending } = useQuery({ queryKey: ['asistente'], queryFn: () => api.get<Asistente>('/asistente') });
  // Lo editado, o lo del servidor mientras no se toque nada: así un refresco no pisa lo que se escribe.
  const [editado, setEditado] = useState<Formulario | null>(null);
  const delServidor = useMemo(() => (asistente ? formularioDe(asistente) : null), [asistente]);
  const form = editado ?? delServidor;
  const setForm = (f: Formulario) => setEditado(f);

  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ['asistente'] });
    void queryClient.invalidateQueries({ queryKey: ['inicio'] });
  };
  const guardado = (a: Asistente) => {
    queryClient.setQueryData(['asistente'], a);
    setEditado(null);
    void queryClient.invalidateQueries({ queryKey: ['inicio'] });
  };
  const encender = useMutation({
    mutationFn: (enabled: boolean) => api.put<{ ok: true; enabled: boolean }>('/asistente/estado', { enabled }),
    onSuccess: (r) => {
      toast.success(r.enabled ? 'Dali vuelve a atender' : 'Dali apagada: los mensajes quedan sin responder');
      refrescar();
    },
    onError: () => toast.error('No se pudo cambiar el estado'),
  });
  const pausar = useMutation({
    mutationFn: (p: Pausa | null) => api.post<Asistente>('/asistente/pausa', { minutos: p === null ? 0 : p === 'manana' ? 'manana' : Number(p) }),
    onSuccess: (a) => {
      queryClient.setQueryData(['asistente'], a);
      toast.success(a.pausadoHasta ? `Dali en pausa hasta las ${horaDe(Date.parse(a.pausadoHasta))}` : 'Dali vuelve a atender');
      void queryClient.invalidateQueries({ queryKey: ['inicio'] });
    },
    onError: () => toast.error('No se pudo pausar a Dali'),
  });
  const guardar = useMutation({
    mutationFn: (f: Formulario) => api.put<Asistente>('/asistente', f),
    onSuccess: (a) => {
      guardado(a);
      toast.success('Cambios guardados: Dali los usa desde el próximo mensaje');
    },
    onError: () => toast.error('No se pudieron guardar los cambios'),
  });

  const hayCambios = Boolean(delServidor && editado && !mismoFormulario(editado, delServidor));
  const descartar = () => setEditado(null);
  const enviar = () => form && guardar.mutate(form);

  useAccionesDeBarra(
    <>
      <Link
        to="/probar"
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
      >
        <Icon name="play_arrow" className="text-xl" /> Probar a Dali
      </Link>
      <button
        type="button"
        onClick={enviar}
        disabled={!hayCambios || guardar.isPending}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        <Icon name="check" className="text-xl" /> {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </>,
    // `form` solo cambia de identidad al editar (lo del servidor va memorizado): no hay bucle de registro.
    [hayCambios, guardar.isPending, form]
  );

  if (isPending || !asistente || !form) return <AsistenteEsqueleto />;
  const vigente = pausaVigente(asistente.pausadoHasta);
  const estado = !asistente.enabled ? 'Apagada' : vigente ? `En pausa hasta ${horaDe(Date.parse(asistente.pausadoHasta!))}` : 'Dali activa';
  const tonoEstado = !asistente.enabled ? 'stone' : vigente ? 'amber' : 'teal';

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/95 px-3 py-2.5 backdrop-blur-md md:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <Link to="/inicio" aria-label="Volver al inicio" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
            <Icon name="arrow_back" className="text-2xl" />
          </Link>
          <h1 className="truncate font-headline text-xl font-bold tracking-tight text-stone-900">Asistente</h1>
          <StatusPill tono={tonoEstado} className="ml-1.5 shrink-0 px-2 text-[11px]">
            {!asistente.enabled ? 'Apagada' : vigente ? 'En pausa' : 'Activa'}
          </StatusPill>
        </div>
        <button
          type="button"
          onClick={enviar}
          disabled={!hayCambios || guardar.isPending}
          className="min-h-11 shrink-0 px-1 font-body text-sm font-semibold text-teal-800 disabled:text-stone-400"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </header>

      <section className="border-b border-stone-200 bg-white px-4 pb-4 pt-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-stone-900 font-headline text-sm font-bold text-amber-400">
              {iniciales(asistente.empresa.nombre)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-headline text-base font-bold tracking-tight text-stone-900">{asistente.empresa.nombre}</p>
              <p className="truncate font-body text-[15px] text-stone-500">
                {[asistente.empresa.rubro, asistente.empresa.ciudad].filter(Boolean).join(' · ') || 'Asistente de WhatsApp'}
              </p>
            </div>
          </div>
          {asistente.empresa.numero && (
            <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2 font-mono text-xs text-teal-900">
              <span className={cn('size-2 rounded-full', asistente.enabled ? 'bg-emerald-500' : 'bg-stone-400')} /> {telefonoLegible(asistente.empresa.numero)}
            </span>
          )}
        </div>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-stone-600">
          Configura cómo se presenta y se comporta Dali cuando atiende a tus clientes por WhatsApp en {asistente.empresa.nombre}.
        </p>
      </section>

      <header className="hidden pt-6 md:block xl:pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Asistente</h1>
          <StatusPill tono={tonoEstado} className="text-sm">
            {estado}
          </StatusPill>
        </div>
        <p className="mt-1.5 font-body text-[15px] text-stone-500 xl:text-lg">
          Configura cómo se presenta y se comporta Dali cuando atiende a tus clientes por WhatsApp en {asistente.empresa.nombre}.
        </p>
      </header>

      <div className="px-4 pb-36 pt-4 md:px-0 md:pb-0 md:pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="lg:col-span-2 lg:row-start-1 xl:col-span-1">
          <TarjetaEstado
            asistente={asistente}
            pausaVigente={vigente}
            silencio={form.handoffPauseMinutes}
            onEncender={(v) => encender.mutate(v)}
            onPausar={(p) => pausar.mutate(p)}
            onSilencio={(min) => setForm({ ...form, handoffPauseMinutes: min })}
            ocupado={encender.isPending || pausar.isPending}
          />
        </div>
        <div className="mt-4 space-y-4 lg:col-start-1 lg:row-start-2 lg:mt-0 lg:space-y-6">
          <TarjetaIdentidad perfil={form.perfil} empresa={asistente.empresa.nombre} onChange={(perfil) => setForm({ ...form, perfil })} />
          <TarjetaReglas perfil={form.perfil} onChange={(perfil) => setForm({ ...form, perfil })} />
          <TarjetaHorario perfil={form.perfil} onChange={(perfil) => setForm({ ...form, perfil })} />
          <TarjetaAvisos avisos={form.avisos} grupoConectado={Boolean(asistente.ownerNotifyTarget)} onChange={(avisos) => setForm({ ...form, avisos })} />
          <TarjetaPiloto numeros={form.testNumbers} onChange={(testNumbers) => setForm({ ...form, testNumbers })} />
        </div>
        <aside className="hidden self-start lg:col-start-2 lg:row-start-2 lg:block xl:row-span-2 xl:row-start-1">
          <Previsualizacion form={form} asistente={asistente} className="sticky top-6" />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,16px)+64px)] z-30 mx-auto flex w-full max-w-[390px] gap-3 border-t border-stone-200 bg-white px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={enviar}
          disabled={!hayCambios || guardar.isPending}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-teal-700 font-headline text-[15px] font-bold text-white disabled:bg-stone-300"
        >
          <Icon name="check" className="text-xl" /> {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={descartar}
          disabled={!hayCambios}
          className="h-12 rounded-full border border-stone-300 bg-white px-5 font-body text-[15px] font-semibold text-stone-800 disabled:opacity-40"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}

function AsistenteEsqueleto() {
  return (
    <div className="md:px-6 xl:px-10" aria-busy="true">
      <div className="h-14 border-b border-stone-200 bg-white md:hidden" />
      <div className="hidden pt-6 md:block xl:pt-8">
        <div className="h-9 w-56 animate-pulse rounded-lg bg-stone-200" />
        <div className="mt-3 h-4 w-96 animate-pulse rounded bg-stone-200" />
      </div>
      <div className="space-y-4 px-4 pt-4 md:px-0 md:pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:space-y-0">
        <div className="space-y-4 lg:space-y-6">
          {[200, 420, 360, 300].map((h, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-stone-200 bg-white" style={{ height: h }} />
          ))}
        </div>
        <div className="hidden h-[560px] animate-pulse rounded-2xl border border-stone-200 bg-white lg:block" />
      </div>
    </div>
  );
}
