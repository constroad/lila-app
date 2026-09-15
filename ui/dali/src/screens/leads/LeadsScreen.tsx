import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cuando, iniciales } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { NOMBRE_ESTADO_LEAD, StatusPill, TONO_LEAD } from '@/components/StatusPill';
import type { EstadoLead, Inicio, LeadResumen } from '@/lib/types';
import { cn } from '@/lib/utils';
import { LeadScreen } from './LeadScreen';

/**
 * A4 «Leads» (diseños `A4-leads`): el encabezado de la empresa, «Leads» con
 * «N esta semana · M listos para cotizar», el conmutador Tablero/Lista, la
 * búsqueda, los chips por servicio en UNA fila, las pestañas por estado con
 * su conteo, y las tarjetas: servicio como píldora, hora, «WhatsApp», nombre,
 * empresa, resumen con lugar, «Resumen confirmado por el cliente» y «Cotizar
 * ahora». En escritorio, el tablero por estado en columnas y el lead elegido
 * en un panel a la derecha (A5).
 */
const ESTADOS: EstadoLead[] = ['nuevo', 'contactado', 'cotizado', 'ganado', 'perdido'];
const PUNTO_ESTADO: Record<EstadoLead, string> = { nuevo: 'bg-amber-500', contactado: 'bg-blue-500', cotizado: 'bg-teal-600', ganado: 'bg-emerald-500', perdido: 'bg-stone-400' };

type Respuesta = { leads: LeadResumen[]; total: number; porEstado: Record<EstadoLead, number> };

