import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { telefonoLegible } from '@/lib/format';
import type { EventoDeAviso, Inicio, Notificaciones } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { Interruptor } from '@/components/Interruptor';
import { StatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { useAccionesDeBarra } from '@/layout/barra';
import { CabeceraTarjeta, SelectorHora, Tarjeta } from '@/screens/asistente/cards';

/**
 * A18 «Notificaciones» (diseños `A18-notificaciones` móvil, tablet y
 * escritorio): por dónde avisa Dali, qué avisa y cuándo calla. Es la misma
 * configuración de A6 «Avisos» (`GET/PUT notificaciones`), con el grupo
 * elegido entre los grupos reales de la línea y el horario de descanso. Lo
 * que el diseño dibuja y no existe se muestra como tal: el correo no es un
 * canal (nada manda correos), y «WhatsApp desconectado» y «Resumen semanal»
 * todavía no se emiten.
 */
interface Formulario {
  canal: 'grupo' | 'dueno';
  grupoJid: string;
  numeroDueno: string;
  casos: Notificaciones['casos'];
  descanso: Notificaciones['descanso'];
}

const formularioDe = (n: Notificaciones): Formulario => ({
  canal: n.canal,
  grupoJid: n.grupo?.jid ?? '',
  numeroDueno: n.numeroDueno,
  casos: { ...n.casos },
  descanso: { ...n.descanso },
});

export function NotificacionesScreen() {
  const queryClient = useQueryClient();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data: notificaciones, isPending } = useQuery({ queryKey: ['notificaciones'], queryFn: () => api.get<Notificaciones>('/notificaciones') });
  const [editado, setEditado] = useState<Formulario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const delServidor = useMemo(() => (notificaciones ? formularioDe(notificaciones) : null), [notificaciones]);
  const form = editado ?? delServidor;
  const hayCambios = Boolean(delServidor && editado && JSON.stringify(editado) !== JSON.stringify(delServidor));

  const guardar = useMutation({
    mutationFn: (f: Formulario) => {
      const cuerpo: Record<string, unknown> = { canal: f.canal, casos: f.casos, descanso: f.descanso };
      if (f.canal === 'grupo' && f.grupoJid && f.grupoJid !== delServidor?.grupoJid) cuerpo.grupoJid = f.grupoJid;
      if (f.canal === 'dueno') cuerpo.numeroDueno = f.numeroDueno;
      return api.put<Notificaciones>('/notificaciones', cuerpo);
    },
    onSuccess: (n) => {
      queryClient.setQueryData(['notificaciones'], n);
      setEditado(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['asistente'] });
      toast.success('Avisos guardados: Dali los usa desde el próximo mensaje');
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : 'No se pudieron guardar los avisos'),
  });
  const prueba = useMutation({
    mutationFn: () => api.post<{ ok: true; destino: string }>('/notificaciones/prueba'),
    onSuccess: () => toast.success('Prueba enviada: revisa el WhatsApp del canal elegido'),
    onError: (e: Error) => toast.error(e instanceof ApiError ? e.message : 'No se pudo mandar la prueba'),
  });
  const enviar = () => form && guardar.mutate(form);

  useAccionesDeBarra(
    <>
      <button
        type="button"
        onClick={() => prueba.mutate()}
        disabled={prueba.isPending || hayCambios}
        title={hayCambios ? 'Guarda los cambios primero' : undefined}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
      >
        <Icon name="send" className="text-xl" /> {prueba.isPending ? 'Enviando…' : 'Enviar mensaje de prueba'}
      </button>
      <button
        type="button"
        onClick={enviar}
        disabled={!hayCambios || guardar.isPending}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 font-body text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        <Icon name="check" className="text-xl" /> {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </>,
    [hayCambios, guardar.isPending, prueba.isPending, form]
  );

  if (isPending || !notificaciones || !form) return <NotificacionesEsqueleto />;
  const set = (parte: Partial<Formulario>) => setEditado({ ...form, ...parte });
  const activos = Object.values(form.casos).filter(Boolean).length;
  const disponibles = notificaciones.eventos.filter((e) => e.disponible).length;
  const grupoActual = notificaciones.grupo;
  const opcionesGrupo = notificaciones.gruposDisponibles ? notificaciones.grupos : grupoActual ? [grupoActual] : [];

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-stone-200 bg-white/95 px-2 py-2 backdrop-blur-md md:hidden">
        <Link to="/inicio" aria-label="Volver al inicio" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="arrow_back" className="text-2xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-headline text-lg font-bold leading-tight tracking-tight text-stone-900">Notificaciones</h1>
          <p className="flex items-center gap-1.5 truncate font-body text-sm text-stone-500">
            <span className={cn('size-1.5 shrink-0 rounded-full', inicio?.asistente.conectado ? 'bg-emerald-500' : 'bg-stone-400')} />
            <span className="font-mono">{telefonoLegible(notificaciones.linea) || 'Sin línea'}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={enviar}
          disabled={!hayCambios || guardar.isPending}
          className="h-11 shrink-0 px-2 font-body text-sm font-semibold text-teal-800 disabled:text-stone-400"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </header>

      <div className="px-4 pt-4 md:px-0 md:pt-6 xl:pt-8">
        <div className="flex items-center justify-between gap-3 md:hidden">
          <p className="truncate font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {inicio?.empresa.nombre ?? '…'}
            {inicio?.empresa.rubro ? ` · ${inicio.empresa.rubro}` : ''}
          </p>
          <StatusPill tono={inicio?.asistente.encendido ? 'teal' : 'stone'} className="shrink-0 text-xs">
            {inicio?.asistente.encendido ? 'Dali activo' : 'Dali en pausa'}
          </StatusPill>
        </div>
        <div className="hidden md:block">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Notificaciones</h1>
            <StatusPill tono={inicio?.asistente.encendido ? 'teal' : 'stone'} className="text-sm">
              {inicio?.asistente.encendido ? 'Dali activo' : 'Dali en pausa'}
            </StatusPill>
          </div>
          <p className="mt-1.5 max-w-2xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">
            Elige qué avisos te manda Dali y por dónde, para que ningún cliente ni cotización se quede sin atender.
          </p>
        </div>
        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-[15px] text-red-800" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="grid gap-4 px-4 pb-36 pt-4 md:px-0 md:pb-0 md:pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
        <div className="grid content-start gap-4 lg:gap-6">
          <Tarjeta>
            <CabeceraTarjeta
              icon="send_to_mobile"
              titulo="Por dónde te avisa Dali"
              detalle="Elige el canal donde llegan los avisos de prospectos y cotizaciones."
              divisor={false}
            />
            <div className="mt-4 space-y-3">
              <OpcionCanal
                elegida={form.canal === 'grupo'}
                onElegir={() => set({ canal: 'grupo' })}
                titulo="Grupo de WhatsApp"
                chip="Recomendado"
                detalle="Avisa en tiempo real a todo tu equipo comercial."
              >
                {opcionesGrupo.length ? (
                  <span className="relative mt-3 block">
                    <select
                      value={form.grupoJid}
                      onChange={(e) => set({ grupoJid: e.target.value })}
                      disabled={!notificaciones.gruposDisponibles}
                      aria-label="Grupo de WhatsApp"
                      className="h-12 w-full appearance-none rounded-xl border border-stone-200 bg-white px-4 pr-10 font-body text-base text-stone-900 disabled:bg-stone-50"
                    >
                      {!form.grupoJid && <option value="">Elige un grupo…</option>}
                      {opcionesGrupo.map((g) => (
                        <option key={g.jid} value={g.jid}>
                          {g.nombre}
                          {g.miembros ? ` (${g.miembros} ${g.miembros === 1 ? 'miembro' : 'miembros'})` : ''}
                        </option>
                      ))}
                    </select>
                    <Icon name="expand_more" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
                  </span>
                ) : (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 font-body text-sm text-amber-900">
                    Todavía no hay un grupo elegido y la línea no está conectada para listar los tuyos.
                  </p>
                )}
                {!notificaciones.gruposDisponibles && grupoActual && (
                  <p className="mt-2 font-body text-sm text-stone-500">Para cambiar de grupo, la línea tiene que estar conectada (se listan los grupos donde está el número).</p>
                )}
              </OpcionCanal>
              <OpcionCanal
                elegida={form.canal === 'dueno'}
                onElegir={() => set({ canal: 'dueno' })}
                titulo="Un número personal"
                detalle="Dali le escribe directo al celular de una persona."
              >
                <span className={cn('mt-3 flex h-12 items-stretch overflow-hidden rounded-xl border bg-white', form.canal === 'dueno' ? 'border-stone-200' : 'border-stone-100')}>
                  <span className="flex shrink-0 items-center gap-1.5 border-r border-stone-200 bg-stone-50 px-3 font-mono text-[15px] text-stone-600">
                    <Icon name="smartphone" className="text-lg" /> +51
                  </span>
                  <Input
                    inputMode="tel"
                    value={form.numeroDueno.startsWith('51') && form.numeroDueno.length === 11 ? form.numeroDueno.slice(2) : form.numeroDueno}
                    onChange={(e) => set({ numeroDueno: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                    onFocus={() => form.canal !== 'dueno' && set({ canal: 'dueno' })}
                    placeholder="902 049 935"
                    aria-label="Número personal"
                    className="h-full flex-1 rounded-none border-0 bg-transparent px-4 font-mono text-base tracking-wide text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0 md:text-base"
                  />
                </span>
              </OpcionCanal>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 opacity-80">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex items-center gap-3 font-headline text-base font-bold text-stone-500">
                    <span className="size-6 shrink-0 rounded-full border-2 border-stone-300 bg-white" aria-hidden="true" /> Correo electrónico
                  </p>
                  <span className="shrink-0 font-body text-sm text-stone-500">Todavía no</span>
                </div>
                <p className="mt-1 pl-9 font-body text-sm text-stone-500">Nada manda correos por ahora: los avisos van por WhatsApp.</p>
              </div>
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-stone-50 px-4 py-3 font-body text-[15px] leading-relaxed text-stone-600">
              <Icon name="info" className="mt-0.5 shrink-0 text-xl text-stone-500" />
              <span>
                Los avisos salen desde tu línea <span className="font-mono font-semibold text-stone-900">{telefonoLegible(notificaciones.linea) || '—'}</span> y también le llegan a
                cada miembro del equipo con los avisos activos. Para atender al cliente, respóndele desde el WhatsApp del negocio.
              </span>
            </p>
            <button
              type="button"
              onClick={() => prueba.mutate()}
              disabled={prueba.isPending || hayCambios}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 md:hidden"
            >
              <Icon name="send" className="text-xl" /> {prueba.isPending ? 'Enviando…' : hayCambios ? 'Guarda para probar' : 'Enviar mensaje de prueba'}
            </button>
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta
              icon="bedtime"
              titulo="Horario de descanso"
              detalle="Pausar los avisos al equipo por la noche."
              divisor={false}
              derecha={<Interruptor checked={form.descanso.activo} onChange={(activo) => set({ descanso: { ...form.descanso, activo } })} label="Horario de descanso" />}
            />
            <div className={cn('mt-4 grid grid-cols-2 gap-3', !form.descanso.activo && 'opacity-60')}>
              <label className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <span className="flex items-center gap-1.5 font-body text-sm text-stone-500">
                  <Icon name="schedule" className="text-lg" /> Silencio desde
                </span>
                <span className="mt-2 block">
                  <SelectorHora valor={form.descanso.desde} onChange={(desde) => set({ descanso: { ...form.descanso, desde } })} label="Silencio desde" />
                </span>
              </label>
              <label className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <span className="flex items-center gap-1.5 font-body text-sm text-stone-500">
                  <Icon name="wb_sunny" className="text-lg" /> Reanudar a las
                </span>
                <span className="mt-2 block">
                  <SelectorHora valor={form.descanso.hasta} onChange={(hasta) => set({ descanso: { ...form.descanso, hasta } })} label="Reanudar a las" />
                </span>
              </label>
            </div>
            <p className="mt-3 font-body text-sm leading-relaxed text-stone-500">
              Dali sigue atendiendo a los clientes con normalidad. En esa franja no sale ningún aviso; los leads igual quedan en el panel para verlos a la mañana.
            </p>
          </Tarjeta>
        </div>

        <Tarjeta>
          <CabeceraTarjeta
            icon="notifications_active"
            titulo="Qué avisar"
            detalle="Cada aviso, con el formato exacto que llega a WhatsApp."
            detalleDesdeLg
            derecha={
              <span className="rounded-full bg-teal-50 px-3 py-1.5 font-mono text-sm text-teal-800">
                {activos} de {disponibles} activos
              </span>
            }
            divisor={false}
          />
          <div className="mt-4 space-y-3">
            {notificaciones.eventos.map((e) => (
              <TarjetaEvento
                key={e.id}
                evento={e}
                activo={e.disponible ? form.casos[e.id as keyof Formulario['casos']] : false}
                onChange={(v) => e.disponible && set({ casos: { ...form.casos, [e.id]: v } })}
              />
            ))}
          </div>
        </Tarjeta>
      </div>

      {hayCambios && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,16px)+64px)] z-30 mx-auto w-full max-w-[390px] px-4 md:hidden">
          <button
            type="button"
            onClick={enviar}
            disabled={guardar.isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-body text-[15px] font-semibold text-white shadow-lg disabled:opacity-60"
          >
            <Icon name="check" className="text-xl" /> {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  );
}

function OpcionCanal({
  elegida,
  onElegir,
  titulo,
  chip,
  detalle,
  children,
}: {
  elegida: boolean;
  onElegir: () => void;
  titulo: string;
  chip?: string;
  detalle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-2xl border-2 p-4 transition-colors', elegida ? 'border-teal-700 bg-teal-50/30' : 'border-stone-200 bg-white')}>
      <button type="button" onClick={onElegir} className="flex w-full items-start gap-3 text-left" aria-pressed={elegida}>
        <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2', elegida ? 'border-teal-700' : 'border-stone-300')} aria-hidden="true">
          {elegida && <span className="size-3 rounded-full bg-teal-700" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-headline text-base font-bold text-stone-900">
            {titulo}
            {chip && (
              <StatusPill tono="amber" punto={false} className="text-[11px]">
                {chip}
              </StatusPill>
            )}
          </span>
          <span className="mt-0.5 block font-body text-sm text-stone-500">{detalle}</span>
        </span>
      </button>
      {children && <div className="pl-9">{children}</div>}
    </div>
  );
}

function TarjetaEvento({ evento, activo, onChange }: { evento: EventoDeAviso; activo: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn('rounded-2xl border border-stone-200 p-4', evento.disponible ? 'bg-white' : 'bg-stone-50')}>
      <div className="flex items-start justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 font-headline text-base font-bold text-stone-900">
          {evento.titulo}
          <StatusPill tono={evento.disponible ? 'amber' : 'stone'} punto={false} className="text-[11px]">
            {evento.etiqueta}
          </StatusPill>
        </p>
        <Interruptor checked={activo} onChange={onChange} label={`Avisar: ${evento.titulo}`} disabled={!evento.disponible} />
      </div>
      <p className="mt-1.5 font-body text-[15px] leading-relaxed text-stone-500">{evento.detalle}</p>
      <div
        className={cn('mt-3 rounded-xl border border-stone-200 bg-[#e7f5ea] px-3 py-2.5 font-body text-[14px] leading-relaxed text-stone-800', !evento.disponible && 'opacity-60')}
      >
        {evento.ejemplo.split('\n').map((linea, i) => (
          <p key={i} className={cn(i === 0 && 'font-semibold text-teal-900')}>
            {linea.replace(/\*/g, '')}
          </p>
        ))}
        <p className="mt-1 text-right font-mono text-[11px] text-stone-500">ejemplo</p>
      </div>
    </div>
  );
}

function NotificacionesEsqueleto() {
  return (
    <div className="animate-pulse px-4 pt-4 md:px-6 md:pt-6 xl:px-10" aria-busy="true" aria-label="Cargando notificaciones">
      <div className="hidden h-9 w-64 rounded-lg bg-stone-200 md:block" />
      <div className="mt-4 grid gap-4 md:mt-6 lg:grid-cols-2 lg:gap-6">
        <div className="h-96 rounded-2xl bg-stone-200" />
        <div className="h-96 rounded-2xl bg-stone-200" />
      </div>
    </div>
  );
}
