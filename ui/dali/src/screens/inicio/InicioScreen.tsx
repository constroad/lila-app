import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useSesion } from '@/lib/session';
import { fechaLarga, iniciales } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';
import type { Inicio } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FilaAtencion, FilaLead, TablaLeads, TarjetaCanal, TarjetaEstado, TarjetaMetrica, TarjetaPlan } from './cards';

/**
 * A1 «Inicio» (diseños `A1-inicio` móvil, tablet y escritorio): el saludo, el
 * estado de Dali, las métricas de hoy, quiénes piden atención, los últimos
 * leads y el plan. En escritorio se suma la columna derecha con el canal de
 * WhatsApp y los ajustes directos, y la tabla de leads. Datos: `GET /inicio`.
 */
export function InicioScreen() {
  const { yo } = useSesion();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: inicio, isPending } = useQuery({
    queryKey: ['inicio'],
    queryFn: () => api.get<Inicio>('/inicio'),
    refetchInterval: 60_000,
  });
  const cambiarEstado = useMutation({
    mutationFn: (enabled: boolean) => api.put('/asistente/estado', { enabled }),
    onSuccess: (_r, enabled) => {
      toast.success(enabled ? 'Dali vuelve a atender' : 'Dali en pausa: los mensajes quedan sin responder');
      void queryClient.invalidateQueries({ queryKey: ['inicio'] });
    },
    onError: () => toast.error('No se pudo cambiar el estado'),
  });
  const tomar = useMutation({
    mutationFn: (id: string) => api.post(`/conversaciones/${id}/tomar`),
    onSuccess: (_r, id) => {
      void queryClient.invalidateQueries({ queryKey: ['inicio'] });
      navigate(`/chats/${id}`);
    },
    onError: () => toast.error('No se pudo tomar la conversación'),
  });
  const ahoraMs = Date.now();
  const nombre = yo?.usuario.nombre ?? '';

  if (isPending || !inicio) return <InicioEsqueleto nombre={nombre} />;
  const m = inicio.metricas;
  const delta = (hoy: number, ayer: number) =>
    hoy - ayer > 0
      ? { texto: `${hoy - ayer} vs ayer`, tono: 'up' as const }
      : hoy - ayer === 0
        ? { texto: 'igual que ayer', tono: 'flat' as const }
        : { texto: `${hoy - ayer} vs ayer`, tono: 'flat' as const };

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <Encabezado inicio={inicio} nombre={nombre} />
      <div className="space-y-4 px-4 pt-4 md:px-0 md:pt-6 xl:space-y-6">
        <TarjetaEstado inicio={inicio} onCambiar={(v) => cambiarEstado.mutate(v)} cambiando={cambiarEstado.isPending} />

        <section>
          <div className="mb-2.5 flex items-center justify-between md:hidden">
            <h2 className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Métricas de hoy</h2>
            <span className="font-mono text-[11px] text-stone-500">Actualizado ahora</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <TarjetaMetrica
              titulo="Conversaciones"
              valor={String(m.conversacionesHoy)}
              icon="chat_bubble"
              delta={delta(m.conversacionesHoy, m.conversacionesAyer)}
              detalle={`${m.conversacionesHoy} gestionadas por Dali`}
            />
            <TarjetaMetrica
              titulo="Leads nuevos"
              valor={String(m.leadsNuevosHoy)}
              icon="person_add"
              delta={delta(m.leadsNuevosHoy, m.leadsNuevosAyer)}
              detalle="Con servicio y ubicación capturados"
            />
            <TarjetaMetrica
              titulo="Sin responder"
              valor={String(m.sinResponder)}
              icon="front_hand"
              tono={m.sinResponder > 0 ? 'alerta' : 'normal'}
              detalle={m.sinResponder > 0 ? 'Cliente esperando respuesta' : 'Nadie espera'}
            />
            <TarjetaMetrica
              titulo="Tiempo de resp."
              valor={m.tiempoRespuestaS === null ? '—' : String(m.tiempoRespuestaS)}
              unidad={m.tiempoRespuestaS === null ? undefined : 's'}
              icon="bolt"
              delta={m.tiempoRespuestaS !== null && m.tiempoRespuestaS <= 15 ? { texto: 'Inmediato', tono: 'flat' } : null}
              detalle="Mediana de hoy"
            />
          </div>
        </section>

        <div className="space-y-4 xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-6 xl:space-y-0">
          <div className="space-y-4 xl:space-y-6">
            <section className="xl:rounded-xl xl:border xl:border-stone-200 xl:bg-white xl:shadow-sm">
              <div className="mb-2.5 flex items-center justify-between xl:mb-0 xl:border-b xl:border-stone-200 xl:px-6 xl:py-4">
                <h2 className="flex items-center gap-2 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 md:font-headline md:text-lg md:normal-case md:tracking-tight md:text-stone-900">
                  <Icon name="front_hand" className="hidden text-2xl text-amber-600 xl:inline" />
                  Piden tu atención
                  {inicio.atencion.length > 0 && (
                    <span className="rounded-full bg-amber-600 px-2 py-0.5 font-mono text-xs font-bold text-white md:bg-amber-100 md:text-amber-800">{inicio.atencion.length}</span>
                  )}
                </h2>
                <span className="font-body text-sm text-amber-700 md:text-stone-400">{inicio.atencion.length > 0 ? 'Prioritario' : 'Nada pendiente'}</span>
              </div>
              <div className="space-y-3 xl:space-y-0 xl:divide-y xl:divide-stone-100">
                {inicio.atencion.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-stone-200 bg-white p-4 text-stone-500 xl:border-0">
                    <Icon name="check_circle" className="text-2xl text-emerald-600" />
                    <p className="font-body text-sm">Nadie pidió hablar con una persona. Dali está al día.</p>
                  </div>
                ) : (
                  inicio.atencion.map((a) => (
                    <div key={a.conversationId} className="xl:p-6">
                      <FilaAtencion a={a} onTomar={(id) => tomar.mutate(id)} tomando={tomar.isPending} />
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-stone-200 bg-white shadow-sm md:mt-4">
              <div className="flex items-center justify-between px-4 py-3.5 md:px-5 xl:border-b xl:border-stone-200 xl:px-6 xl:py-4">
                <h2 className="flex items-center gap-2 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 md:font-headline md:text-lg md:normal-case md:tracking-tight md:text-stone-900">
                  <Icon name="assignment_turned_in" className="hidden text-2xl text-teal-700 xl:inline" />
                  <span className="xl:hidden">Últimos leads</span>
                  <span className="hidden xl:inline">Últimos leads captados</span>
                </h2>
                <Link to="/leads" className="flex items-center gap-1 font-body text-sm font-semibold text-teal-800 hover:underline">
                  Ver todos <Icon name="chevron_right" className="text-lg" />
                </Link>
              </div>
              <div className="divide-y divide-stone-100 border-t border-stone-100 xl:hidden">
                {inicio.ultimosLeads.length === 0 ? (
                  <p className="px-4 py-6 text-center font-body text-sm text-stone-500">Todavía no hay leads. Cuando un cliente escriba y Dali junte los datos, aparece aquí.</p>
                ) : (
                  inicio.ultimosLeads.map((l) => <FilaLead key={l.id} lead={l} ahoraMs={ahoraMs} />)
                )}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                {inicio.ultimosLeads.length === 0 ? (
                  <p className="px-6 py-8 text-center font-body text-sm text-stone-500">Todavía no hay leads. Cuando un cliente escriba y Dali junte los datos, aparece aquí.</p>
                ) : (
                  <TablaLeads leads={inicio.ultimosLeads} ahoraMs={ahoraMs} />
                )}
              </div>
            </section>

            <div className="xl:hidden">
              <TarjetaPlan plan={inicio.plan} />
            </div>
          </div>

          <aside className="hidden space-y-6 xl:block">
            <TarjetaCanal asistente={inicio.asistente} />
            <TarjetaPlan plan={inicio.plan} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function Encabezado({ inicio, nombre }: { inicio: Inicio; nombre: string }) {
  const { yo } = useSesion();
  const pendientes = inicio.atencion.length;
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-stone-50/95 px-4 pb-2.5 pt-3.5 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="flex size-10 items-center justify-center rounded-full bg-teal-800 font-headline text-sm font-bold text-stone-100 ring-2 ring-stone-200">
              {iniciales(nombre)}
            </div>
            <span className={cn('absolute bottom-0 right-0 size-3 rounded-full border-2 border-white', inicio.asistente.encendido ? 'bg-emerald-600' : 'bg-stone-400')} />
          </div>
          <div>
            <h1 className="font-headline text-lg font-bold leading-tight tracking-tight text-stone-900">Hola, {nombre}</h1>
            <p className="font-label text-xs font-semibold uppercase tracking-wider text-stone-500">{inicio.empresa.nombre}</p>
          </div>
        </div>
        <CampanaNotificaciones pendientes={pendientes} />
      </header>

      <header className="hidden items-start justify-between gap-6 pt-6 md:flex xl:pt-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Hola, {nombre}</h1>
            <StatusPill tono={inicio.asistente.encendido ? 'teal' : 'stone'} punto={false} className="xl:hidden">
              {inicio.asistente.encendido ? 'En línea' : 'En pausa'}
            </StatusPill>
          </div>
          <p className="mt-1.5 font-body text-[15px] text-stone-500 xl:text-lg">
            <span className="text-stone-700">{inicio.empresa.nombre}</span>
            {inicio.empresa.rubro && ` · ${inicio.empresa.rubro}`}
            {inicio.empresa.ciudad && ` · ${inicio.empresa.ciudad}`}
            <span className="hidden xl:inline"> · {fechaLarga()}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            to="/whatsapp"
            className="hidden h-12 items-center gap-2 rounded-full bg-stone-200/70 px-5 font-body text-[15px] text-stone-800 hover:bg-stone-200 md:flex xl:hidden"
          >
            <Icon name="chat" className="text-xl text-teal-700" /> Ver en WhatsApp
          </Link>
          <CampanaNotificaciones pendientes={pendientes} escritorio />
          <Link to="/faq" aria-label="Ayuda" className="flex size-12 items-center justify-center rounded-full text-stone-500 hover:bg-stone-200/70 xl:hidden">
            <Icon name="help_outline" className="text-2xl" />
          </Link>
          <Link
            to="/probar"
            className="hidden h-14 items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-5 font-body text-[15px] text-stone-800 shadow-sm hover:bg-stone-50 xl:flex"
          >
            <Icon name="chat" className="text-xl text-teal-700" /> Probar chat en vivo
          </Link>
          <Link
            to="/leads?nuevo=1"
            className="hidden h-14 items-center gap-2 rounded-xl bg-teal-800 px-6 font-headline text-[15px] font-semibold text-white shadow-sm hover:bg-teal-900 xl:flex"
          >
            <Icon name="add" className="text-xl" /> Nuevo lead manual
          </Link>
          <div className="flex items-center gap-3 border-l border-stone-200 pl-4 xl:hidden">
            <div className="flex size-11 items-center justify-center rounded-full bg-stone-900 font-headline text-sm font-bold text-white">{iniciales(nombre)}</div>
            <div className="leading-tight">
              <p className="font-headline text-[15px] font-bold text-stone-900">{nombre}</p>
              <p className="font-body text-xs text-stone-500">{yo?.usuario.rol === 'owner' ? 'Administrador' : yo?.usuario.rol}</p>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

function CampanaNotificaciones({ pendientes, escritorio = false }: { pendientes: number; escritorio?: boolean }) {
  return (
    <Link
      to="/notificaciones"
      aria-label={`Notificaciones${pendientes ? `, ${pendientes} pendientes` : ''}`}
      className={cn(
        'relative flex items-center justify-center text-stone-600 transition-all hover:bg-stone-200/70 active:scale-95',
        escritorio ? 'size-12 rounded-full xl:size-14 xl:rounded-xl xl:border xl:border-stone-200 xl:bg-white xl:shadow-sm' : 'size-10 rounded-full'
      )}
    >
      <Icon name="notifications" className="text-[23px] xl:text-2xl" />
      {pendientes > 0 && (
        <span
          className={cn(
            'absolute flex items-center justify-center rounded-full bg-amber-600 font-mono font-bold text-white',
            escritorio ? 'right-3 top-3 size-2.5 xl:right-3.5 xl:top-3.5' : 'right-2 top-2 h-4 w-4 text-[10px] ring-2 ring-stone-50'
          )}
        >
          {!escritorio && pendientes}
        </span>
      )}
    </Link>
  );
}

function InicioEsqueleto({ nombre }: { nombre: string }) {
  return (
    <div className="md:px-6 xl:px-10">
      <div className="px-4 pt-6 md:px-0">
        <div className="h-8 w-48 animate-pulse rounded-md bg-stone-200" />
        <p className="sr-only">Cargando el inicio de {nombre}</p>
      </div>
      <div className="space-y-4 px-4 pt-4 md:px-0">
        <div className="h-24 animate-pulse rounded-xl bg-white shadow-sm" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />
          ))}
        </div>
        <div className="h-32 animate-pulse rounded-xl bg-white shadow-sm" />
        <div className="h-48 animate-pulse rounded-xl bg-white shadow-sm" />
      </div>
    </div>
  );
}
