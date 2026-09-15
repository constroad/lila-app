import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { horaDe, iniciales, telefonoLegible } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';
import type { ConversacionDetalle, Inicio, MensajeConversacion } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * A3 «Conversación» (diseños `A3-conversacion`): el encabezado con el cliente
 * y su estado, el aviso ámbar cuando pidió una persona (con «Tomar»), la ficha
 * del lead con sus acciones (Ver lead · Devolver a Dali · Cerrar), la
 * transcripción con burbujas —el cliente a la izquierda, Dali a la derecha con
 * su rótulo, tú también a la derecha— y el cajón «Escribe como <empresa>…»
 * que avisa que al escribir Dali se calla 30 min. En escritorio vive dentro
 * de A2, con los datos del lead en una columna a la derecha.
 */
export function ChatScreen({ embebido = false }: { embebido?: boolean }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ['conversacion', id],
    queryFn: () => api.get<ConversacionDetalle>(`/conversaciones/${id}`),
    refetchInterval: 10_000,
    enabled: Boolean(id),
  });
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const empresa = inicio?.empresa.nombre ?? 'tu empresa';
  const [texto, setTexto] = useState('');
  const finRef = useRef<HTMLDivElement | null>(null);
  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['conversacion', id] });
    void queryClient.invalidateQueries({ queryKey: ['conversaciones'] });
    void queryClient.invalidateQueries({ queryKey: ['inicio'] });
  };
  const accion = useMutation({
    mutationFn: (que: 'tomar' | 'devolver' | 'cerrar') => api.post(`/conversaciones/${id}/${que}`),
    onSuccess: (_r, que) => {
      toast.success({ tomar: 'Tomaste la conversación: Dali se calla 30 min', devolver: 'Dali vuelve a atender esta conversación', cerrar: 'Conversación cerrada' }[que]);
      invalidar();
    },
    onError: () => toast.error('No se pudo hacer'),
  });
  const enviar = useMutation({
    mutationFn: (t: string) => api.post(`/conversaciones/${id}/mensaje`, { texto: t }),
    onSuccess: () => {
      setTexto('');
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo enviar'),
  });

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.mensajes.length]);

  if (isPending || !data) return <div className={cn('min-h-dvh animate-pulse bg-stone-100', embebido && 'h-full min-h-0')} aria-busy="true" />;
  const { conversacion: c, mensajes, lead } = data;
  const pide = c.estado === 'human' && Boolean(c.escaladaMs);
  const nombre = c.nombre.startsWith('+') ? telefonoLegible(c.telefono) : c.nombre;
  const haceMin = c.escaladaMs ? Math.max(0, Math.round((Date.now() - c.escaladaMs) / 60_000)) : 0;

  const mandar = (e: FormEvent) => {
    e.preventDefault();
    if (texto.trim()) enviar.mutate(texto.trim());
  };

  return (
    <div className={cn('flex flex-col bg-stone-100', embebido ? 'h-full' : 'min-h-dvh')}>
      <div className={cn('flex min-h-0 flex-1', embebido && 'overflow-hidden')}>
        <div className={cn('flex min-w-0 flex-1 flex-col', embebido && 'h-full')}>
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stone-200 bg-white px-2 py-2.5 md:px-4">
            {!embebido && (
              <button
                type="button"
                onClick={() => navigate('/chats')}
                aria-label="Volver"
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100"
              >
                <Icon name="arrow_back" className="text-2xl" />
              </button>
            )}
            <div className="relative shrink-0">
              <div
                className={cn(
                  'flex size-11 items-center justify-center rounded-full font-headline text-sm font-bold',
                  pide ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-700'
                )}
              >
                {iniciales(nombre)}
              </div>
              <span className={cn('absolute bottom-0 right-0 size-3 rounded-full border-2 border-white', c.estado === 'closed' ? 'bg-stone-400' : 'bg-emerald-500')} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2 [&>span]:shrink-0 [&>span]:whitespace-nowrap">
                <h1 className="min-w-[4.5rem] truncate font-headline text-[17px] font-bold text-stone-900">{nombre}</h1>
                {pide ? (
                  <StatusPill tono="amber">Pide atención</StatusPill>
                ) : c.estado === 'human' ? (
                  <StatusPill tono="stone">Persona a cargo</StatusPill>
                ) : c.estado === 'closed' ? (
                  <StatusPill tono="stone">Cerrada</StatusPill>
                ) : (
                  <StatusPill tono="teal">Dali atendiendo</StatusPill>
                )}
              </div>
              <p className="truncate font-body text-sm text-stone-500">
                {lead?.empresa && `${lead.empresa} · `}
                <span className="font-mono">{telefonoLegible(c.telefono)}</span>
              </p>
            </div>
            <a
              href={`https://wa.me/${c.telefono}`}
              target="_blank"
              rel="noreferrer"
              className="hidden h-11 items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 font-body text-sm font-semibold text-teal-800 xl:inline-flex"
            >
              <Icon name="open_in_new" className="text-lg" /> WhatsApp Web
            </a>
            <a href={`tel:+${c.telefono}`} aria-label="Llamar" className="flex size-11 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100">
              <Icon name="call" className="text-2xl" />
            </a>
            <button type="button" aria-label="Más opciones" className="flex size-11 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100">
              <Icon name="more_vert" className="text-2xl" />
            </button>
          </header>

          {pide && (
            <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full border border-amber-200 bg-amber-100 text-amber-700">
                  <Icon name="front_hand" className="text-xl" />
                </span>
                <p className="font-body text-[15px] font-semibold leading-tight text-amber-900">
                  Pidió hablar con una persona
                  <br />
                  <span className="font-normal">hace {haceMin} min</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => accion.mutate('tomar')}
                disabled={accion.isPending}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-teal-800 px-5 font-headline text-[15px] font-bold text-white hover:bg-teal-900 disabled:opacity-60 xl:hidden"
              >
                Tomar <Icon name="person_check" className="text-xl" />
              </button>
            </div>
          )}

          {lead && (
            <section className="mx-4 mt-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm xl:hidden">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-label text-sm font-bold uppercase tracking-[0.1em] text-stone-800">
                  <Icon name="verified" className="text-xl text-teal-700" /> Ficha del lead
                </h2>
                <StatusPill tono={lead.confirmado ? 'teal' : 'amber'}>{lead.confirmado ? 'Lead calificado' : 'En proceso'}</StatusPill>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
                {[
                  [
                    'Servicio',
                    lead.servicio
                      .replace(/\s*\(.*?\)/, '')
                      .charAt(0)
                      .toUpperCase() + lead.servicio.replace(/\s*\(.*?\)/, '').slice(1),
                  ],
                  [lead.cantidad?.includes('m³') ? 'Cantidad' : 'Área estimada', lead.cantidad ?? '—'],
                  ['Ubicación', lead.distrito ?? '—'],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="truncate font-label text-[10px] font-semibold uppercase tracking-wider text-stone-500">{k}</dt>
                    <dd className={cn('mt-1 truncate font-body text-[14px] font-semibold text-stone-900', k !== 'Servicio' && k !== 'Ubicación' && 'font-mono')}>{v}</dd>
                  </div>
                ))}
              </dl>
              <AccionesLead leadId={lead.id} estado={c.estado} onAccion={(q) => accion.mutate(q)} />
            </section>
          )}

          <div
            className={cn('flex-1 space-y-3 px-4 py-4', embebido && 'min-h-0 overflow-y-auto')}
            style={{ backgroundImage: 'radial-gradient(circle, rgb(214 211 209 / 0.6) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
          >
            <p className="mx-auto w-fit rounded-full bg-stone-200/80 px-4 py-1 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Hoy · Lima, Perú</p>
            {mensajes.map((m) => (
              <Burbuja key={m.id} m={m} empresa={empresa} />
            ))}
            <div ref={finRef} />
          </div>

          <form onSubmit={mandar} className="sticky bottom-[calc(env(safe-area-inset-bottom,16px)+64px)] border-t border-stone-200 bg-white px-3 pb-2 pt-3 md:bottom-0">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Respuestas rápidas" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100">
                <Icon name="bolt" className="text-2xl" />
              </button>
              <label className="flex h-14 min-w-0 flex-1 items-center rounded-full border border-stone-300 bg-white pl-5 pr-2 focus-within:ring-2 focus-within:ring-teal-600/50">
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={`Escribe como ${empresa}…`}
                  className="min-w-0 flex-1 bg-transparent font-body text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none"
                />
                <button type="button" aria-label="Adjuntar" className="flex size-10 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100">
                  <Icon name="attach_file" className="text-xl" />
                </button>
              </label>
              <button
                type="submit"
                disabled={!texto.trim() || enviar.isPending}
                aria-label="Enviar"
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-teal-800 text-white shadow-md hover:bg-teal-900 disabled:opacity-50"
              >
                <Icon name="send" className="text-2xl" />
              </button>
            </div>
            <p className="mt-2 flex items-center justify-center gap-1.5 font-body text-xs text-stone-500">
              <Icon name="info" className="text-base text-teal-700" /> Al escribir, Dali se calla 30 min en esta conversación
            </p>
          </form>
        </div>

        {embebido && (
          <aside className="hidden w-[400px] shrink-0 overflow-y-auto border-l border-stone-200 bg-white p-6 xl:block 2xl:w-[460px]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-label text-sm font-bold uppercase tracking-[0.1em] text-stone-800">
                <Icon name="contact_page" className="text-xl text-teal-700" /> Datos del lead
              </h2>
              {lead && <StatusPill tono={lead.confirmado ? 'teal' : 'amber'}>{lead.confirmado ? 'Lead calificado' : 'En proceso'}</StatusPill>}
            </div>
            <p className="mt-1 font-body text-sm text-stone-500">Información capturada por Dali en el guion de WhatsApp.</p>
            <div className="mt-5 space-y-2.5">
              {c.estado !== 'human' && c.estado !== 'closed' && (
                <button
                  type="button"
                  onClick={() => accion.mutate('tomar')}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-teal-800 font-headline text-[15px] font-bold text-white hover:bg-teal-900"
                >
                  <Icon name="support_agent" className="text-xl" /> Tomar la conversación
                </button>
              )}
              {pide && (
                <button
                  type="button"
                  onClick={() => accion.mutate('tomar')}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-teal-800 font-headline text-[15px] font-bold text-white hover:bg-teal-900"
                >
                  <Icon name="support_agent" className="text-xl" /> Tomar la conversación
                </button>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => accion.mutate('devolver')}
                  className="flex h-14 items-center justify-center gap-2 rounded-lg border border-stone-200 font-body text-[15px] text-stone-800 hover:bg-stone-50"
                >
                  <Icon name="replay" className="text-xl" /> Devolver a Dali
                </button>
                <button
                  type="button"
                  onClick={() => accion.mutate('cerrar')}
                  className="flex h-14 items-center justify-center gap-2 rounded-lg border border-stone-200 font-body text-[15px] text-stone-800 hover:bg-stone-50"
                >
                  <Icon name="check_circle" className="text-xl" /> Marcar cerrada
                </button>
              </div>
            </div>
            {lead ? (
              <div className="mt-5 rounded-xl border border-stone-200 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-headline text-[17px] font-bold text-stone-900">Resumen técnico</h3>
                  <span className="rounded-md bg-teal-50 px-2.5 py-1 font-label text-xs font-semibold text-teal-800">
                    {lead.confirmado ? 'confirmado por el cliente' : 'en curso'}
                  </span>
                </div>
                <dl className="mt-4 divide-y divide-stone-100 font-body text-[15px]">
                  <Dato k="A nombre de" v={`${lead.nombre}${lead.empresa ? ` · ${lead.empresa}` : ''}`} />
                  <Dato k="Servicio" v={<span className="rounded-md bg-teal-50 px-2 py-0.5 font-semibold capitalize text-teal-800">{lead.servicio}</span>} />
                  {lead.cantidad && <Dato k="Cantidad" v={<span className="font-mono font-semibold">{lead.cantidad}</span>} />}
                  {lead.distrito && (
                    <Dato
                      k="Lugar"
                      v={
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Icon name="location_on" className="text-base text-stone-400" />
                          {lead.distrito}
                        </span>
                      }
                    />
                  )}
                  {lead.fecha && <Dato k="Fecha" v={lead.fecha} />}
                  {lead.campos.map(([k, v]) => (
                    <Dato key={k} k={k} v={v} />
                  ))}
                </dl>
                <Link
                  to={`/leads/${lead.id}`}
                  className="mt-4 flex h-11 items-center justify-center gap-2 rounded-lg border border-teal-200 bg-teal-50 font-body text-sm font-semibold text-teal-800 hover:bg-teal-100"
                >
                  <Icon name="visibility" className="text-lg" /> Ver lead completo
                </Link>
              </div>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-stone-300 p-5 text-center font-body text-sm text-stone-500">
                Dali todavía no juntó los datos de un pedido en esta conversación.
              </p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-stone-500">{k}:</dt>
      <dd className="text-right text-stone-900">{v}</dd>
    </div>
  );
}

function AccionesLead({ leadId, estado, onAccion }: { leadId: string; estado: string; onAccion: (q: 'devolver' | 'cerrar') => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-1 whitespace-nowrap border-t border-stone-100 pt-3">
      <Link to={`/leads/${leadId}`} className="inline-flex h-11 items-center gap-1 rounded-lg bg-teal-50 px-2.5 font-body text-[13px] font-semibold text-teal-800">
        <Icon name="visibility" className="text-lg" /> Ver lead
      </Link>
      <button
        type="button"
        onClick={() => onAccion('devolver')}
        disabled={estado === 'bot'}
        className="inline-flex h-11 items-center gap-1 px-1.5 font-body text-[13px] text-stone-700 disabled:opacity-40"
      >
        <Icon name="smart_toy" className="text-lg" /> Devolver a Dali
      </button>
      <button
        type="button"
        onClick={() => onAccion('cerrar')}
        disabled={estado === 'closed'}
        className="inline-flex h-11 items-center gap-1 px-1.5 font-body text-[13px] text-stone-700 disabled:opacity-40"
      >
        <Icon name="check_circle" className="text-lg" /> Cerrar
      </button>
      <Link to={`/leads/${leadId}#notas`} aria-label="Agregar nota" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100">
        <Icon name="note_add" className="text-xl" />
      </Link>
    </div>
  );
}

function Burbuja({ m, empresa }: { m: MensajeConversacion; empresa: string }) {
  const deDali = m.rol === 'bot';
  const mio = m.rol === 'owner';
  if (m.rol === 'system') return <p className="mx-auto w-fit rounded-full bg-stone-200/80 px-3 py-1 font-label text-xs text-stone-600">{m.texto}</p>;
  return (
    <div className={cn('flex', deDali || mio ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm md:max-w-[70%]',
          deDali ? 'rounded-tr-md border border-teal-200/70 bg-teal-50' : mio ? 'rounded-tr-md bg-teal-800 text-white' : 'rounded-tl-md bg-white'
        )}
      >
        {deDali && (
          <p className="mb-2 flex items-center gap-1.5 border-b border-teal-100 pb-1.5 font-label text-sm font-bold text-teal-800">
            <Icon name="smart_toy" className="text-lg" /> Dali · Asistente {empresa}
          </p>
        )}
        {mio && <p className="mb-1 font-label text-xs font-semibold uppercase tracking-wider text-teal-100">Tú</p>}
        <p className="whitespace-pre-wrap font-body text-[16px] leading-relaxed">{m.texto}</p>
        <p className={cn('mt-1.5 flex items-center justify-end gap-1 font-mono text-xs', deDali ? 'text-teal-800' : mio ? 'text-teal-100' : 'text-stone-400')}>
          {horaDe(m.enviadoMs)}
          {(deDali || mio) && <Icon name="done_all" className="text-base" />}
        </p>
      </div>
    </div>
  );
}
