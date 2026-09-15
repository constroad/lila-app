import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { haceCuanto } from '@/lib/format';
import type { Faq, FaqSugerida, Inicio } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';
import { useAccionesDeBarra } from '@/layout/barra';
import { ProbadorFaq } from './ProbadorFaq';
import { TarjetaFaq, faqNueva } from './TarjetaFaq';

/**
 * A11 «Preguntas frecuentes» (diseños `A11-faq` móvil, tablet y escritorio):
 * lo que Dali responde tal cual, sin inventar. Las sugeridas son preguntas
 * que los clientes hicieron y Dali no supo contestar; cada tarjeta se edita
 * en el lugar; la lista entera se guarda con «Guardar cambios». A la derecha
 * (desde tablet) el probador: `POST faq/probar` dice con cuál coincide y qué
 * contestaría Dali.
 */
export function FaqScreen() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ['faq'], queryFn: () => api.get<{ faqs: Faq[] }>('/faq') });
  const { data: sugeridasData } = useQuery({ queryKey: ['faq-sugeridas'], queryFn: () => api.get<{ sugeridas: FaqSugerida[] }>('/faq/sugeridas'), staleTime: 300_000 });
  const { data: inicio } = useQuery({ queryKey: ['inicio'], queryFn: () => api.get<Inicio>('/inicio'), staleTime: 60_000 });
  const [editadas, setEditadas] = useState<Faq[] | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string>('');
  const [editando, setEditando] = useState<string | null>(null);
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  const delServidor = useMemo(() => (data ? structuredClone(data.faqs) : null), [data]);
  const faqs = editadas ?? delServidor;
  const hayCambios = Boolean(delServidor && editadas && JSON.stringify(editadas) !== JSON.stringify(delServidor));

  const guardar = useMutation({
    mutationFn: (lista: Faq[]) => api.put<{ faqs: Faq[] }>('/faq', { faqs: lista }),
    onSuccess: (r) => {
      queryClient.setQueryData(['faq'], r);
      setEditadas(null);
      setEditando(null);
      toast.success('Preguntas guardadas: Dali las contesta desde el próximo mensaje');
    },
    onError: () => toast.error('No se pudieron guardar las preguntas'),
  });
  const enviar = () => faqs && guardar.mutate(faqs.filter((f) => f.pregunta.trim() && f.respuesta.trim()));
  const descartar = () => {
    setEditadas(null);
    setEditando(null);
  };

  useAccionesDeBarra(
    <>
      <Link
        to="/importar"
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-body text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
      >
        <Icon name="upload_file" className="text-xl" /> Importar desde Excel
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
    [hayCambios, guardar.isPending, faqs]
  );

  if (isPending || !faqs) return <FaqEsqueleto />;
  const set = (lista: Faq[]) => setEditadas(lista);
  const agregar = (semilla?: Partial<Faq>) => {
    const nueva = faqNueva(semilla);
    set([nueva, ...faqs]);
    setEditando(nueva.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const activas = faqs.filter((f) => f.activa).length;
  const categorias = [...new Set(faqs.map((f) => f.categoria).filter(Boolean))];
  const q = busqueda.trim().toLowerCase();
  const visibles = faqs.filter((f) => (!categoria || f.categoria === categoria) && (!q || [f.pregunta, f.respuesta, ...f.variantes].some((t) => t.toLowerCase().includes(q))));
  const sugeridas = (sugeridasData?.sugeridas ?? []).filter((s) => !ignoradas.includes(s.pregunta) && !faqs.some((f) => f.pregunta.toLowerCase() === s.pregunta.toLowerCase()));

  return (
    <div className="md:px-6 md:pb-10 xl:px-10">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stone-200 bg-white/95 px-3 py-2 backdrop-blur-md md:hidden">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-800 font-headline text-xs font-bold text-white">
          {(inicio?.empresa.nombre ?? 'D').slice(0, 2).toUpperCase()}
        </span>
        <h1 className="min-w-0 flex-1 truncate font-headline text-lg font-bold tracking-tight text-stone-900">{inicio?.empresa.nombre ?? '…'}</h1>
        <Link to="/notificaciones" aria-label="Notificaciones" className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100">
          <Icon name="notifications" className="text-2xl" />
        </Link>
      </header>

      <div className="px-4 pt-4 md:px-0 md:pt-6 xl:pt-8">
        <p className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 md:hidden">
          <Link to="/asistente" className="text-teal-800">
            Asistente
          </Link>{' '}
          › Configuración
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-headline text-3xl font-bold tracking-tight text-stone-900 xl:text-4xl">Preguntas frecuentes</h1>
              <StatusPill tono="stone" punto={false} className="text-sm">
                {activas} activas
              </StatusPill>
            </div>
            <p className="mt-1.5 max-w-2xl font-body text-[15px] leading-relaxed text-stone-500 xl:text-lg">
              Lo que Dali responde tal cual, sin inventar. Si la pregunta del cliente se parece, responde con esto.
            </p>
          </div>
          <button
            type="button"
            onClick={() => agregar()}
            className="hidden h-12 items-center gap-2 rounded-xl bg-teal-700 px-5 font-headline text-[15px] font-bold text-white hover:bg-teal-800 md:inline-flex"
          >
            <Icon name="add" className="text-xl" /> Agregar pregunta
          </button>
        </div>
        <div className="mt-4 space-y-3 md:hidden">
          <button
            type="button"
            onClick={() => agregar()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-headline text-[15px] font-bold text-white"
          >
            <Icon name="add" className="text-xl" /> Agregar pregunta
          </button>
          <Link
            to="/importar"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white font-body text-[15px] font-semibold text-stone-800"
          >
            <Icon name="upload_file" className="text-xl" /> Importar desde Excel
          </Link>
        </div>
      </div>

      <div className="px-4 pb-32 pt-5 md:px-0 md:pb-0 md:pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          {sugeridas.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 md:p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Icon name="lightbulb" className="text-2xl" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-label text-sm font-bold uppercase tracking-[0.08em] text-amber-900">
                      Sugeridas por Dali
                      <StatusPill tono="amber" punto={false}>
                        {sugeridas.length} sin responder
                      </StatusPill>
                    </h2>
                    <button
                      type="button"
                      onClick={() => setIgnoradas((v) => [...v, ...sugeridas.map((s) => s.pregunta)])}
                      className="font-body text-[15px] text-amber-900 underline underline-offset-4"
                    >
                      Ignorar todas
                    </button>
                  </div>
                  <p className="mt-1 font-body text-[15px] text-amber-900/80">
                    Estas preguntas las hicieron tus clientes y Dali no supo responder. Respóndelas para que Dali las conteste automáticamente en WhatsApp.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sugeridas.map((s) => (
                  <div key={s.pregunta} className="flex flex-col rounded-xl border border-amber-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <StatusPill tono="amber" punto={false}>
                        <Icon name="repeat" className="text-sm" /> {s.veces} {s.veces === 1 ? 'vez' : 'veces'}
                      </StatusPill>
                      <span className="font-body text-sm text-stone-500">{haceCuanto(s.ultimaVezMs)}</span>
                    </div>
                    <p className="mt-2 flex-1 font-body text-[15px] font-semibold text-stone-900">«{s.pregunta}»</p>
                    <button
                      type="button"
                      onClick={() => agregar({ pregunta: s.pregunta })}
                      className="mt-3 flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-50 font-body text-[15px] font-semibold text-teal-800 hover:bg-teal-100"
                    >
                      <Icon name="edit_note" className="text-xl" /> Responder
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative flex-1">
              <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-stone-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por pregunta, respuesta o variante…"
                aria-label="Buscar"
                className="h-12 w-full rounded-xl border border-stone-200 bg-white pl-12 pr-4 font-body text-[15px] text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
              />
            </label>
            {categorias.length > 0 && (
              <div role="tablist" aria-label="Categoría" className="flex gap-1 overflow-x-auto rounded-xl bg-stone-200/60 p-1">
                {[['', `Todas (${faqs.length})`], ...categorias.map((c) => [c, `${c} (${faqs.filter((f) => f.categoria === c).length})`])].map(([valor, label]) => (
                  <button
                    key={valor}
                    type="button"
                    role="tab"
                    aria-selected={categoria === valor}
                    onClick={() => setCategoria(valor)}
                    className={cn(
                      'h-10 shrink-0 whitespace-nowrap rounded-lg px-3 font-body text-[15px]',
                      categoria === valor ? 'bg-white font-semibold text-stone-900 shadow-sm' : 'text-stone-600'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="flex items-center justify-between px-1 font-label text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Tus respuestas configuradas <span className="font-body text-sm font-normal normal-case tracking-normal text-stone-400">Orden de prioridad</span>
          </p>
          {visibles.map((f) => (
            <TarjetaFaq
              key={f.id}
              faq={f}
              editando={editando === f.id}
              onEditar={() => setEditando(f.id)}
              onCerrar={() => setEditando(null)}
              onChange={(nueva) => set(faqs.map((x) => (x.id === f.id ? nueva : x)))}
              onEliminar={() => {
                set(faqs.filter((x) => x.id !== f.id));
                setEditando(null);
              }}
            />
          ))}
          {!visibles.length && (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
              <Icon name="quiz" className="text-4xl text-stone-300" />
              <p className="mt-2 font-body text-[15px] text-stone-600">
                {faqs.length ? 'Ninguna pregunta coincide con la búsqueda.' : 'Todavía no hay preguntas frecuentes. Agrega la primera: lo que más te preguntan por WhatsApp.'}
              </p>
              {!faqs.length && (
                <button
                  type="button"
                  onClick={() => agregar()}
                  className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 font-body text-[15px] font-semibold text-white"
                >
                  <Icon name="add" className="text-xl" /> Agregar pregunta
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="mt-4 self-start lg:mt-0">
          <ProbadorFaq hayCambios={hayCambios} className="lg:sticky lg:top-6" />
        </aside>
      </div>

      {hayCambios && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,16px)+64px)] z-30 mx-auto flex w-full max-w-[390px] gap-3 border-t border-stone-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={enviar}
            disabled={guardar.isPending}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-teal-700 font-headline text-[15px] font-bold text-white disabled:bg-stone-300"
          >
            <Icon name="check" className="text-xl" /> {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button type="button" onClick={descartar} className="h-12 rounded-full border border-stone-300 bg-white px-5 font-body text-[15px] font-semibold text-stone-800">
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}

function FaqEsqueleto() {
  return (
    <div className="md:px-6 xl:px-10" aria-busy="true">
      <div className="h-14 border-b border-stone-200 bg-white md:hidden" />
      <div className="px-4 pt-6 md:px-0 xl:pt-8">
        <div className="h-9 w-72 animate-pulse rounded-lg bg-stone-200" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-stone-200" />
        <div className="mt-6 space-y-4">
          {[160, 200, 200, 200].map((h, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-stone-200 bg-white" style={{ height: h }} />
          ))}
        </div>
      </div>
    </div>
  );
}
