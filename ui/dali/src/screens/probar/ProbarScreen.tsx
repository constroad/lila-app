import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useSesion } from '@/lib/session';
import { horaDe } from '@/lib/format';
import type { Inicio, Servicios, Simulacion } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { Segmentado } from '@/components/Segmentado';
import { StatusPill } from '@/components/StatusPill';
import { useAccionesDeBarra } from '@/layout/barra';
import { Entendido } from './Entendido';

/**
 * A15 «Probar a Dali» (diseños `A15-probar` móvil, tablet y escritorio): el
 * simulador. Se le escribe como un cliente y contesta el MISMO motor que
 * atiende por WhatsApp (`POST probar`), con el guion y el perfil vigentes;
 * nada se guarda ni se avisa a nadie. A la derecha (desde tablet) lo que
 * Dali entendió; en móvil, debajo del chat.
 */
interface Mensaje {
  rol: 'cliente' | 'dali';
  texto: string;
  ms: number;
}

export function ProbarScreen() {
  const { yo } = useSesion();
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const { data: servicios } = useQuery({ queryKey: ['servicios'], queryFn: () => api.get<Servicios>('/servicios'), staleTime: 60_000 });
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [estado, setEstado] = useState<Record<string, unknown> | null>(null);
  const [ultima, setUltima] = useState<Simulacion | null>(null);
  const [clienteConocido, setClienteConocido] = useState(false);
  const [texto, setTexto] = useState('');
  const finRef = useRef<HTMLDivElement>(null);
  const entendidoRef = useRef<HTMLDivElement>(null);

  const enviar = useMutation({
    mutationFn: (t: string) =>
      api.post<Simulacion>('/probar', { texto: t, estado, ultimaPreguntaBot: [...mensajes].reverse().find((m) => m.rol === 'dali')?.texto, clienteConocido }),
    onMutate: (t) => setMensajes((m) => [...m, { rol: 'cliente', texto: t, ms: Date.now() }]),
    onSuccess: (s) => {
      setMensajes((m) => [...m, { rol: 'dali', texto: s.texto, ms: Date.now() }]);
      setEstado(s.estado);
      setUltima(s);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Dali no pudo contestar en el simulador'),
  });
  const reiniciar = () => {
    setMensajes([]);
    setEstado(null);
    setUltima(null);
    setTexto('');
  };
  const mandar = () => {
    const t = texto.trim();
    if (!t || enviar.isPending) return;
    setTexto('');
    enviar.mutate(t);
  };
  useEffect(() => {
    if (mensajes.length) finRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [mensajes.length, enviar.isPending]);

  useAccionesDeBarra(
    <StatusPill tono="teal" className="h-10 px-4 text-sm">
      Modo sandbox: nada se guarda
    </StatusPill>,
    []
  );

  const empresa = inicio?.empresa.nombre ?? '…';
  const activos = servicios?.guion.servicios.filter((s) => s.activo).map((s) => s.nombre) ?? [];
  const conocido = { nombre: yo?.usuario.nombre ?? 'Cliente', empresa };

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-1 px-2 py-2">
          <Link to="/inicio" aria-label="Volver al inicio" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
            <Icon name="arrow_back" className="text-2xl" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-headline text-base font-bold leading-tight tracking-tight text-stone-900">
              <span className="truncate">{empresa}</span>
              <StatusPill tono="teal" punto={false} className="shrink-0 px-1.5 text-[10px]">
                Simulador
              </StatusPill>
            </p>
            <p className="truncate font-body text-sm text-stone-500">Asistente Dali</p>
          </div>
          <button
            type="button"
            aria-label="Ver lo que Dali entendió"
            onClick={() => entendidoRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100"
          >
            <Icon name="tune" className="text-2xl" />
          </button>
        </div>
        <p className="flex items-center justify-between gap-2 border-t border-stone-100 bg-stone-50 px-4 py-2 font-body text-sm text-stone-600">
          <span className="flex items-center gap-2 font-semibold text-stone-800">
            <span className="size-2.5 rounded-full bg-emerald-500" /> Sandbox activo
          </span>
          <span>No avisa a nadie</span>
        </p>
      </header>

      <div className="hidden pt-6 md:block xl:pt-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Probar a Dali</h1>
            <p className="mt-1.5 max-w-xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">
              Escríbele como lo haría un cliente. No se guarda como lead ni avisa a nadie.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-3 rounded-2xl bg-stone-200/60 py-1 pl-4 pr-1">
              <span className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Simular como:</span>
              <Segmentado
                label="Simular como"
                valor={clienteConocido ? 'conocido' : 'nuevo'}
                onChange={(v) => setClienteConocido(v === 'conocido')}
                ajustado
                className="bg-transparent p-0"
                opciones={[
                  { valor: 'nuevo', label: 'Cliente nuevo', icon: !clienteConocido ? 'check_circle' : undefined },
                  { valor: 'conocido', label: `Cliente conocido (${conocido.nombre} · ${conocido.empresa})` },
                ]}
              />
            </div>
            <button
              type="button"
              onClick={reiniciar}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
            >
              <Icon name="refresh" className="text-xl" /> Reiniciar conversación
            </button>
          </div>
        </div>
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-body text-[15px] text-stone-600">
          <Icon name="verified" className="text-xl text-teal-700" />
          <span>
            Reglas vigentes de <span className="font-semibold text-stone-900">{empresa}</span>
          </span>
          <span className="hidden text-stone-300 lg:inline">·</span>
          <span className="hidden lg:inline">
            Servicios: <span className="font-semibold text-stone-900">{activos.join(', ') || '…'}</span>
          </span>
          <Link to="/asistente" className="ml-auto inline-flex items-center gap-1 font-semibold text-teal-800 hover:underline">
            Ver reglas del asistente <Icon name="arrow_forward" className="text-base" />
          </Link>
        </p>
      </div>

      <section className="mx-4 mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:hidden">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">
            <Icon name="person_outline" className="text-lg" /> Simular como
          </p>
          <button type="button" onClick={reiniciar} className="inline-flex min-h-9 items-center gap-1.5 font-body text-[15px] font-semibold text-teal-800">
            <Icon name="refresh" className="text-lg" /> Reiniciar chat
          </button>
        </div>
        <Segmentado
          label="Simular como"
          valor={clienteConocido ? 'conocido' : 'nuevo'}
          onChange={(v) => setClienteConocido(v === 'conocido')}
          className="mt-3"
          opciones={[
            { valor: 'nuevo', label: 'Cliente nuevo' },
            { valor: 'conocido', label: 'Cliente conocido' },
          ]}
        />
        <p className="mt-3 font-body text-[15px] leading-relaxed text-stone-500">
          Escríbele a Dali tal como hablaría un cliente por WhatsApp. Pruébala antes de publicar cambios en el guion.
        </p>
      </section>

      <div className="px-4 pb-32 pt-4 md:px-0 md:pb-0 md:pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm md:h-[calc(100dvh-20rem)] md:min-h-[560px]">
          <div className="flex items-center gap-3 bg-teal-900 px-4 py-3 text-white">
            <span className="relative flex size-10 items-center justify-center rounded-full bg-white font-headline text-base font-bold text-teal-900">
              D<span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-teal-900 bg-emerald-400" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="flex items-center gap-2 font-headline text-[15px] font-bold">
                <span className="truncate">Dali · {empresa}</span>
                <span className="rounded bg-teal-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-teal-100">SIM</span>
              </p>
              <p className="font-body text-xs text-teal-100">en línea (simulado)</p>
            </div>
            <Icon name="videocam" className="text-xl text-white/80" />
            <Icon name="call" className="text-xl text-white/80" />
            <Icon name="more_vert" className="text-xl text-white/80" />
          </div>
          <div
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-4"
            style={{ backgroundColor: 'var(--color-stone-200)', backgroundImage: 'radial-gradient(var(--color-stone-300) 0.8px, transparent 0.8px)', backgroundSize: '14px 14px' }}
          >
            <p className="mx-auto max-w-md rounded-lg bg-amber-50 px-3 py-1.5 text-center font-body text-xs leading-snug text-amber-900">
              <Icon name="lock" className="mr-1 text-sm" /> Entorno de prueba: es el mismo motor que atiende por WhatsApp, pero nada se guarda ni se avisa a nadie.
            </p>
            <p className="mx-auto w-fit rounded-lg bg-white/80 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase text-stone-500">Hoy · Lima, Perú</p>
            {mensajes.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[85%] rounded-xl px-3 py-2 shadow-sm md:max-w-[75%]',
                  m.rol === 'cliente' ? 'ml-auto rounded-tr-sm bg-emerald-100' : 'mr-auto rounded-tl-sm bg-white'
                )}
              >
                {m.rol === 'dali' && (
                  <p className="mb-1 flex items-center gap-2">
                    <span className="rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 font-label text-[10px] font-bold uppercase tracking-wider text-teal-800">Dali</span>
                    <span className="font-body text-xs text-stone-500">{empresa}</span>
                  </p>
                )}
                <p className="whitespace-pre-line font-body text-[15px] leading-relaxed text-stone-900">{m.texto}</p>
                <p className="mt-1 flex items-center justify-end gap-1 font-mono text-[11px] text-stone-500">
                  {horaDe(m.ms)} {m.rol === 'cliente' && <Icon name="done_all" className="text-sm text-teal-600" />}
                </p>
              </div>
            ))}
            {enviar.isPending && (
              <div className="mr-auto w-fit rounded-xl rounded-tl-sm bg-white px-4 py-3 shadow-sm" aria-label="Dali está escribiendo">
                <span className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-2 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
              </div>
            )}
            {!mensajes.length && (
              <p className="pt-6 text-center font-body text-sm text-stone-500">Escribe abajo como escribiría un cliente: «necesito asfaltar el patio de mi almacén».</p>
            )}
            <div ref={finRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mandar();
            }}
            className="flex items-center gap-2 border-t border-stone-200 bg-white px-3 py-2.5 md:px-4"
          >
            <Icon name="mood" className="hidden text-2xl text-stone-400 sm:inline-block" />
            <Icon name="attach_file" className="hidden text-2xl text-stone-400 sm:inline-block" />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe como el cliente…"
              aria-label="Mensaje del cliente"
              className="h-11 min-w-0 flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 font-body text-[15px] text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={!texto.trim() || enviar.isPending}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
            >
              <Icon name="send" className="text-xl" />
            </button>
          </form>
        </section>

        <div ref={entendidoRef} className="mt-4 lg:mt-0">
          <Entendido ultima={ultima} pendiente={enviar.isPending} />
        </div>
      </div>
    </div>
  );
}
