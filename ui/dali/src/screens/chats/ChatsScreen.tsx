import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cuando, iniciales, telefonoLegible } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';
import type { ConversacionResumen, Inicio } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChatScreen } from './ChatScreen';

/**
 * A2 «Conversaciones» (diseños `A2-conversaciones`): el encabezado de la
 * empresa, el título con «N requieren atención», la búsqueda, los filtros en
 * UNA fila (Todas · Piden atención · Dali atendiendo · Persona a cargo ·
 * Cerradas) y las tarjetas con avatar, nombre · empresa, hora, el último
 * mensaje con quién lo dijo y el estado. En escritorio la lista es la columna
 * izquierda y la conversación elegida se abre al lado (A3).
 */
type Filtro = 'todas' | 'atencion' | 'bot' | 'human' | 'closed';

/** En tablet (diseño A2 tablet) los filtros van cortos: «Dali», «Persona»; en móvil y escritorio, enteros. */
const FILTROS: Array<{ id: Filtro; label: string; corto: string; punto?: string }> = [
  { id: 'todas', label: 'Todas', corto: 'Todas' },
  { id: 'atencion', label: 'Piden atención', corto: 'Piden atención', punto: 'bg-amber-500' },
  { id: 'bot', label: 'Dali atendiendo', corto: 'Dali', punto: 'bg-teal-600' },
  { id: 'human', label: 'Persona a cargo', corto: 'Persona', punto: 'bg-stone-500' },
  { id: 'closed', label: 'Cerradas', corto: 'Cerradas', punto: 'bg-stone-400' },
];

const estadoDe = (c: ConversacionResumen): { texto: string; tono: 'amber' | 'teal' | 'stone' | 'emerald'; icon?: 'front_hand' | 'person' | 'check_circle' } => {
  if (c.estado === 'human' && c.escaladaMs) return { texto: 'Pide atención', tono: 'amber', icon: 'front_hand' };
  if (c.estado === 'human') return { texto: 'Persona a cargo', tono: 'stone', icon: 'person' };
  if (c.estado === 'closed') return { texto: 'Cerrada', tono: 'stone', icon: 'check_circle' };
  return { texto: 'Dali atendiendo', tono: 'teal' };
};

