import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PruebaFaq } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { StatusPill } from '@/components/StatusPill';

/**
 * «Probar a Dali» de A11: una pregunta como cliente → con cuál coincide,
 * cuánto (0–100 %) y qué contestaría. Prueba contra lo GUARDADO: si hay
 * cambios sin guardar, lo dice.
 */
export function ProbadorFaq({ hayCambios, className }: { hayCambios: boolean; className?: string }) {
  const [pregunta, setPregunta] = useState('');
  const probar = useMutation({ mutationFn: (p: string) => api.post<PruebaFaq>('/faq/probar', { pregunta: p }) });
  const r = probar.data;
  const porcentaje = r ? Math.round(r.coincidencia * 100) : 0;
  return (
    <section className={cn('rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <Icon name="play_circle" className="text-2xl" />
          </span>
          <div>
            <h2 className="font-label text-sm font-bold uppercase tracking-[0.08em] text-stone-900">Probar a Dali</h2>
            <p className="mt-0.5 font-body text-sm text-stone-500">Simulador de respuesta en WhatsApp</p>
          </div>
        </div>
        <StatusPill tono="teal" className="shrink-0">
          Online
        </StatusPill>
      </div>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (pregunta.trim()) probar.mutate(pregunta.trim());
        }}
      >
        <label htmlFor="faq-prueba" className="font-body text-[15px] font-semibold text-stone-800">
          Escribe una pregunta como cliente…
        </label>
        <div className="relative mt-2">
          <input
            id="faq-prueba"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            placeholder="sábados atienden?"
            className="h-12 w-full rounded-xl border border-stone-200 bg-white pl-4 pr-12 font-body text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
          />
          <button
            type="submit"
            aria-label="Probar"
            disabled={!pregunta.trim() || probar.isPending}
            className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-teal-700 hover:bg-teal-50 disabled:opacity-40"
          >
            <Icon name="send" className="text-xl" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between font-body text-sm text-stone-500">
          <span>{hayCambios ? 'Prueba contra lo guardado: guarda primero para incluir tus cambios' : 'Contra las preguntas guardadas'}</span>
          {(pregunta || r) && (
            <button type="button" onClick={() => (setPregunta(''), probar.reset())} className="font-semibold text-teal-800">
              Limpiar
            </button>
          )}
        </div>
      </form>

      {probar.isPending && <p className="mt-4 font-body text-sm text-stone-500">Buscando la pregunta más parecida…</p>}
      {r && !probar.isPending && (
        <div className="mt-4 space-y-4">
          <div className={cn('rounded-xl border p-4', r.responde ? 'border-teal-200 bg-teal-50/60' : 'border-stone-200 bg-stone-50')}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-label text-xs font-bold uppercase tracking-[0.1em] text-stone-700">{r.responde ? 'Coincidencia detectada' : 'Sin coincidencia suficiente'}</p>
              <StatusPill tono={r.responde ? 'teal' : 'stone'} punto={false}>
                <Icon name={r.responde ? 'verified' : 'help_outline'} className="text-sm" /> {porcentaje} %
              </StatusPill>
            </div>
            {r.faq ? (
              <>
                <p className="mt-2 font-body text-sm text-stone-500">Pregunta {r.responde ? 'asociada' : 'más cercana'}:</p>
                <p className="font-body text-[15px] font-semibold text-stone-900">{r.faq.pregunta}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                  <div className={cn('h-full rounded-full', r.responde ? 'bg-teal-700' : 'bg-stone-400')} style={{ width: `${porcentaje}%` }} />
                </div>
              </>
            ) : (
              <p className="mt-2 font-body text-[15px] text-stone-600">No hay preguntas activas con las que comparar.</p>
            )}
            <p className="mt-2 font-mono text-xs text-stone-500">{r.motor === 'semantico' ? 'Por significado (modelo local)' : 'Por palabras en común (sin modelo local)'}</p>
          </div>
          <div>
            <p className="flex items-center justify-between font-body text-[15px] font-semibold text-stone-800">
              Respuesta que daría Dali <span className="font-mono text-xs font-normal text-stone-500">Modo estricto</span>
            </p>
            {r.responde && r.respuesta ? (
              <div className="mt-2 rounded-xl rounded-tr-sm border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="font-body text-[15px] leading-relaxed text-stone-900">«{r.respuesta}»</p>
                <p className="mt-1 flex items-center justify-end gap-1 font-mono text-[11px] text-stone-500">
                  ahora <Icon name="done_all" className="text-sm text-teal-600" />
                </p>
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-stone-300 px-4 py-3 font-body text-[15px] text-stone-600">
                Dali no contestaría con una pregunta frecuente: seguiría con el guion (y si está fuera de tema, lo dice). Agrega esta pregunta o una variante parecida.
              </p>
            )}
          </div>
        </div>
      )}
      {probar.isError && <p className="mt-4 font-body text-sm text-red-700">No se pudo probar. Intenta de nuevo.</p>}
    </section>
  );
}