export function LeadsScreen() {
  const { id } = useParams();
  const [vista, setVista] = useState<'tablero' | 'lista'>('tablero');
  const [estado, setEstado] = useState<EstadoLead>('nuevo');
  const [servicio, setServicio] = useState<string>('todos');
  const [q, setQ] = useState('');
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data, isPending } = useQuery({ queryKey: ['leads', q], queryFn: () => api.get<Respuesta>(`/leads?q=${encodeURIComponent(q)}`), refetchInterval: 30_000 });
  const todos = data?.leads ?? [];
  const servicios = [...new Set(todos.map((l) => l.servicio))];
  const filtrados = todos.filter((l) => servicio === 'todos' || l.servicio === servicio);
  const ahoraMs = Date.now();
  const semana = todos.filter((l) => ahoraMs - l.creadoMs < 7 * 86_400_000).length;
  const listos = todos.filter((l) => l.confirmado && l.estado === 'nuevo').length;
  const porEstado = (e: EstadoLead) => filtrados.filter((l) => l.estado === e);

  return (
    <div className={cn('xl:flex xl:h-dvh xl:overflow-hidden', id && 'max-xl:hidden')}>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col xl:h-full xl:overflow-y-auto">
        <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-teal-800 font-headline text-sm font-bold text-white">
              {iniciales(inicio?.empresa.nombre ?? 'D')}
            </div>
            <div>
              <p className="font-headline text-[17px] font-bold leading-tight text-stone-900">{inicio?.empresa.nombre ?? '…'}</p>
              <p className="font-body text-sm text-stone-500">{[inicio?.empresa.rubro, inicio?.empresa.ciudad].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <Link to="/notificaciones" aria-label="Notificaciones" className="relative flex size-11 items-center justify-center rounded-full text-stone-600">
            <Icon name="notifications" className="text-2xl" />
            {(inicio?.atencion.length ?? 0) > 0 && <span className="absolute right-2 top-2 size-2.5 rounded-full bg-amber-500" />}
          </Link>
        </header>

        <div className="px-4 pt-5 md:px-6 xl:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-3 font-headline text-[34px] font-bold leading-none tracking-tight text-stone-900 xl:text-4xl">
                Leads
                <span className="hidden rounded-full border border-teal-200 bg-teal-50 px-3 py-1 font-label text-sm font-semibold uppercase tracking-wider text-teal-800 xl:inline">
                  {inicio?.empresa.nombre}
                </span>
              </h1>
              <p className="mt-2 font-body text-[15px] text-stone-500">
                <span className="font-semibold text-stone-900">{semana}</span> esta semana · <span className="font-semibold text-teal-800">{listos} listos para cotizar</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div role="tablist" aria-label="Vista" className="flex rounded-xl bg-stone-200/70 p-1">
                {(
                  [
                    ['tablero', 'view_kanban', 'Tablero'],
                    ['lista', 'format_list_bulleted', 'Lista'],
                  ] as const
                ).map(([v, icon, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={vista === v}
                    onClick={() => setVista(v)}
                    className={cn(
                      'flex h-10 items-center gap-1.5 rounded-lg px-3 font-body text-[15px] transition-all md:h-11 md:gap-2 md:px-4',
                      vista === v ? 'bg-white font-semibold text-stone-900 shadow-sm' : 'text-stone-600'
                    )}
                  >
                    <Icon name={icon} className={cn('text-xl', vista === v && 'text-teal-700')} /> {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="hidden h-12 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] text-stone-800 shadow-sm xl:flex"
              >
                <Icon name="download" className="text-xl text-stone-500" /> Exportar
              </button>
              <button type="button" className="hidden h-12 items-center gap-2 rounded-xl bg-teal-800 px-5 font-headline text-[15px] font-semibold text-white xl:flex">
                <Icon name="person_add" className="text-xl" /> Nuevo lead
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl xl:border xl:border-stone-200 xl:bg-white xl:p-5 xl:shadow-sm">
            <label className="flex h-13 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 focus-within:ring-2 focus-within:ring-teal-600/50 xl:h-12 xl:rounded-lg">
              <Icon name="search" className="text-xl text-stone-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por cliente, empresa o zona…"
                className="min-w-0 flex-1 bg-transparent font-body text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none"
              />
            </label>
            <div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] xl:mx-0 xl:flex-wrap xl:px-0">
              <span className="hidden font-label text-sm font-semibold uppercase tracking-wider text-stone-500 xl:inline">Servicio:</span>
              {[['todos', 'Todos', todos.length] as const, ...servicios.map((s) => [s, s.replace(/\s*\(.*?\)/, ''), todos.filter((l) => l.servicio === s).length] as const)].map(
                ([id, label, n]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setServicio(id)}
                    className={cn(
                      'inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 font-body text-[15px] transition-colors first-letter:uppercase xl:h-10 xl:rounded-lg',
                      servicio === id ? 'border-teal-800 bg-teal-800 font-semibold text-white' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 xl:bg-stone-100'
                    )}
                  >
                    {label} <span className={cn('rounded-md px-1.5 font-mono text-xs', servicio === id ? 'bg-white/20' : 'bg-stone-100 text-stone-500')}>{n}</span>
                  </button>
                )
              )}
            </div>
          </div>

          {vista === 'tablero' && (
            <div className="-mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 [scrollbar-width:none] xl:hidden">
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEstado(e)}
                  className={cn(
                    'flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 font-body text-[15px] transition-colors',
                    estado === e ? 'border-teal-800 font-semibold text-teal-900' : 'border-transparent text-stone-600'
                  )}
                >
                  {NOMBRE_ESTADO_LEAD[e]}
                  <span
                    className={cn('rounded-full px-2 py-0.5 font-mono text-xs', estado === e ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200' : 'bg-stone-100 text-stone-600')}
                  >
                    {porEstado(e).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 px-4 pb-8 pt-4 md:px-6 xl:px-8">
          {isPending ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-xl bg-white shadow-sm" />
              ))}
            </div>
          ) : vista === 'lista' ? (
            <ListaLeads leads={filtrados} ahoraMs={ahoraMs} activo={id} />
          ) : (
            <>
              <div className="space-y-3 xl:hidden">
                <p className="flex items-center justify-between font-body text-sm text-stone-600">
                  <span className="flex items-center gap-2">
                    <span className={cn('size-2 rounded-full', PUNTO_ESTADO[estado])} /> {porEstado(estado).length}{' '}
                    {estado === 'nuevo' ? 'prospectos entrantes por WhatsApp' : `en ${NOMBRE_ESTADO_LEAD[estado].toLowerCase()}`}
                  </span>
                  <span className="font-mono text-xs text-stone-400">Actualizado ahora</span>
                </p>
                {porEstado(estado).length === 0 ? <Vacio estado={estado} /> : porEstado(estado).map((l) => <TarjetaLead key={l.id} lead={l} ahoraMs={ahoraMs} />)}
              </div>
              <div className="hidden gap-4 overflow-x-auto pb-4 xl:flex">
                {ESTADOS.map((e) => (
                  <div key={e} className="w-[320px] shrink-0 rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <div className="flex items-center justify-between px-1 pb-3">
                      <h2 className="flex items-center gap-2 font-label text-sm font-bold uppercase tracking-[0.1em] text-stone-800">
                        <span className={cn('size-2.5 rounded-full', PUNTO_ESTADO[e])} /> {NOMBRE_ESTADO_LEAD[e]}
                        <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs text-stone-600 ring-1 ring-stone-200">{porEstado(e).length}</span>
                      </h2>
                      {e === 'nuevo' && <Icon name="add" className="text-xl text-stone-400" />}
                    </div>
                    <div className="space-y-3">
                      {porEstado(e).map((l) => (
                        <TarjetaLead key={l.id} lead={l} ahoraMs={ahoraMs} compacta activo={l.id === id} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {id && (
        <aside className="hidden w-[560px] shrink-0 overflow-y-auto border-l border-stone-200 bg-white xl:block">
          <LeadScreen embebido />
        </aside>
      )}
    </div>
  );
}

function Vacio({ estado }: { estado: EstadoLead }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
      <Icon name="group" className="text-4xl text-stone-300" />
      <p className="font-headline font-semibold text-stone-800">Sin leads en {NOMBRE_ESTADO_LEAD[estado].toLowerCase()}</p>
      <p className="font-body text-sm text-stone-500">
        {estado === 'nuevo' ? 'Cuando Dali junte los datos de un cliente, el lead aparece aquí.' : 'Cambia el estado de un lead desde su ficha.'}
      </p>
    </div>
  );
}

function ListaLeads({ leads, ahoraMs, activo }: { leads: LeadResumen[]; ahoraMs: number; activo?: string }) {
  if (!leads.length) return <Vacio estado="nuevo" />;
  return (
    <div className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      {leads.map((l) => (
        <Link key={l.id} to={`/leads/${l.id}`} className={cn('flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-stone-50', activo === l.id && 'bg-teal-50/50')}>
          <div className="min-w-0">
            <p className="truncate font-headline text-[15px] font-bold text-stone-900">{l.titulo}</p>
            <p className="truncate font-body text-sm text-stone-500">
              {l.nombre}
              {l.empresa && ` (${l.empresa})`} · <span className="font-mono text-[13px]">{cuando(l.actualizadoMs, ahoraMs)}</span>
            </p>
          </div>
          <StatusPill tono={TONO_LEAD[l.estado]}>{NOMBRE_ESTADO_LEAD[l.estado]}</StatusPill>
        </Link>
      ))}
    </div>
  );
}

export function TarjetaLead({ lead, ahoraMs, compacta = false, activo = false }: { lead: LeadResumen; ahoraMs: number; compacta?: boolean; activo?: boolean }) {
  const resumen = [lead.distrito, ...lead.campos.slice(0, 2).map(([k, v]) => `${k} ${v}`)].filter(Boolean);
  return (
    <article className={cn('rounded-xl border bg-white shadow-sm', activo ? 'border-teal-700 ring-2 ring-teal-100' : 'border-stone-200', compacta ? 'p-4' : 'p-4 md:p-5')}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'truncate rounded-lg border px-3 py-1 font-body text-[15px] font-semibold',
            lead.confirmado ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-amber-200 bg-amber-50 text-amber-800'
          )}
        >
          {lead.titulo.split(' · ')[0]}
        </span>
        <span className="shrink-0 font-mono text-[13px] text-stone-400">{cuando(lead.actualizadoMs, ahoraMs)}</span>
        {!compacta && (
          <Link
            to={`/chats/${lead.conversationId}`}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 font-body text-sm font-semibold text-teal-800"
          >
            <Icon name="chat" className="text-lg" /> WhatsApp
          </Link>
        )}
      </div>
      <h3 className="mt-3 font-headline text-xl font-bold tracking-tight text-stone-900">{lead.nombre}</h3>
      {lead.empresa && (
        <p className="mt-0.5 flex items-center gap-1.5 font-body text-[15px] text-stone-500">
          <Icon name="corporate_fare" className="text-lg text-stone-400" /> {lead.empresa}
        </p>
      )}
      <div className={cn('mt-3 rounded-lg bg-stone-50 p-3', compacta && 'p-2.5')}>
        <p className="flex items-start gap-1.5 font-body text-[15px] text-stone-700">
          <Icon name="location_on" className="mt-0.5 shrink-0 text-lg text-stone-400" />
          <span>
            {lead.distrito && <span className="font-semibold text-stone-900">{lead.distrito}</span>}
            {resumen.length > 1 && ` · ${resumen.slice(1).join(', ')}`}
            {resumen.length === 0 && 'Sin detalle todavía'}
          </span>
        </p>
        {lead.confirmado && (
          <p className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 font-body text-sm font-semibold text-emerald-700">
            <Icon name="check_circle" className="text-lg" /> Resumen confirmado por el cliente en WhatsApp
          </p>
        )}
      </div>
      <div className={cn('mt-3 flex items-center gap-2 border-t border-stone-100 pt-3', compacta && 'mt-2.5 pt-2.5')}>
        <Link
          to={`/leads/${lead.id}`}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-full bg-teal-800 font-headline font-bold text-white hover:bg-teal-900',
            compacta ? 'h-10 text-sm' : 'h-12 text-[15px]'
          )}
        >
          <Icon name="request_quote" className="text-xl" /> {lead.estado === 'nuevo' ? 'Cotizar ahora' : 'Ver lead'}
        </Link>
        <Link
          to={`/chats/${lead.conversationId}`}
          aria-label="Abrir conversación"
          className={cn('flex shrink-0 items-center justify-center rounded-full border border-stone-200 text-teal-800 hover:bg-stone-50', compacta ? 'size-10' : 'size-12')}
        >
          <Icon name="forum" className="text-xl" />
        </Link>
      </div>
    </article>
  );
}