export function ChatsScreen() {
  const { id } = useParams();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [q, setQ] = useState('');
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data, isPending } = useQuery({
    queryKey: ['conversaciones', filtro, q],
    queryFn: () =>
      api.get<{ conversaciones: ConversacionResumen[]; porEstado: Record<string, number> }>(
        `/conversaciones?estado=${filtro === 'todas' ? '' : filtro}&q=${encodeURIComponent(q)}`
      ),
    refetchInterval: 20_000,
  });
  const lista = data?.conversaciones ?? [];
  const atencion = lista.filter((c) => c.estado === 'human' && c.escaladaMs).length || (inicio?.atencion.length ?? 0);
  const total = Object.values(data?.porEstado ?? {}).reduce((s, n) => s + n, 0);
  const ahoraMs = Date.now();

  return (
    <div className={cn('lg:flex lg:h-dvh lg:overflow-hidden', id && 'max-lg:hidden')}>
      <div className="flex min-h-dvh flex-col lg:h-full lg:w-[380px] lg:shrink-0 lg:border-r lg:border-stone-200 lg:bg-white xl:w-[440px]">
        <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-stone-900 font-headline text-sm font-bold text-white">
              {iniciales(inicio?.empresa.nombre ?? 'D')}
            </div>
            <div>
              <p className="font-headline text-[15px] font-bold leading-tight text-stone-900">{inicio?.empresa.nombre ?? '…'}</p>
              <p className="font-body text-xs text-stone-500">Dali WhatsApp · {inicio?.asistente.encendido ? 'En línea' : 'En pausa'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tono={inicio?.asistente.conectado ? 'emerald' : 'stone'}>{inicio?.asistente.conectado ? 'Conectado' : 'Sin conexión'}</StatusPill>
            <Link to="/notificaciones" aria-label="Notificaciones" className="relative flex size-10 items-center justify-center rounded-full text-stone-600">
              <Icon name="notifications" className="text-2xl" />
              {atencion > 0 && <span className="absolute right-2 top-2 size-2.5 rounded-full bg-amber-500" />}
            </Link>
          </div>
        </header>

        <div className="px-4 pt-4 md:px-6 lg:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-3 font-headline text-[28px] font-bold tracking-tight text-stone-900 md:text-3xl">
                Conversaciones
                <span className="hidden rounded-full bg-stone-100 px-2.5 py-0.5 font-mono text-sm font-semibold text-stone-600 md:inline">{total}</span>
              </h1>
              <p className="mt-0.5 font-body text-sm text-stone-500 md:hidden">Chats en vivo sincronizados con WhatsApp</p>
            </div>
            {atencion > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 font-body text-sm font-semibold leading-tight text-amber-800">
                <Icon name="front_hand" className="text-lg text-amber-600" />
                {atencion} requieren
                <br className="xl:hidden" /> atención
              </span>
            )}
          </div>
          <label className="mt-4 flex h-12 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 focus-within:ring-2 focus-within:ring-teal-600/50 xl:rounded-lg xl:bg-stone-100">
            <Icon name="search" className="text-xl text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o número…"
              className="min-w-0 flex-1 bg-transparent font-body text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none"
            />
          </label>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
            {FILTROS.map((f) => {
              const activo = filtro === f.id;
              const n = f.id === 'todas' ? total : f.id === 'atencion' ? atencion : (data?.porEstado[f.id] ?? 0);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  className={cn(
                    'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 font-body text-sm font-semibold transition-colors',
                    activo
                      ? 'border-teal-800 bg-teal-800 text-white'
                      : f.id === 'atencion'
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                  )}
                >
                  {f.punto && !activo && <span className={cn('size-2 rounded-full md:hidden xl:inline-block', f.punto)} />}
                  <span className="md:hidden xl:inline">{f.label}</span>
                  <span className="hidden md:inline xl:hidden">{f.corto}</span>
                  {n > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 font-mono text-xs',
                        activo ? 'bg-white/20' : f.id === 'atencion' ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-600'
                      )}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex-1 space-y-3 px-4 pb-6 md:px-6 lg:space-y-0 lg:divide-y lg:divide-stone-100 lg:overflow-y-auto lg:px-0">
          {isPending ? (
            [0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />)
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
              <Icon name="forum" className="text-4xl text-stone-300" />
              <p className="font-headline font-semibold text-stone-800">Sin conversaciones {filtro !== 'todas' ? 'con ese filtro' : 'todavía'}</p>
              <p className="font-body text-sm text-stone-500">Cuando un cliente escriba al número del negocio, aparece aquí.</p>
            </div>
          ) : (
            lista.map((c) => <TarjetaConversacion key={c.id} c={c} activa={c.id === id} ahoraMs={ahoraMs} />)
          )}
        </div>
      </div>
      <div className="hidden min-w-0 flex-1 lg:block">
        {id ? (
          <ChatScreen embebido />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-stone-500">
            <Icon name="chat" className="text-5xl text-stone-300" />
            <p className="font-headline text-lg font-semibold text-stone-700">Elige una conversación</p>
            <p className="max-w-xs font-body text-sm">Verás el chat con el cliente y, al lado, los datos que Dali juntó.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TarjetaConversacion({ c, activa, ahoraMs }: { c: ConversacionResumen; activa: boolean; ahoraMs: number }) {
  const estado = estadoDe(c);
  const pide = estado.tono === 'amber';
  const quien = c.ultimoRol === 'bot' ? 'Dali: ' : c.ultimoRol === 'owner' ? 'Tú: ' : '';
  return (
    <Link
      to={`/chats/${c.id}`}
      className={cn(
        'relative block rounded-xl border bg-white p-4 shadow-sm transition-colors lg:rounded-none lg:border-0 lg:border-l-4 lg:shadow-none',
        pide ? 'border-amber-300 bg-amber-50/40 lg:border-l-amber-500' : 'border-stone-200 lg:border-l-transparent',
        activa && 'lg:bg-teal-50/40',
        !pide && 'hover:bg-stone-50'
      )}
    >
      {pide && <span className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-amber-500 lg:hidden" />}
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <div
            className={cn(
              'flex size-12 items-center justify-center rounded-full font-headline text-sm font-bold',
              pide ? 'bg-amber-100 text-amber-800' : c.tieneLead && c.estado === 'bot' ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200' : 'bg-stone-100 text-stone-700'
            )}
          >
            {c.nombre.startsWith('+') ? c.telefono.slice(-3) : iniciales(c.nombre)}
          </div>
          {pide && <span className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full border-2 border-white bg-amber-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate font-headline text-[15px] font-bold text-stone-900">{c.nombre.startsWith('+') ? telefonoLegible(c.telefono) : c.nombre}</p>
            <span className={cn('shrink-0 font-mono text-xs', pide ? 'font-semibold text-amber-800' : 'text-stone-400')}>{cuando(c.ultimoMensajeMs, ahoraMs)}</span>
          </div>
          <p className="mt-0.5 truncate font-body text-sm text-stone-700">
            {quien && <span className={cn('font-semibold', c.ultimoRol === 'bot' ? 'text-teal-800' : 'text-stone-900')}>{quien}</span>}
            {pide && c.ultimoRol === 'customer' ? `"${c.ultimoTexto}"` : (c.ultimoTexto ?? 'Sin mensajes')}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-stone-100 pt-2.5">
            {pide ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-3 py-1 font-label text-xs font-bold text-white">
                <Icon name="front_hand" className="text-sm" /> Pide atención
              </span>
            ) : (
              <StatusPill tono={estado.tono} punto={!estado.icon}>
                {estado.icon && <Icon name={estado.icon} className="text-sm" />}
                {estado.texto}
              </StatusPill>
            )}
            <span className="truncate font-mono text-xs text-stone-400">{c.tieneLead ? (c.estado === 'bot' ? 'Calificando lead' : 'Lead captado') : `${c.mensajes} mensajes`}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
